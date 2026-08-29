import "server-only";
import { getServerClient } from "@/lib/supabase/server";
import { canonicalItemName } from "@/lib/analytics/clean-sales";

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

/**
 * Fetch EVERY `sales_entry_items` row for the given entries, paging past
 * PostgREST's 1000-row cap. A busy month is several thousand item rows, so a
 * single `.select()` silently truncates — undercounting sales and zeroing items
 * whose rows sort past the cap. Paged in 1000s, ordered by `id` for stable paging.
 */
async function fetchAllSaleItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s: any,
  entryIds: string[],
  columns: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const PAGE = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await s
      .from("sales_entry_items")
      .select(columns)
      .in("entry_id", entryIds)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[analytics:sales] fetchAllSaleItems", error.message);
      break;
    }
    if (data?.length) all.push(...data);
    if (!data || data.length < PAGE) break;
  }
  return all;
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

/**
 * Per-item, per-day sold quantities across the range (from optional per-item rows).
 * Used to suppress "seen but not bought" on days an item actually sold. Names are
 * left as stored (already normalized on import); the caller re-normalizes to match
 * against PostHog's raw menu names.
 */
export type SoldItemDay = { name: string; date: string; qty: number; revenue: number };

export async function getSoldItemsByDay(range: DateRange): Promise<SoldItemDay[]> {
  const s = await db();
  const { data: entries, error: e1 } = await s
    .from("sales_entries")
    .select("id, entry_date")
    .gte("entry_date", range.from)
    .lte("entry_date", range.to);
  if (e1 || !entries?.length) return [];

  const idToDate = new Map<string, string>(
    (entries as { id: string; entry_date: string }[]).map((e) => [e.id, e.entry_date])
  );
  const data = await fetchAllSaleItems(s, [...idToDate.keys()], "entry_id, item_name, qty, revenue");

  const byKey = new Map<string, SoldItemDay>();
  for (const row of (data ?? []) as { entry_id: string; item_name: string; qty: number; revenue: number | null }[]) {
    const date = idToDate.get(row.entry_id);
    if (!date) continue;
    const name = canonicalItemName(row.item_name);
    const key = `${date} ${name}`;
    const cur = byKey.get(key) ?? { name, date, qty: 0, revenue: 0 };
    cur.qty += Number(row.qty) || 0;
    // Carried alongside qty so day-level MARGIN can be computed without a second
    // pass over the same rows (see lib/analytics/menu-matrix + the margin
    // pattern family). Existing callers read name/date/qty and ignore it.
    cur.revenue += Number(row.revenue) || 0;
    byKey.set(key, cur);
  }
  return [...byKey.values()];
}

// ---------- per-day item drill-down ----------

export type DayItemDetail = {
  name: string;
  qty: number;
  revenue: number;
  /** The item's average qty per recorded day across the baseline window. */
  baselineQty: number;
  /** Percent change vs that average; null when the item has no baseline (new). */
  deltaPct: number | null;
  /** ₺ the day gained or lost on this item vs its own normal: (qty − baseline) × unit price. */
  impact: number;
  /** Recorded baseline days the item sold on at all — separates a staple from a one-off. */
  daysSeen: number;
};

export type SalesDayDetail = {
  date: string;
  /** The day's entered total, and the sum of its item rows (they can differ). */
  total: number | null;
  covers: number | null;
  itemRevenue: number;
  items: DayItemDetail[];
  baseline: { from: string; to: string; days: number; avgRevenue: number };
  /** False when the day has no per-item rows — a manual entry, or an import without detail. */
  hasItems: boolean;
};

/** How far back the "is this normal for this item?" baseline looks. */
const BASELINE_DAYS = 28;

/**
 * One day, item by item, against each item's own recent normal.
 *
 * The sales log could only ever answer "the 10th was down ₺8.400" — never WHICH
 * items did that, which is the only version of the question an owner can act on.
 * So each item is compared to its own average over the recorded days before it, and
 * carries the ₺ that difference is worth. Two consequences make it actually usable:
 *
 *  - items that sold on the baseline days but NOT on this one are INCLUDED at qty 0.
 *    A dish that simply didn't sell is the most common cause of a drop, and it is
 *    invisible in a list built only from the day's own rows.
 *  - the baseline divides by RECORDED days, never calendar days. A window
 *    containing an un-imported week would otherwise halve every average and report
 *    a good day as a spike.
 */
