"use server";

import * as XLSX from "xlsx";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import { notifyOk, notifyErr } from "@/lib/admin/notify";
import {
  cleanItemRows,
  normalizeItemName,
  type CleanOverrides,
  type DroppedRow,
  type RawItemRow,
} from "@/lib/analytics/clean-sales";
import { detectPosSheet, parseGelirMerkezi, toIsoDate, num } from "@/lib/analytics/parse-pos";
import {
  buildImportReview,
  parseAliases,
  parseImportReview,
  parseNameList,
  type ImportReview,
  FORCE_ITEM_NAMES_SETTINGS_KEY,
  IMPORT_REVIEW_SETTINGS_KEY,
  ITEM_ALIASES_SETTINGS_KEY,
} from "@/lib/analytics/import-review";
import {
  normalizeExclusionList,
  EXCLUDED_ITEMS_SETTINGS_KEY,
} from "@/lib/analytics/exclusions";

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
  const { supabase, profile } = await requireRole(["owner", "dev"]);

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
  const { supabase } = await requireRole(["owner", "dev"]);
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

/** Read the owner's import corrections (mappings + force-kept names). */
async function loadCleanOverrides(s: AnyClient): Promise<CleanOverrides> {
  const { data } = await s
    .from("settings")
    .select("key, value")
    .in("key", [ITEM_ALIASES_SETTINGS_KEY, FORCE_ITEM_NAMES_SETTINGS_KEY]);
  const rows = (data ?? []) as { key: string; value: string }[];
  const valueOf = (key: string) => rows.find((r) => r.key === key)?.value;
  return {
    aliases: parseAliases(valueOf(ITEM_ALIASES_SETTINGS_KEY)),
    forceKeep: parseNameList(valueOf(FORCE_ITEM_NAMES_SETTINGS_KEY)),
  };
}

/** Every name currently on the menu — items + add-on options, both locales. */
async function loadMenuNames(s: AnyClient): Promise<string[]> {
  const [{ data: items, error }, { data: options }] = await Promise.all([
    s.from("menu_items").select("name_en, name_tr"),
    s.from("addon_options").select("label_en, label_tr"),
  ]);
  if (error) {
    console.warn("[salesImport] menu read failed — import review left unjudged", error.message);
    return [];
  }
  const names: string[] = [];
  for (const r of (items ?? []) as { name_en: string; name_tr: string }[]) names.push(r.name_en, r.name_tr);
  for (const r of (options ?? []) as { label_en: string; label_tr: string }[]) names.push(r.label_en, r.label_tr);
  return names.filter((n) => typeof n === "string" && n.trim());
}

/** Store the import report, replacing the previous one. Never fatal. */
async function saveImportReview(s: AnyClient, review: ImportReview) {
  const { error } = await s
    .from("settings")
    .upsert({ key: IMPORT_REVIEW_SETTINGS_KEY, value: JSON.stringify(review) }, { onConflict: "key" });
  if (error) console.warn("[salesImport] review save failed", error.message);
}

/**
 * Replace the per-item rows for a set of entries, then insert the cleaned rows.
 * Shared by both import paths.
 *
 * Also returns everything the review screen needs: the stats for the toast, the
 * rows that survived, and the lines the cleaner dropped. Nothing about an import
 * is allowed to disappear silently any more — see lib/analytics/import-review.
 */
