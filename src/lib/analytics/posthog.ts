import "server-only";
import { env } from "@/lib/env";
import type { DateRange } from "@/lib/analytics/sales";

/**
 * PostHog behavioral queries via the HogQL Query API.
 *
 * Every function returns an empty/zero result (never throws) when PostHog isn't
 * configured, so the analytics tab renders fine without it. Results are cached
 * briefly to avoid hammering the API on each render.
 */

const HOST = env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
const PROJECT_ID = env.POSTHOG_PROJECT_ID;
const API_KEY = env.POSTHOG_PERSONAL_API_KEY;

export function posthogConfigured(): boolean {
  return Boolean(PROJECT_ID && API_KEY);
}

type HogQLResult = { results: unknown[][]; columns?: string[] };

// Own short-lived cache instead of Next's fetch cache: Next serves STALE data
// while revalidating in the background, so a 60s auto-refresh against a 60s
// revalidate window always rendered the previous cycle's numbers — the
// dashboard looked frozen. Here an expired entry blocks for fresh data, while
// rapid re-renders within the TTL still reuse the in-flight/last result.
const queryCache = new Map<string, { at: number; result: Promise<unknown[][]> }>();
const QUERY_TTL_MS = 30_000;

/** Run a HogQL query; returns rows as arrays, or [] on any failure. */
async function hogql(query: string): Promise<unknown[][]> {
  if (!posthogConfigured()) return [];

  const hit = queryCache.get(query);
  if (hit && Date.now() - hit.at < QUERY_TTL_MS) return hit.result;

  const result = (async () => {
    try {
      const res = await fetch(`${HOST}/api/projects/${PROJECT_ID}/query/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
        cache: "no-store",
      });
      if (!res.ok) {
        console.error("[analytics:posthog] query failed", res.status, await res.text());
        return [];
      }
      const json = (await res.json()) as HogQLResult;
      return json.results ?? [];
    } catch (err) {
      console.error("[analytics:posthog] query error", err);
      return [];
    }
  })();

  queryCache.set(query, { at: Date.now(), result });
  return result;
}

// Restaurant-local timezone. All date/hour math is done in local time so
// "today", daily buckets, and peak hours line up with the real business day
// (event timestamps are stored in UTC). `sales_entries.entry_date` is already
// local, so this keeps the two data sources on the same timeline.
const TZ = "Europe/Istanbul";

// Local timestamp for the current row, in TZ. Every query filters and buckets
// on this so a 21:00 Istanbul event isn't counted as an 18:00 UTC event.
const LOCAL_TS = `toTimeZone(timestamp, '${TZ}')`;

// Events before this date are excluded from every query: earlier data is
// unreliable (waiter/bill calls from the bell sheet weren't tracked until
// 2026-07-05, and dwell tracking didn't exist), so it would skew every chart.
// Real sales (Supabase) are NOT affected — this floor is engagement-only.
const DATA_FLOOR = "2026-07-05";

// HogQL date bounds (inclusive), interpreted in local time. `to` is end-of-day.
// `from` is clamped to DATA_FLOOR; a range entirely before it yields no rows.
function bounds(range: DateRange) {
  const from = range.from < DATA_FLOOR ? DATA_FLOOR : range.from;
  return {
    from: `'${from} 00:00:00'`,
    to: `'${range.to} 23:59:59'`,
  };
}

export type NamedCount = { name: string; count: number };

/**
 * Most-viewed menu items by distinct diners. `item_viewed` fires on every modal
 * open, so counting raw events lets one curious diner inflate an item; counting
 * distinct sessions measures "how many diners looked" — a truer popularity signal.
 */
export async function getTopViewedItems(range: DateRange, limit = 10): Promise<NamedCount[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT properties.item_name AS name, count(DISTINCT $session_id) AS c
    FROM events
    WHERE event = 'item_viewed'
      AND ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
      AND name != ''
    GROUP BY name ORDER BY c DESC LIMIT ${limit}
  `);
  return rows.map((r) => ({ name: String(r[0]), count: Number(r[1]) }));
}

/**
 * Most added-to-cart items by distinct diners (item_added_to_cart). A stronger
 * purchase-intent signal than views: the diner picked it to show the waiter.
 * Comparing this against real best-sellers reveals "wanted but not sold" gaps.
 */
export async function getTopCartedItems(range: DateRange, limit = 10): Promise<NamedCount[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT properties.item_name AS name, count(DISTINCT $session_id) AS c
    FROM events
    WHERE event = 'item_added_to_cart'
      AND ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
      AND name != ''
    GROUP BY name ORDER BY c DESC LIMIT ${limit}
  `);
  return rows.map((r) => ({ name: String(r[0]), count: Number(r[1]) }));
}

export type AbandonedView = {
  name: string;
  /** 5–10 s: opened, glanced, left — likely the photo isn't selling it. */
  b5to10: number;
  /** 10–20 s: read a bit and bailed — likely a content/description issue. */
  b10to20: number;
  /** >20 s: read everything and still didn't buy — content or price problem. */
  b20plus: number;
  total: number;
};

/**
 * "Watched but not bought": item modal opened ≥5s and closed without an
 * add-to-cart (item_view_abandoned, dwell_ms property). Bucketed by dwell so
 * the failure mode is visible per item — photo vs. description vs. price.
 */
export async function getAbandonedViews(range: DateRange, limit = 12): Promise<AbandonedView[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT properties.item_name AS name,
           countIf(toFloat(properties.dwell_ms) < 10000) AS b1,
           countIf(toFloat(properties.dwell_ms) >= 10000 AND toFloat(properties.dwell_ms) < 20000) AS b2,
           countIf(toFloat(properties.dwell_ms) >= 20000) AS b3,
           count() AS total
    FROM events
    WHERE event = 'item_view_abandoned'
      AND ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
      AND name != ''
    GROUP BY name ORDER BY total DESC LIMIT ${limit}
  `);
  return rows.map((r) => ({
    name: String(r[0]),
    b5to10: Number(r[1]),
    b10to20: Number(r[2]),
    b20plus: Number(r[3]),
    total: Number(r[4]),
  }));
}

/**
 * Waiter-call volume by table (table_number super-property). The one true
 * order-intent signal in a waiter-served flow — shows which tables are busiest.
 */
export async function getTableActivity(range: DateRange, limit = 15): Promise<NamedCount[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT properties.table_number AS name, count() AS c
    FROM events
    WHERE event = 'waiter_called'
      AND ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
      AND name != '' AND name IS NOT NULL
    GROUP BY name ORDER BY c DESC LIMIT ${limit}
  `);
  return rows.map((r) => ({ name: `Masa ${String(r[0])}`, count: Number(r[1]) }));
}

/**
 * Cart→call conversion: of the sessions that opened the cart, how many went on
 * to call the waiter. A quality-of-engagement rate (0–100) for the range.
 */
export async function getCartConversion(range: DateRange): Promise<number> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT
      countIf(has(events, 'cart_opened')) AS carts,
      countIf(has(events, 'cart_opened') AND has(events, 'waiter_called')) AS converted
    FROM (
      SELECT $session_id AS sid, groupArray(event) AS events
      FROM events
      WHERE ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
        AND $session_id IS NOT NULL
        AND event IN ('cart_opened','waiter_called')
      GROUP BY sid
    )
  `);
  const r = rows[0];
  const carts = r ? Number(r[0]) : 0;
  const converted = r ? Number(r[1]) : 0;
  return carts > 0 ? Math.round((converted / carts) * 100) : 0;
}

/** Category navigation popularity (category_selected events). */
export async function getCategoryPopularity(range: DateRange, limit = 12): Promise<NamedCount[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT properties.category AS name, count() AS c
    FROM events
    WHERE event = 'category_selected'
      AND ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
      AND name != ''
    GROUP BY name ORDER BY c DESC LIMIT ${limit}
  `);
  return rows.map((r) => ({ name: String(r[0]), count: Number(r[1]) }));
}

/** en/tr split across all tracked events. */
export async function getLocaleSplit(range: DateRange): Promise<NamedCount[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT properties.locale AS name, count() AS c
    FROM events
    WHERE ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
      AND name != ''
    GROUP BY name ORDER BY c DESC
  `);
  return rows.map((r) => ({ name: String(r[0]), count: Number(r[1]) }));
}

