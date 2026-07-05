import "server-only";
import { getRealSalesOverTime, getRealBestSellers, type DateRange } from "@/lib/analytics/sales";
import { getDailyEngagement, getTopViewedItems, getTopCartedItems } from "@/lib/analytics/posthog";

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

  const rows = new Map<string, ItemConversion>();
  const row = (name: string) => {
    const r = rows.get(name) ?? { name, views: 0, carts: 0, sold: 0, convPct: 0 };
    rows.set(name, r);
    return r;
  };
  for (const v of viewed) row(v.name).views = v.count;
  for (const c of carted) row(c.name).carts = c.count;
  for (const s of sold) row(s.item_name).sold = s.qty;

  return [...rows.values()]
    .map((r) => ({ ...r, convPct: r.views > 0 ? Math.round((r.carts / r.views) * 100) : 0 }))
    .sort((a, b) => b.views - a.views)
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
