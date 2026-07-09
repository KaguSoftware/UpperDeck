import "server-only";
import { getRealSalesOverTime, getRealBestSellers, type DateRange } from "@/lib/analytics/sales";
import { getDailyEngagement, getTopViewedItems, getTopCartedItems } from "@/lib/analytics/posthog";
import { normalizeItemName } from "@/lib/analytics/clean-sales";
import { getServerClient } from "@/lib/supabase/server";

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

export type AbandonedView = {
  name: string;
  /** Distinct diner sessions that viewed the item in the range. */
  views: number;
};

/**
 * Build a normalized alias → canonical-name map from the menu so PostHog view
 * names (which are locale-specific: name_en for EN diners, name_tr for TR) both
 * resolve to one key that can be matched against Turkish POS sales names.
 */
async function buildNameBridge(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (await getServerClient()) as any;
    const { data } = await s.from("menu_items").select("name_en, name_tr");
    for (const row of (data ?? []) as { name_en: string; name_tr: string }[]) {
      // Canonical key = normalized Turkish name (matches POS/sales rows).
      const canonical = normalizeItemName(row.name_tr || row.name_en || "");
      if (!canonical) continue;
      for (const alias of [row.name_en, row.name_tr]) {
        const k = normalizeItemName(alias || "");
        if (k) map.set(k, canonical);
      }
    }
  } catch (err) {
    console.error("[analytics:compare] name bridge failed", err);
  }
  return map;
}

/**
 * "Seen but not bought": items that were VIEWED on the menu during the range but
 * did NOT actually sell (no matching row in the entered POS sales). Cart activity
 * is irrelevant — most diners never use the cart, so real sales are the truth.
 *
 * Names are matched through a menu_items bridge (EN/TR → canonical), so a diner
 * who viewed the English name still matches the Turkish POS sale. Returns [] when
 * no per-item sales were entered for the range (otherwise every viewed item would
 * look "not sold" purely because sales data is missing).
 */
export async function getAbandonedItems(range: DateRange, limit = 12): Promise<AbandonedView[]> {
  const [viewed, sold, bridge] = await Promise.all([
    getTopViewedItems(range, 200),
    getRealBestSellers(range, 500),
    buildNameBridge(),
  ]);

  // No per-item sales entered for this range → we can't tell "not sold" apart from
  // "no data". Don't flag everything; let the UI show its empty-state note.
  if (sold.length === 0) return [];

  const canon = (name: string) => bridge.get(normalizeItemName(name)) ?? normalizeItemName(name);
  const soldSet = new Set(sold.map((s) => canon(s.item_name)));

  // Collapse locale-split view names to one canonical row, summing their views.
  const byCanon = new Map<string, { name: string; views: number }>();
  for (const v of viewed) {
    const key = canon(v.name);
    if (soldSet.has(key)) continue;
    const cur = byCanon.get(key) ?? { name: v.name, views: 0 };
    cur.views += v.count;
    byCanon.set(key, cur);
  }

  return [...byCanon.values()].sort((a, b) => b.views - a.views).slice(0, limit);
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