/** Engagement funnel counts: views → add-to-cart → waiter call. */
export async function getEngagementFunnel(range: DateRange) {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT event, count() AS c
    FROM events
    WHERE event IN ('item_viewed','item_added_to_cart','waiter_called')
      AND ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
    GROUP BY event
  `);
  const m = new Map(rows.map((r) => [String(r[0]), Number(r[1])]));
  return [
    { step: "Görüntülenen", count: m.get("item_viewed") ?? 0 },
    { step: "Sepete Eklenen", count: m.get("item_added_to_cart") ?? 0 },
    { step: "Garson Çağrısı", count: m.get("waiter_called") ?? 0 },
  ];
}

/**
 * Session count + median duration (seconds) over the range.
 *
 * Single-event sessions (scan → one view → leave, very common for a QR menu)
 * have min == max, i.e. a 0s duration, so they're excluded via `count() >= 2` —
 * a lone ping isn't a measurable dwell. We report the median rather than the
 * mean so one left-open tab doesn't skew the headline number.
 */
export async function getSessionStats(range: DateRange) {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT count() AS sessions, median(duration) AS median_seconds
    FROM (
      SELECT $session_id AS sid,
             dateDiff('second', min(timestamp), max(timestamp)) AS duration
      FROM events
      WHERE ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
        AND $session_id IS NOT NULL
      GROUP BY sid
      HAVING count() >= 2
    )
  `);
  const r = rows[0];
  return {
    sessions: r ? Number(r[0]) : 0,
    avgSeconds: r ? Math.round(Number(r[1]) || 0) : 0,
  };
}