async function persistItems(
  s: AnyClient,
  dateToId: Map<string, string>,
  rawItems: { entry_date: string; item_name: string; qty: number; revenue: number | null }[],
  overrides: CleanOverrides
): Promise<{
  stats: ReturnType<typeof cleanItemRows>["stats"];
  kept: { entry_date: string; item_name: string; qty: number; revenue: number | null }[];
  dropped: DroppedRow[];
} | null> {
  const entryIds = [...dateToId.values()];
  if (!entryIds.length) return null;

  const idToDate = new Map([...dateToId].map(([date, id]) => [id, date]));
  const inserts: RawItemRow[] = [];
  for (const r of rawItems) {
    const entry_id = dateToId.get(r.entry_date);
    if (!entry_id) continue;
    inserts.push({ entry_id, item_name: r.item_name, qty: r.qty, revenue: r.revenue });
  }

  const cleaned = cleanItemRows(inserts, overrides);
  // Replace existing item rows for these entries, then insert fresh.
  await s.from("sales_entry_items").delete().in("entry_id", entryIds);
  if (cleaned.rows.length) {
    const { error } = await s.from("sales_entry_items").insert(cleaned.rows);
    if (error) console.error("[salesImport] items insert failed", error.message);
  }

  return {
    stats: cleaned.stats,
    kept: cleaned.rows.map((r) => ({
      entry_date: idToDate.get(r.entry_id) ?? "",
      item_name: r.item_name,
      qty: r.qty,
      revenue: r.revenue,
    })),
    dropped: cleaned.dropped,
  };
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
  const { supabase, profile } = await requireRole(["owner", "dev"]);

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

  // ---- Wrong report: the monthly "Genel Satış Raporu" summary has no daily/item detail ----
  const detected = detectPosSheet(wb);
  if (detected.format === "summary") {
    return notifyErr(
      SALES_PATH,
      "Bu 'Genel Satış Raporu' aylık özet — günlük/ürün detayı yok. 'Gelir Merkezi Detaylar' raporunu yükleyin."
    );
  }

  // ---- Real POS export: per-item-per-day "Gelir Merkezi Detaylar" ----
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
    const [overrides, menuNames] = await Promise.all([loadCleanOverrides(s), loadMenuNames(s)]);
    const result = await persistItems(s, dateToId, parsed.items, overrides);

    let unmatched = 0;
    if (result) {
      const review = buildImportReview({
        kept: result.kept,
        dropped: result.dropped,
        menuNames,
        sheet: detected.sheetName,
        dateToId,
      });
      unmatched = review.totals.unmatched;
      await saveImportReview(s, review);
    }

    const stats = result?.stats;
    const junk = (stats?.modifiersDropped ?? 0) + (stats?.notesDropped ?? 0) + (stats?.zeroDropped ?? 0);
    const span = fmtSpan(parsed.entries.map((e) => e.entry_date));
    const parts = [`${span} · ${parsed.meta.days} gün içe aktarıldı`, `${parsed.meta.itemRows} kalem satırı`];
    if (parsed.meta.fractionalRounded) parts.push(`${parsed.meta.fractionalRounded} ondalık adet yuvarlandı`);
    if (junk) parts.push(`${junk} satır ayrıldı`);
    if (stats?.duplicatesMerged) parts.push(`${stats.duplicatesMerged} tekrar birleştirildi`);
    if (unmatched || junk) parts.push(`${unmatched} tanınmayan ürün — aşağıdan eşleştirin`);
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
  let unmatched = 0;
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
    const [overrides, menuNames] = await Promise.all([loadCleanOverrides(s), loadMenuNames(s)]);
    const result = await persistItems(s, dateToId, rawItems, overrides);
    cleanStats = result?.stats ?? null;
    if (result) {
      const review = buildImportReview({
        kept: result.kept,
        dropped: result.dropped,
        menuNames,
        sheet: "",
        dateToId,
      });
      unmatched = review.totals.unmatched;
      await saveImportReview(s, review);
    }
  }

  const junk =
    (cleanStats?.modifiersDropped ?? 0) + (cleanStats?.notesDropped ?? 0) + (cleanStats?.zeroDropped ?? 0);
  const span = fmtSpan(entries.map((e) => e.entry_date));
  const parts = [`${span} · ${entries.length} gün içe aktarıldı`];
  if (skipped) parts.push(`${skipped} satır atlandı`);
  if (junk) parts.push(`${junk} satır ayrıldı`);
  if (cleanStats?.duplicatesMerged) parts.push(`${cleanStats.duplicatesMerged} tekrar birleştirildi`);
  if (unmatched || junk) parts.push(`${unmatched} tanınmayan ürün — aşağıdan eşleştirin`);
  return notifyOk(SALES_PATH, parts.join(", "));
}

// ---------- Import review: map / ignore / restore ----------

/**
 * Read the stored report, apply `mutate` to the row for `name`, and write it back.
 * Returns false when there is no report or no such row — the review UI is driven
 * entirely by this document, so a stale button press must not half-apply.
 */
async function patchReviewRow(
  s: AnyClient,
  name: string,
  mutate: (review: ImportReview, index: number) => void
): Promise<boolean> {
  const { data } = await s
    .from("settings")
    .select("value")
    .eq("key", IMPORT_REVIEW_SETTINGS_KEY)
    .maybeSingle();
  const review = parseImportReview(data?.value);
  if (!review) return false;

  const key = normalizeItemName(name).toLocaleLowerCase("tr");
  const index = review.rows.findIndex((r) => normalizeItemName(r.name).toLocaleLowerCase("tr") === key);
  if (index < 0) return false;

  mutate(review, index);
  await saveImportReview(s, review);
  return true;
}

/** Merge one key/value into a stored JSON object setting. */
async function upsertSetting(s: AnyClient, key: string, value: string): Promise<boolean> {
  const { error } = await s.from("settings").upsert({ key, value }, { onConflict: "key" });
  if (error) {
    console.warn(`[salesImport] ${key} save failed`, error.message);
    return false;
  }
  return true;
}

const NameSchema = z.string().trim().min(1).max(200);

/**
 * Map an unrecognised POS line onto a real menu item.
 *
 * Three effects, all needed for the mapping to actually mean anything:
 *  1. the alias is stored, so every FUTURE import folds the line automatically;
 *  2. the rows ALREADY imported under the raw name are renamed, so the current
 *     range's figures correct themselves without a re-import;
 *  3. the report row is marked resolved.
 */
