"use server";

import * as XLSX from "xlsx";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import { notifyOk, notifyErr } from "@/lib/admin/notify";
import { cleanItemRows } from "@/lib/analytics/clean-sales";

const SALES_PATH = "/admin/analytics/sales";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const ManualSchema = z.object({
  entry_date: z.string().regex(dateRe, "Geçersiz tarih"),
  total_sales: z.coerce.number().min(0, "Tutar negatif olamaz"),
  covers: z
    .union([z.coerce.number().int().min(0), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** Upsert one day's sales (manual form). Re-saving a date overwrites it. */
export async function upsertSalesEntry(formData: FormData) {
  const { supabase, profile } = await requireRole("dev");

  const parsed = ManualSchema.safeParse({
    entry_date: formData.get("entry_date"),
    total_sales: formData.get("total_sales"),
    covers: formData.get("covers") ?? "",
  });
  if (!parsed.success) {
    return notifyErr(SALES_PATH, parsed.error.issues[0]?.message ?? "Geçersiz veri");
  }

  const s = supabase as AnyClient;
  const { error } = await s.from("sales_entries").upsert(
    {
      entry_date: parsed.data.entry_date,
      total_sales: parsed.data.total_sales,
      covers: parsed.data.covers,
      source: "manual",
      created_by: profile.id,
    },
    { onConflict: "entry_date" }
  );

  if (error) {
    console.error("[salesEntry] upsert failed", error.message);
    return notifyErr(SALES_PATH, "Kaydedilemedi");
  }
  return notifyOk(SALES_PATH, "Satış kaydedildi");
}

export async function deleteSalesEntry(formData: FormData) {
  const { supabase } = await requireRole("dev");
  const id = String(formData.get("id") ?? "");
  if (!id) return notifyErr(SALES_PATH, "Kayıt bulunamadı");

  const s = supabase as AnyClient;
  const { error } = await s.from("sales_entries").delete().eq("id", id);
  if (error) {
    console.error("[salesEntry] delete failed", error.message);
    return notifyErr(SALES_PATH, "Silinemedi");
  }
  return notifyOk(SALES_PATH, "Kayıt silindi");
}

// Normalize an Excel cell date/string to yyyy-mm-dd.
function toIsoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF?.parse_date_code?.(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const str = String(v).trim();
  if (dateRe.test(str)) return str;
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.,-]/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

/**
 * Import sales from an uploaded .xlsx/.csv.
 * Sheet "Sales" (or first sheet): columns date, total_sales, covers (optional).
 * Optional sheet "Items": columns date, item_name, qty, revenue.
 */
export async function importSalesExcel(formData: FormData) {
  const { supabase, profile } = await requireRole("dev");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return notifyErr(SALES_PATH, "Dosya seçilmedi");
  }

  let wb: XLSX.WorkBook;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    wb = XLSX.read(buf, { type: "buffer" });
  } catch (err) {
    console.error("[salesImport] parse failed", err);
    return notifyErr(SALES_PATH, "Dosya okunamadı");
  }

  const s = supabase as AnyClient;

  // ---- daily rows ----
  const salesSheet = wb.Sheets["Sales"] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(salesSheet ?? {}, { defval: "" });

  const entries: { entry_date: string; total_sales: number; covers: number | null }[] = [];
  let skipped = 0;
  for (const r of rows) {
    const date = toIsoDate(r.date ?? r.Date ?? r.tarih ?? r.Tarih);
    const total = num(r.total_sales ?? r["total sales"] ?? r.total ?? r.toplam ?? r.Toplam);
    if (!date || total == null) {
      skipped++;
      continue;
    }
    entries.push({ entry_date: date, total_sales: total, covers: num(r.covers ?? r.kisi ?? r.Kisi) });
  }

  if (entries.length === 0) {
    return notifyErr(SALES_PATH, "Geçerli satır bulunamadı");
  }

  const { data: upserted, error } = await s
    .from("sales_entries")
    .upsert(
      entries.map((e) => ({ ...e, source: "excel", created_by: profile.id })),
      { onConflict: "entry_date" }
    )
    .select("id, entry_date");

  if (error) {
    console.error("[salesImport] upsert failed", error.message);
    return notifyErr(SALES_PATH, "İçe aktarılamadı");
  }

  // ---- optional per-item rows ----
  let cleanStats: import("@/lib/analytics/clean-sales").CleanStats | null = null;
  const itemsSheet = wb.Sheets["Items"];
  if (itemsSheet && upserted?.length) {
    const dateToId = new Map<string, string>(
      (upserted as { id: string; entry_date: string }[]).map((e) => [e.entry_date, e.id])
    );
    const itemRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(itemsSheet, { defval: "" });
    const entryIds = [...dateToId.values()];

    // Replace existing item rows for these entries, then insert fresh.
    await s.from("sales_entry_items").delete().in("entry_id", entryIds);

    const itemInserts: { entry_id: string; item_name: string; qty: number; revenue: number | null }[] = [];
    for (const r of itemRows) {
      const date = toIsoDate(r.date ?? r.Date ?? r.tarih);
      const entry_id = date ? dateToId.get(date) : undefined;
      const name = String(r.item_name ?? r.item ?? r.urun ?? "").trim();
      const qty = num(r.qty ?? r.adet);
      if (!entry_id || !name || qty == null) continue;
      itemInserts.push({ entry_id, item_name: name, qty, revenue: num(r.revenue ?? r.gelir) });
    }
    const cleaned = cleanItemRows(itemInserts);
    cleanStats = cleaned.stats;
    if (cleaned.rows.length) {
      const { error: itemErr } = await s.from("sales_entry_items").insert(cleaned.rows);
      if (itemErr) console.error("[salesImport] items insert failed", itemErr.message);
    }
  }

  const junk = (cleanStats?.modifiersDropped ?? 0) + (cleanStats?.zeroDropped ?? 0);
  const parts = [`${entries.length} gün içe aktarıldı`];
  if (skipped) parts.push(`${skipped} satır atlandı`);
  if (junk) parts.push(`${junk} gereksiz satır temizlendi`);
  if (cleanStats?.duplicatesMerged) parts.push(`${cleanStats.duplicatesMerged} tekrar birleştirildi`);
  return notifyOk(SALES_PATH, parts.join(", "));
}
