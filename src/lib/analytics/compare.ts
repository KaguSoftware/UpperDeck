import "server-only";
import {
  getRealSalesOverTime,
  getRealBestSellers,
  getSoldItemsByDay,
  type DateRange,
} from "@/lib/analytics/sales";
import {
  getDailyEngagement,
  getTopViewedItems,
  getTopCartedItems,
  getAbandonedViewsByDay,
  type AbandonedView,
} from "@/lib/analytics/posthog";
import { normalizeItemName } from "@/lib/analytics/clean-sales";

/** Shared join key for matching PostHog menu names against POS item names. */
const nameKey = (name: string) => normalizeItemName(name).toLocaleLowerCase("tr");

/**
 * Headline correlation: real daily revenue (Supabase) vs menu engagement
 * (PostHog views + waiter calls) on one shared daily timeline.
 *
 * Days with engagement but no entered sales show revenue: null (charts render a
 * gap and the UI hints "no sales entered"). Days with sales but no engagement
 * data (PostHog absent) show zeros.
 */
export type ItemConversion = {
  name: string;
  views: number;
  carts: number;
  sold: number; // real POS qty; 0 when per-item sales weren't entered
  convPct: number; // views → carts, 0–100
};

/**
 * One row per item across the whole funnel: distinct-session views → cart adds
 * (PostHog) → actually sold (owner-entered POS items). Merged by item name —
 * the only key shared by both sources. Sorted by views so the "looked at a lot
 * but never bought" items surface without cross-referencing three charts.
 */
export async function getItemConversion(range: DateRange, limit = 15): Promise<ItemConversion[]> {
  const [viewed, carted, sold] = await Promise.all([
    getTopViewedItems(range, 50),
    getTopCartedItems(range, 50),
    getRealBestSellers(range, 50),
  ]);

  // Key by normalized name so PostHog's raw menu names line up with the POS item
  // names (already normalized on import); keep the first-seen (viewed) name for display.
  const rows = new Map<string, ItemConversion>();
  const row = (name: string) => {
    const k = nameKey(name);
    const r = rows.get(k) ?? { name, views: 0, carts: 0, sold: 0, convPct: 0 };
    if (!rows.has(k)) rows.set(k, r);
    return r;
  };
  for (const v of viewed) row(v.name).views = v.count;
  for (const c of carted) row(c.name).carts = c.count;
  for (const s of sold) row(s.item_name).sold += s.qty;

  return [...rows.values()]
    .map((r) => ({ ...r, convPct: r.views > 0 ? Math.round((r.carts / r.views) * 100) : 0 }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

/**
 * "Bakıp Almayanlar" (looked but didn't order), net of real sales.
 *
 * The menu has no checkout, so a diner routinely opens an item, closes it without
 * tapping add-to-cart, and orders it verbally — a real sale the abandoned-view
 * signal would wrongly flag. We can't correlate to the minute (POS data is
 * day-level), so we suppress at day granularity: on any day an item actually sold
 * (≥1 in `sales_entry_items`), that day's abandoned views for it are dropped.
 * Remaining views are re-aggregated per item, matching `getAbandonedViews`' shape.
 */
export async function getAbandonedViewsNet(range: DateRange, limit = 12): Promise<AbandonedView[]> {
  const [abandonedByDay, soldByDay] = await Promise.all([
    getAbandonedViewsByDay(range),
    getSoldItemsByDay(range),
  ]);

  // (normalized name + day) pairs the item sold on — those views don't count.
  const soldDays = new Set<string>();
  for (const s of soldByDay) {
    if (s.qty > 0) soldDays.add(`${nameKey(s.name)} ${s.date}`);
  }

  const byItem = new Map<string, AbandonedView>();
  for (const r of abandonedByDay) {
    if (soldDays.has(`${nameKey(r.name)} ${r.date}`)) continue;
    const cur = byItem.get(r.name) ?? { name: r.name, b5to10: 0, b10to20: 0, b20plus: 0, total: 0 };
    cur.b5to10 += r.b5to10;
    cur.b10to20 += r.b10to20;
    cur.b20plus += r.b20plus;
    cur.total += r.b5to10 + r.b10to20 + r.b20plus;
    byItem.set(r.name, cur);
  }

  return [...byItem.values()]
    .filter((v) => v.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export async function getSalesVsEngagement(range: DateRange) {
  const [sales, engagement] = await Promise.all([
    getRealSalesOverTime(range),
    getDailyEngagement(range),
  ]);

  const salesByDate = new Map(sales.map((s) => [s.date, s]));
  const engByDate = new Map(engagement.map((e) => [e.date, e]));
  const dates = [...new Set([...salesByDate.keys(), ...engByDate.keys()])].sort();

  return dates.map((date) => {
    const s = salesByDate.get(date);
    const e = engByDate.get(date);
    return {
      date,
      revenue: s ? s.revenue : null,
      covers: s ? s.covers : null,
      views: e ? e.views : 0,
      waiterCalls: e ? e.waiterCalls : 0,
    };
  });
}
