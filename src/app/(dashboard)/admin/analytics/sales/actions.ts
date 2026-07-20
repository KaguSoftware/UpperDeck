"use server";

import * as XLSX from "xlsx";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import { notifyOk, notifyErr } from "@/lib/admin/notify";
import { cleanItemRows, type RawItemRow } from "@/lib/analytics/clean-sales";
import { detectPosSheet, parseGelirMerkezi, toIsoDate, num } from "@/lib/analytics/parse-pos";

const SALES_PATH = "/admin/analytics/sales";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/** yyyy-mm-dd → dd.MM.yyyy (Turkish date style), string-only so no TZ shifts. */
function fmtDot(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Compact span label for the import toast: "01.04.2026 – 30.04.2026", or a single date. */
function fmtSpan(dates: string[]): string {
  if (!dates.length) return "";
  const sorted = [...dates].sort();
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  return from === to ? fmtDot(from) : `${fmtDot(from)} – ${fmtDot(to)}`;
}

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

/**
 * Replace the per-item rows for a set of entries, then insert the cleaned rows.
 * Shared by both import paths. Returns the clean stats for the success message.
 */
async function persistItems(
  s: AnyClient,
  dateToId: Map<string, string>,
  rawItems: { entry_date: string; item_name: string; qty: number; revenue: number | null }[]
) {
  const entryIds = [...dateToId.values()];
  if (!entryIds.length) return null;

  const inserts: RawItemRow[] = [];
  for (const r of rawItems) {
    const entry_id = dateToId.get(r.entry_date);
    if (!entry_id) continue;
    inserts.push({ entry_id, item_name: r.item_name, qty: r.qty, revenue: r.revenue });
  }

  const cleaned = cleanItemRows(inserts);
  // Replace existing item rows for these entries, then insert fresh.
  await s.from("sales_entry_items").delete().in("entry_id", entryIds);
  if (cleaned.rows.length) {
    const { error } = await s.from("sales_entry_items").insert(cleaned.rows);
    if (error) console.error("[salesImport] items insert failed", error.message);
  }
  return cleaned.stats;
}

/**
 * Import sales from an uploaded .xlsx/.csv. Two formats are auto-detected:
 *
 *  - **Gelir Merkezi Detaylar** (real POS export): per-item, per-day rows — dates,
 *    quantities and revenue all come from the file, so per-day entries and item
 *    breakdowns are derived directly.
 *  - **Simple template**: a "Sales" sheet (date, total_sales, covers) + optional
 *    "Items" sheet (date, item_name, qty, revenue).
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

  // ---- Real POS export: per-item-per-day "Gelir Merkezi Detaylar" ----
  const detected = detectPosSheet(wb);
  if (detected.format === "gelir-merkezi" && detected.sheetName) {
    const parsed = parseGelirMerkezi(wb, detected.sheetName);
    if (parsed.entries.length === 0) {
      return notifyErr(SALES_PATH, "Geçerli satır bulunamadı");
    }

    const { data: upserted, error } = await s
      .from("sales_entries")
      .upsert(
        parsed.entries.map((e) => ({ ...e, source: "excel", created_by: profile.id })),
        { onConflict: "entry_date" }
      )
      .select("id, entry_date");

    if (error) {
      console.error("[salesImport] upsert failed", error.message);
      return notifyErr(SALES_PATH, "İçe aktarılamadı");
    }

    const dateToId = new Map<string, string>(
      (upserted as { id: string; entry_date: string }[]).map((e) => [e.entry_date, e.id])
    );
    const stats = await persistItems(s, dateToId, parsed.items);

    const junk = (stats?.modifiersDropped ?? 0) + (stats?.notesDropped ?? 0) + (stats?.zeroDropped ?? 0);
    const span = fmtSpan(parsed.entries.map((e) => e.entry_date));
    const parts = [`${span} · ${parsed.meta.days} gün içe aktarıldı`, `${parsed.meta.itemRows} kalem satırı`];
    if (parsed.meta.fractionalRounded) parts.push(`${parsed.meta.fractionalRounded} ondalık adet yuvarlandı`);
    if (junk) parts.push(`${junk} gereksiz satır temizlendi`);
    if (stats?.duplicatesMerged) parts.push(`${stats.duplicatesMerged} tekrar birleştirildi`);
    return notifyOk(SALES_PATH, parts.join(", "));
  }

  // ---- Simple template: "Sales" sheet + optional "Items" sheet ----
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

    const rawItems: { entry_date: string; item_name: string; qty: number; revenue: number | null }[] = [];
    for (const r of itemRows) {
      const date = toIsoDate(r.date ?? r.Date ?? r.tarih);
      const name = String(r.item_name ?? r.item ?? r.urun ?? "").trim();
      const qty = num(r.qty ?? r.adet);
      if (!date || !name || qty == null) continue;
      rawItems.push({ entry_date: date, item_name: name, qty: Math.round(qty), revenue: num(r.revenue ?? r.gelir) });
    }
    cleanStats = await persistItems(s, dateToId, rawItems);
  }

  const junk =
    (cleanStats?.modifiersDropped ?? 0) + (cleanStats?.notesDropped ?? 0) + (cleanStats?.zeroDropped ?? 0);
  const span = fmtSpan(entries.map((e) => e.entry_date));
  const parts = [`${span} · ${entries.length} gün içe aktarıldı`];
  if (skipped) parts.push(`${skipped} satır atlandı`);
  if (junk) parts.push(`${junk} gereksiz satır temizlendi`);
  if (cleanStats?.duplicatesMerged) parts.push(`${cleanStats.duplicatesMerged} tekrar birleştirildi`);
  return notifyOk(SALES_PATH, parts.join(", "));
}
