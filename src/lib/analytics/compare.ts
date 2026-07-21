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
import { previousRange } from "@/lib/analytics/range";
import { canonicalItemName } from "@/lib/analytics/clean-sales";

/** Shared join key for matching PostHog menu names against POS item names.
 *  Uses the canonical name so kitchen-name variants (see NAME_ALIASES) line up. */
const nameKey = (name: string) => canonicalItemName(name).toLocaleLowerCase("tr");

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
  convPct: number; // views → actually SOLD, in percent (can exceed 100 when an item
  // sells more than its detail page is opened — common for staples ordered verbally)
};

/**
 * One row per item across the whole funnel: distinct-session views → cart adds
 * (PostHog) → actually sold (owner-entered POS items). Merged by item name —
 * the only key shared by both sources. Sorted by views so the "looked at a lot
 * but never bought" items surface without cross-referencing three charts.
 */
export async function getItemConversion(range: DateRange, limit = 15): Promise<ItemConversion[]> {
  // Fetch at least the display limit, wider when the caller wants a deeper pool
  // (e.g. Hidden Gems needs the low-view tail, not just the top 50).
  const pool = Math.max(50, limit);
  const [viewed, carted, sold] = await Promise.all([
    getTopViewedItems(range, pool),
    getTopCartedItems(range, pool),
    getRealBestSellers(range, pool),
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
    // Conversion is views → actually SOLD (real POS qty), not views → cart adds:
    // the menu has no checkout, so add-to-cart is only a weak intent proxy while
    // entered sales are the ground truth for demand.
    .map((r) => ({ ...r, convPct: r.views > 0 ? Math.round((r.sold / r.views) * 100) : 0 }))
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

export type HiddenGem = { name: string; views: number; sold: number; convPct: number };

/**
 * "Hidden gems": items that convert views into real SALES at a high rate but get
 * little exposure — few diners find them, yet most who do buy. The inverse of the
 * dead-item list, and a direct menu-placement lever: move these up / feature them.
 */
export async function getHiddenGems(range: DateRange, limit = 6): Promise<HiddenGem[]> {
  const rows = await getItemConversion(range, 80); // deep pool so low-view items are kept
  const maxViews = Math.max(...rows.map((r) => r.views), 1);
  return rows
    // sells for real, has a usable sample, converts well, yet seen far less than the
    // most-viewed item (≤40% of it) — i.e. under-exposed relative to the menu's stars.
    .filter((r) => r.sold >= 2 && r.views >= 3 && r.convPct >= 50 && r.views <= maxViews * 0.4)
    .sort((a, b) => b.convPct - a.convPct || a.views - b.views)
    .slice(0, limit)
    .map((r) => ({ name: r.name, views: r.views, sold: r.sold, convPct: r.convPct }));
}

export type ItemMomentum = {
  name: string;
  current: number;
  previous: number;
  deltaPct: number | null; // null when previous = 0 (brand new)
  isNew: boolean;
};

/**
 * Per-item interest momentum: distinct-session views this period vs the previous
 * period of equal length. Surfaces rising stars and quietly fading items early,
 * instead of waiting for end-of-season totals. Based on views (always available);
 * a volume floor keeps a 1→3 blip from being called a trend.
 */
export async function getItemMomentum(
  range: DateRange,
  limit = 6
): Promise<{ rising: ItemMomentum[]; fading: ItemMomentum[] }> {
  const prev = previousRange(range);
  const [cur, old] = await Promise.all([
    getTopViewedItems(range, 60),
    getTopViewedItems(prev, 60),
  ]);

  const oldByKey = new Map(old.map((o) => [nameKey(o.name), o.count]));
  const seen = new Set<string>();
  const rows: ItemMomentum[] = [];
  for (const c of cur) {
    const k = nameKey(c.name);
    seen.add(k);
    const previous = oldByKey.get(k) ?? 0;
    const deltaPct = previous > 0 ? Math.round(((c.count - previous) / previous) * 100) : null;
    rows.push({ name: c.name, current: c.count, previous, deltaPct, isNew: previous === 0 });
  }
  // Items that fell out of the current top list entirely still count as fading.
  for (const o of old) {
    const k = nameKey(o.name);
    if (seen.has(k)) continue;
    rows.push({ name: o.name, current: 0, previous: o.count, deltaPct: -100, isNew: false });
  }

  const MIN = 5; // ignore items too small in both periods to read a trend from
  const rising = rows
    .filter((r) => r.current >= MIN && (r.isNew || (r.deltaPct != null && r.deltaPct >= 25)))
    .sort((a, b) => (b.deltaPct ?? 9999) - (a.deltaPct ?? 9999) || b.current - a.current)
    .slice(0, limit);
  const fading = rows
    // previous >= MIN implies !isNew (isNew ⟺ previous === 0), so it's not repeated.
    .filter((r) => r.previous >= MIN && r.deltaPct != null && r.deltaPct <= -25)
    .sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0))
    .slice(0, limit);
  return { rising, fading };
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