export async function mapImportedItemAction(raw: string, target: string): Promise<{ ok: boolean }> {
  const parsed = z.object({ raw: NameSchema, target: NameSchema }).safeParse({ raw, target });
  if (!parsed.success) return { ok: false };

  const { supabase } = await requireRole(["owner", "dev"]);
  const s = supabase as AnyClient;

  const rawName = normalizeItemName(parsed.data.raw);
  const targetName = normalizeItemName(parsed.data.target);
  if (rawName.toLocaleLowerCase("tr") === targetName.toLocaleLowerCase("tr")) return { ok: false };

  const { data } = await s
    .from("settings")
    .select("value")
    .eq("key", ITEM_ALIASES_SETTINGS_KEY)
    .maybeSingle();
  const aliases = parseAliases(data?.value);
  aliases[rawName.toLocaleLowerCase("tr")] = targetName;
  if (!(await upsertSetting(s, ITEM_ALIASES_SETTINGS_KEY, JSON.stringify(aliases)))) return { ok: false };

  // Rename what's already stored. Rows for the same (entry, target) now coexist;
  // every read path aggregates by name, so they sum correctly without a merge.
  const { error: renameError } = await s
    .from("sales_entry_items")
    .update({ item_name: targetName })
    .eq("item_name", rawName);
  if (renameError) console.warn("[salesImport] rename failed", renameError.message);

  await patchReviewRow(s, rawName, (review, i) => {
    review.rows[i].resolution = { action: "mapped", to: targetName, at: new Date().toISOString() };
    review.totals.unmatched = Math.max(0, review.totals.unmatched - 1);
  });

  return { ok: true };
}

/**
 * Confirm a line is genuinely not a product: add it to the analytics ignore list
 * so it stays out of every item-level view, and mark the report row handled.
 * Deliberately reuses the SAME manual ignore list the dashboard's "Ürün Yoksay"
 * menu edits, so there is one place to look and one place to undo.
 */
export async function ignoreImportedItemAction(raw: string): Promise<{ ok: boolean }> {
  const parsed = NameSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };

  const { supabase } = await requireRole(["owner", "dev"]);
  const s = supabase as AnyClient;
  const name = normalizeItemName(parsed.data);

  const { data } = await s
    .from("settings")
    .select("value")
    .eq("key", EXCLUDED_ITEMS_SETTINGS_KEY)
    .maybeSingle();
  let existing: string[] = [];
  try {
    const arr = JSON.parse(String(data?.value ?? "[]"));
    if (Array.isArray(arr)) existing = arr.map(String).filter(Boolean);
  } catch {
    existing = [];
  }
  const next = normalizeExclusionList([...existing, name]);
  if (!(await upsertSetting(s, EXCLUDED_ITEMS_SETTINGS_KEY, JSON.stringify(next)))) return { ok: false };

  await patchReviewRow(s, name, (review, i) => {
    review.rows[i].resolution = { action: "ignored", at: new Date().toISOString() };
    if (review.rows[i].status === "unmatched") {
      review.totals.unmatched = Math.max(0, review.totals.unmatched - 1);
    }
  });

  return { ok: true };
}

/**
 * "This IS a product" — undo a wrong drop.
 *
 * The cleaner's modifier/note rules are heuristics and will occasionally eat a
 * real dish. This puts the line back: the name joins the force-keep list so
 * future imports stop dropping it, and the rows this import discarded are
 * re-inserted from the report's retained detail — no re-upload needed.
 */
export async function restoreImportedItemAction(raw: string): Promise<{ ok: boolean; restored: number }> {
  const parsed = NameSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, restored: 0 };

  const { supabase } = await requireRole(["owner", "dev"]);
  const s = supabase as AnyClient;
  const name = normalizeItemName(parsed.data);
  const key = name.toLocaleLowerCase("tr");

  const { data } = await s
    .from("settings")
    .select("key, value")
    .in("key", [FORCE_ITEM_NAMES_SETTINGS_KEY, IMPORT_REVIEW_SETTINGS_KEY]);
  const rows = (data ?? []) as { key: string; value: string }[];
  const valueOf = (k: string) => rows.find((r) => r.key === k)?.value;

  const forceKeep = parseNameList(valueOf(FORCE_ITEM_NAMES_SETTINGS_KEY));
  if (!forceKeep.some((n) => normalizeItemName(n).toLocaleLowerCase("tr") === key)) forceKeep.push(name);
  if (!(await upsertSetting(s, FORCE_ITEM_NAMES_SETTINGS_KEY, JSON.stringify(forceKeep)))) {
    return { ok: false, restored: 0 };
  }

  const review = parseImportReview(valueOf(IMPORT_REVIEW_SETTINGS_KEY));
  const detail = (review?.droppedDetail ?? []).filter(
    (d) => normalizeItemName(d.item_name).toLocaleLowerCase("tr") === key
  );

  let restored = 0;
  if (detail.length) {
    const { error } = await s.from("sales_entry_items").insert(
      detail.map((d) => ({ entry_id: d.entry_id, item_name: name, qty: d.qty, revenue: d.revenue }))
    );
    // A deleted sales entry breaks the FK — the force-keep rule still applies to
    // the next import, so this is a partial success, not a failure.
    if (error) console.warn("[salesImport] restore insert failed", error.message);
    else restored = detail.length;
  }

  await patchReviewRow(s, name, (review, i) => {
    review.rows[i].resolution = { action: "restored", at: new Date().toISOString() };
    review.rows[i].status = "matched";
  });

  return { ok: true, restored };
}