export async function getSalesDayDetail(entryDate: string): Promise<SalesDayDetail | null> {
  const s = await db();

  const from = (() => {
    const d = new Date(`${entryDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - BASELINE_DAYS);
    return d.toISOString().slice(0, 10);
  })();

  const { data: entries, error } = await s
    .from("sales_entries")
    .select("id, entry_date, total_sales, covers")
    .gte("entry_date", from)
    .lte("entry_date", entryDate);
  if (error) {
    console.error("[analytics:sales] getSalesDayDetail", error.message);
    return null;
  }

  const rows = (entries ?? []) as { id: string; entry_date: string; total_sales: number; covers: number | null }[];
  const target = rows.find((r) => r.entry_date === entryDate);
  if (!target) return null;

  const baselineRows = rows.filter((r) => r.entry_date !== entryDate);
  const baselineDays = baselineRows.length;
  const baselineDates = baselineRows.map((r) => r.entry_date).sort();
  const baseline = {
    from: baselineDates[0] ?? entryDate,
    to: baselineDates[baselineDates.length - 1] ?? entryDate,
    days: baselineDays,
    avgRevenue: baselineDays > 0 ? baselineRows.reduce((sum, r) => sum + Number(r.total_sales), 0) / baselineDays : 0,
  };

  const idToDate = new Map(rows.map((r) => [r.id, r.entry_date]));
  const itemRows = await fetchAllSaleItems(s, [...idToDate.keys()], "entry_id, item_name, qty, revenue");

  // Per item: the target day's figures, and the baseline totals behind them.
  type Acc = { qty: number; revenue: number; baseQty: number; baseRevenue: number; daysSeen: number };
  const acc = new Map<string, Acc>();
  const at = (name: string) => {
    const cur = acc.get(name) ?? { qty: 0, revenue: 0, baseQty: 0, baseRevenue: 0, daysSeen: 0 };
    if (!acc.has(name)) acc.set(name, cur);
    return cur;
  };
  for (const row of itemRows as { entry_id: string; item_name: string; qty: number; revenue: number | null }[]) {
    const date = idToDate.get(row.entry_id);
    if (!date) continue;
    const qty = Number(row.qty) || 0;
    const revenue = Number(row.revenue) || 0;
    const a = at(canonicalItemName(row.item_name));
    if (date === entryDate) {
      a.qty += qty;
      a.revenue += revenue;
    } else {
      a.baseQty += qty;
      a.baseRevenue += revenue;
      if (qty > 0) a.daysSeen++;
    }
  }

  const items: DayItemDetail[] = [];
  for (const [name, a] of acc) {
    const baselineQty = baselineDays > 0 ? a.baseQty / baselineDays : 0;
    // An item absent from both the day and the baseline is noise from a stray row.
    if (a.qty === 0 && baselineQty < 1) continue;
    // Unit price: the day's own when it sold, else its baseline average — needed to
    // put a ₺ figure on an item that sold nothing today.
    const unit =
      a.qty > 0 && a.revenue > 0
        ? a.revenue / a.qty
        : a.baseQty > 0 && a.baseRevenue > 0
          ? a.baseRevenue / a.baseQty
          : 0;
    items.push({
      name,
      qty: a.qty,
      revenue: a.revenue,
      baselineQty: Math.round(baselineQty * 10) / 10,
      deltaPct: baselineQty > 0 ? Math.round(((a.qty - baselineQty) / baselineQty) * 100) : null,
      impact: (a.qty - baselineQty) * unit,
      daysSeen: a.daysSeen,
    });
  }

  return {
    date: entryDate,
    total: Number(target.total_sales),
    covers: target.covers,
    itemRevenue: items.reduce((sum, i) => sum + i.revenue, 0),
    items: items.sort((a, b) => b.revenue - a.revenue),
    baseline,
    hasItems: items.some((i) => i.qty > 0),
  };
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
  const data = await fetchAllSaleItems(s, ids, "item_name, qty, revenue");

  const byName = new Map<string, { item_name: string; qty: number; revenue: number }>();
  for (const row of (data ?? []) as SalesEntryItem[]) {
    // Fold kitchen-name variants onto the menu name so sales line up with engagement.
    const name = canonicalItemName(row.item_name);
    const cur = byName.get(name) ?? { item_name: name, qty: 0, revenue: 0 };
    cur.qty += Number(row.qty) || 0;
    cur.revenue += Number(row.revenue) || 0;
    byName.set(name, cur);
  }
  return [...byName.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}
