import "server-only";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Owner-supplied real (POS) sales — read side.
 *
 * The menu has no checkout, so revenue can't be derived from `orders`. The owner
 * enters real sales into `sales_entries` (+ optional `sales_entry_items`); these
 * helpers aggregate them for the analytics tab. All reads go through the
 * RLS-respecting server client (staff-only policy).
 *
 * The new tables aren't in the generated Database types yet, so we use a loosely
 * typed client (the same `as any` escape hatch used elsewhere in admin actions).
 */

export type DateRange = { from: string; to: string }; // ISO yyyy-mm-dd, inclusive

export type SalesEntry = {
  id: string;
  entry_date: string;
  total_sales: number;
  covers: number | null;
  source: "manual" | "excel";
  created_at: string;
};

export type SalesEntryItem = {
  id: string;
  entry_id: string;
  item_name: string;
  qty: number;
  revenue: number | null;
};

async function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await getServerClient()) as any;
}

/** All entries in range, newest first. */
export async function listSalesEntries(range: DateRange): Promise<SalesEntry[]> {
  const s = await db();
  const { data, error } = await s
    .from("sales_entries")
    .select("id, entry_date, total_sales, covers, source, created_at")
    .gte("entry_date", range.from)
    .lte("entry_date", range.to)
    .order("entry_date", { ascending: false });
  if (error) {
    console.error("[analytics:sales] listSalesEntries", error.message);
    return [];
  }
  return (data ?? []).map((r: SalesEntry) => ({ ...r, total_sales: Number(r.total_sales) }));
}

/** Headline KPIs for the range. */
export async function getRealSalesSummary(range: DateRange) {
  const entries = await listSalesEntries(range);
  const totalSales = entries.reduce((s, e) => s + e.total_sales, 0);
  const totalCovers = entries.reduce((s, e) => s + (e.covers ?? 0), 0);
  const daysWithData = entries.length;
  return {
    totalSales,
    totalCovers,
    avgSpendPerCover: totalCovers > 0 ? totalSales / totalCovers : 0,
    avgDailySales: daysWithData > 0 ? totalSales / daysWithData : 0,
    daysWithData,
  };
}

/** Daily revenue series, oldest first (for charts). */
export async function getRealSalesOverTime(range: DateRange) {
  const entries = await listSalesEntries(range);
  return entries
    .slice()
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    .map((e) => ({ date: e.entry_date, revenue: e.total_sales, covers: e.covers ?? 0 }));
}

/** Top items by quantity across the range (from optional per-item rows). */
export async function getRealBestSellers(range: DateRange, limit = 10) {
  const s = await db();
  // Join through entries to honor the date range.
  const { data: entries, error: e1 } = await s
    .from("sales_entries")
    .select("id")
    .gte("entry_date", range.from)
    .lte("entry_date", range.to);
  if (e1 || !entries?.length) return [];

  const ids = entries.map((e: { id: string }) => e.id);
  const { data, error } = await s
    .from("sales_entry_items")
    .select("item_name, qty, revenue")
    .in("entry_id", ids);
  if (error) {
    console.error("[analytics:sales] getRealBestSellers", error.message);
    return [];
  }

  const byName = new Map<string, { item_name: string; qty: number; revenue: number }>();
  for (const row of (data ?? []) as SalesEntryItem[]) {
    const cur = byName.get(row.item_name) ?? { item_name: row.item_name, qty: 0, revenue: 0 };
    cur.qty += Number(row.qty) || 0;
    cur.revenue += Number(row.revenue) || 0;
    byName.set(row.item_name, cur);
  }
  return [...byName.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}