/** Daily counts of menu views + waiter calls (for the comparison chart). */
export async function getDailyEngagement(range: DateRange) {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT toDate(${LOCAL_TS}) AS d,
           countIf(event = 'item_viewed') AS views,
           countIf(event = 'waiter_called') AS waiter_calls
    FROM events
    WHERE ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
    GROUP BY d ORDER BY d
  `);
  return rows.map((r) => ({
    date: String(r[0]),
    views: Number(r[1]),
    waiterCalls: Number(r[2]),
  }));
}

export type PriceBand = { band: string; views: number; carts: number };

// Band edges in ₺. Labels are built client-side from the same constant.
const PRICE_BANDS = [200, 400];

/**
 * View→cart conversion by price band — answers "are diners bouncing off
 * expensive items specifically?". Uses the `price` property carried on both
 * item_viewed and item_added_to_cart.
 */
export async function getPriceBands(range: DateRange): Promise<PriceBand[]> {
  const b = bounds(range);
  const [lo, hi] = PRICE_BANDS;
  const rows = await hogql(`
    SELECT multiIf(toFloat(properties.price) < ${lo}, '0–${lo} ₺',
                   toFloat(properties.price) < ${hi}, '${lo}–${hi} ₺',
                   '${hi}+ ₺') AS band,
           countIf(event = 'item_viewed') AS views,
           countIf(event = 'item_added_to_cart') AS carts
    FROM events
    WHERE event IN ('item_viewed','item_added_to_cart')
      AND ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
      AND properties.price IS NOT NULL
    GROUP BY band
  `);
  const byBand = new Map(rows.map((r) => [String(r[0]), { views: Number(r[1]), carts: Number(r[2]) }]));
  // Fixed order regardless of which bands have data.
  return [`0–${lo} ₺`, `${lo}–${hi} ₺`, `${hi}+ ₺`].map((band) => ({
    band,
    views: byBand.get(band)?.views ?? 0,
    carts: byBand.get(band)?.carts ?? 0,
  }));
}

export type DiscountSplit = { group: "discounted" | "regular"; views: number; carts: number };

/**
 * Do discounts actually move behavior? Compares view→cart conversion of
 * discounted vs full-price items. Relies on the `discount_pct` event property
 * (added 2026-07-05), so it only covers data from then on.
 */
export async function getDiscountSplit(range: DateRange): Promise<DiscountSplit[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT if(toFloat(coalesce(properties.discount_pct, '0')) > 0, 'discounted', 'regular') AS grp,
           countIf(event = 'item_viewed') AS views,
           countIf(event = 'item_added_to_cart') AS carts
    FROM events
    WHERE event IN ('item_viewed','item_added_to_cart')
      AND ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
    GROUP BY grp
  `);
  const byGroup = new Map(rows.map((r) => [String(r[0]), { views: Number(r[1]), carts: Number(r[2]) }]));
  return (["discounted", "regular"] as const).map((group) => ({
    group,
    views: byGroup.get(group)?.views ?? 0,
    carts: byGroup.get(group)?.carts ?? 0,
  }));
}

/**
 * Menu views by weekday × hour (heatmap). toDayOfWeek is ISO: 1 = Monday.
 */
export async function getWeekHeatmap(range: DateRange): Promise<{ day: number; hour: number; count: number }[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT toDayOfWeek(${LOCAL_TS}) AS d, toHour(${LOCAL_TS}) AS h, count() AS c
    FROM events
    WHERE event = 'item_viewed'
      AND ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
    GROUP BY d, h
  `);
  return rows.map((r) => ({ day: Number(r[0]), hour: Number(r[1]), count: Number(r[2]) }));
}

/** Orders/views by hour-of-day (peak hours, from item_viewed). */
export async function getPeakHours(range: DateRange) {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT toHour(${LOCAL_TS}) AS h, count() AS c
    FROM events
    WHERE event = 'item_viewed'
      AND ${LOCAL_TS} >= ${b.from} AND ${LOCAL_TS} <= ${b.to}
    GROUP BY h ORDER BY h
  `);
  const byHour = new Map(rows.map((r) => [Number(r[0]), Number(r[1])]));
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: byHour.get(h) ?? 0 }));
}
