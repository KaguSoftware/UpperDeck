/**
 * POS export parsing for the real-sales import.
 *
 * Pure module — no Supabase, no `server-only` — so it can be unit-tested / dry-run
 * from a plain node script against a real workbook before anything touches the DB.
 *
 * Two shapes are supported:
 *  - **"gelir-merkezi"**: the real POS "Gelir Merkezi Detaylar" report, one row per
 *    item PER DAY. Dates and per-item quantities/revenue are all in the file, so we
 *    derive per-day `sales_entries` + `sales_entry_items` directly.
 *  - **"simple"**: the hand-made template (a "Sales" sheet with date/total_sales/covers
 *    columns, optional "Items" sheet). Handled by the caller's original code path.
 */
import * as XLSX from "xlsx";
import { isNoteLine } from "@/lib/analytics/clean-sales";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/** Normalize an Excel cell date/string to yyyy-mm-dd (shared by both import paths). */
export function toIsoDate(v: unknown): string | null {
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

/** Parse a possibly-formatted numeric cell ("1.234,50", "₺500") to a number, or null. */
export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const n = Number(String(v).replace(/[^0-9.,-]/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export type PosFormat = "gelir-merkezi" | "simple" | "summary";

export type ParsedEntry = { entry_date: string; total_sales: number };
export type ParsedItem = { entry_date: string; item_name: string; qty: number; revenue: number | null };
export type ParseMeta = { sheetName: string; days: number; itemRows: number; fractionalRounded: number };
export type ParsedPos = { entries: ParsedEntry[]; items: ParsedItem[]; meta: ParseMeta };

// Column indices in the "Gelir Merkezi Detaylar" sheet (0-based, positional — the
// Turkish headers aren't stable enough to match by name). Verified against a real
// April 2026 export: 3728 rows / 30 days / 483 items.
const COL = { day: 5, month: 6, year: 7, serial: 4, name: 13, qty: 15, gross: 16 } as const;

/** True when a sheet name looks like the per-item-per-day POS report. */
function isGelirMerkeziName(name: string): boolean {
  const n = name.toLocaleLowerCase("tr");
  // Tolerate the "5 - " prefix and the Ana/Alt summary variants (which we skip:
  // those are aggregates, not the per-item detail we want).
  return n.includes("gelir merkezi detaylar") && !n.includes("ana") && !n.includes("alt");
}

/**
 * The monthly "Genel Satış Raporu" — a single-period financial summary (one
 * "Toplam Satış" figure, payment/discount/expense breakdowns). It has NO per-day
 * or per-item rows, so it can't feed the daily/item analytics: we detect it to
 * reject with a clear "wrong report" message instead of a generic parse failure.
 */
function isSummaryName(name: string): boolean {
  return name.toLocaleLowerCase("tr").includes("genel satış raporu");
}

/**
 * Pick the import strategy for a workbook. Returns the detected format and, for
 * "gelir-merkezi", the matching sheet name.
 */
export function detectPosSheet(wb: XLSX.WorkBook): { format: PosFormat; sheetName?: string } {
  const match = wb.SheetNames.find(isGelirMerkeziName);
  if (match) return { format: "gelir-merkezi", sheetName: match };
  if (wb.SheetNames.some(isSummaryName)) return { format: "summary" };
  return { format: "simple" };
}

/**
 * Parse the "Gelir Merkezi Detaylar" sheet into per-day entries + per-item rows.
 *
 * - Date comes from Yıl-Ay-Gün, falling back to the Excel serial (`Çalışma Günü`).
 * - Quantities are rounded (the POS emits artifacts like 18.9997 → 19).
 * - Revenue per item = `Tutar` (gross); each day's `total_sales` is the sum of its
 *   item `Tutar` values. Same-item rows within a day (price tiers) are left as
 *   separate ParsedItem rows — the caller's `cleanItemRows` merges them by name.
 */
export function parseGelirMerkezi(wb: XLSX.WorkBook, sheetName: string): ParsedPos {
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet ?? {}, { header: 1, defval: "", raw: true });

  const items: ParsedItem[] = [];
  const dailyTotal = new Map<string, number>();
  let fractionalRounded = 0;

  // Row 0 is the header; skip it.
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    const name = String(r[COL.name] ?? "").trim();
    if (!name) continue;

    // Date: prefer Yıl-Ay-Gün, fall back to the Excel serial column.
    const y = num(r[COL.year]);
    const m = num(r[COL.month]);
    const d = num(r[COL.day]);
    let entry_date: string | null = null;
    if (y && m && d) {
      entry_date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    if (!entry_date || !dateRe.test(entry_date)) {
      entry_date = toIsoDate(r[COL.serial]);
    }
    if (!entry_date || !dateRe.test(entry_date)) continue;

    const rawQty = num(r[COL.qty]);
    if (rawQty == null) continue;
    const qty = Math.round(rawQty);
    if (Math.abs(rawQty - qty) > 1e-6) fractionalRounded++;
    if (qty <= 0) continue;

    const revenue = num(r[COL.gross]);

    items.push({ entry_date, item_name: name, qty, revenue });
    // Order-note lines ("Mesaj", "Müşteri Notu") aren't sold products — keep them
    // out of the day's revenue. `cleanItemRows` drops them from the item list too.
    if (!isNoteLine(name)) {
      dailyTotal.set(entry_date, (dailyTotal.get(entry_date) ?? 0) + (revenue ?? 0));
    }
  }

  const entries: ParsedEntry[] = [...dailyTotal.entries()]
    .map(([entry_date, total]) => ({ entry_date, total_sales: Math.round(total * 100) / 100 }))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  return {
    entries,
    items,
    meta: { sheetName, days: entries.length, itemRows: items.length, fractionalRounded },
  };
}
