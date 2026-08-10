import "server-only";
import { env } from "@/lib/env";
import { businessDayStart } from "@/lib/analytics/business-day";
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

// PostHog's upstream (ClickHouse) occasionally drops a request mid-flight — the
// Envoy "503 upstream connect error … reset reason: connection termination"
// message — a transient server-side blip that a quick retry almost always
// clears. We retry only 5xx and network errors, never 4xx (bad query / auth /
// 429 rate-limit won't fix themselves), and back off a little between tries.
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 250;

/** One HogQL POST. Throws on 5xx/network (retryable); returns [] on 4xx (not). */
async function hogqlOnce(query: string): Promise<unknown[][]> {
  const res = await fetch(`${HOST}/api/projects/${PROJECT_ID}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    cache: "no-store",
  });
  if (res.status >= 500) {
    throw new Error(`posthog ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  if (!res.ok) {
    console.error("[analytics:posthog] query failed", res.status, await res.text());
    return [];
  }
  const json = (await res.json()) as HogQLResult;
  return json.results ?? [];
}

/** Run a HogQL query with transient-failure retries; returns [] once exhausted. */
async function hogql(query: string): Promise<unknown[][]> {
  if (!posthogConfigured()) return [];

  const hit = queryCache.get(query);
  if (hit && Date.now() - hit.at < QUERY_TTL_MS) return hit.result;

  const result = (async () => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await hogqlOnce(query);
      } catch (err) {
        if (attempt === MAX_ATTEMPTS) {
          console.error("[analytics:posthog] query error (gave up after retries)", err);
          return [];
        }
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * attempt)); // 250ms, then 500ms
      }
    }
    return [];
  })();

  queryCache.set(query, { at: Date.now(), result });
  return result;
}

// Restaurant-local timezone. All date/hour math is done in local time so
// "today", daily buckets, and peak hours line up with the real business day
// (event timestamps are stored in UTC). `sales_entries.entry_date` is already
// local, so this keeps the two data sources on the same timeline.
const TZ = "Europe/Istanbul";

// Local WALL-CLOCK timestamp for the current row, in TZ. A 21:00 Istanbul event
// must never be counted as an 18:00 UTC one. Used directly only where the real
// clock hour is the point (peak hours, the heatmap's hour axis).
const CLOCK_TS = `toTimeZone(timestamp, '${TZ}')`;

/**
 * BUSINESS-day timestamp: the wall clock shifted back by the configured
 * business-day start, so a 01:30 order books on the night it belongs to rather
 * than on the calendar day the clock had rolled over to.
 *
 * Every range filter and every DATE bucket (`toDate`, `toDayOfWeek`) goes through
 * this; hour-of-day buckets deliberately do not. At the default start hour of 0
 * it renders the exact same expression as before, so nothing changes unless the
 * owner opts in — which also means a HogQL incompatibility could only ever affect
 * the opted-in case.
 *
 * Called per query-string build (not cached) so flipping the setting immediately
 * produces a different query string, which in turn misses the query cache.
 */
function TS(): string {
  const h = businessDayStart();
  return h === 0 ? CLOCK_TS : `subtractHours(${CLOCK_TS}, ${h})`;
}

// Events before this date are excluded from every query: earlier data is
// unreliable (waiter/bill calls from the bell sheet weren't tracked until
// 2026-07-05, and dwell tracking didn't exist), so it would skew every chart.
// Real sales (Supabase) are NOT affected — this floor is engagement-only.
export const ENGAGEMENT_DATA_FLOOR = "2026-07-05";

/**
 * The slice of `range` that actually has engagement data behind it.
 *
 * The floor silently SHORTENS the asked-for window, so any caller that mixes an
 * engagement number with a whole-range one (real sales) — or that compares two
 * windows — has to know it happened, otherwise it divides/compares across two
 * different spans. `days` is the inclusive usable length; `empty` means the
 * whole range predates the floor and every query returns zero rows.
 */
export type EngagementWindow = {
  from: string;
  to: string;
  /** `range.from` predates the floor — the usable window is shorter than asked. */
  clipped: boolean;
  /** The entire range predates the floor — no engagement data at all. */
  empty: boolean;
  /** Inclusive day count of the usable window; 0 when empty. */
  days: number;
};

export function engagementWindow(range: DateRange): EngagementWindow {
  const clipped = range.from < ENGAGEMENT_DATA_FLOOR;
  const from = clipped ? ENGAGEMENT_DATA_FLOOR : range.from;
  const empty = from > range.to;
  const days = empty
    ? 0
    : Math.round((Date.parse(`${range.to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  return { from, to: range.to, clipped, empty, days };
}

// HogQL date bounds (inclusive), interpreted in local time. `to` is end-of-day.
// `from` is clamped to the data floor; a range entirely before it yields no rows.
type Bounds = { from: string; to: string };

function bounds(range: DateRange): Bounds {
  const { from, to } = engagementWindow(range);
  return {
    from: `'${from} 00:00:00'`,
    to: `'${to} 23:59:59'`,
  };
}

/** Range predicate alone. Only `countedSessions` uses this — everything else uses `scope`. */
function inRange(b: Bounds): string {
  return `${TS()} >= ${b.from} AND ${TS()} <= ${b.to}`;
}

/**
 * Sessions that COUNT: the ones where a diner actually scanned a table QR.
 *
 * The menu renders fine with no `?t=` and is publicly reachable, so someone
 * browsing from Instagram or a shared link produces a session indistinguishable
 * from a seated diner's. Real humans, zero covers — and they inflated everything.
 *
 * Session-level, never event-level: PostHogProvider registers `table_number` in a
 * SECOND effect, after `init()` has already fired the opening `$pageview`, so that
 * first event carries no table. Filtering per event would drop it and undercount;
 * asking "did ANY event in this session carry a table" does not.
 */
function countedSessions(b: Bounds): string {
  return `
      SELECT $session_id FROM events
      WHERE ${inRange(b)}
        AND isNotNull(properties.table_number) AND properties.table_number != ''
      GROUP BY $session_id`;
}

/**
 * THE population every query in this file runs over — range + counted sessions.
 *
 * There is deliberately ONE definition of "an event that counts". Each query used
 * to spell out its own range predicate, which is how the headline KPI and the rest
 * of the engagement row came to disagree: filtering one query meant the others
 * silently kept counting off-premise browsers. Add a condition here, not in a
 * query. Membership in a session set implies `$session_id IS NOT NULL`, so no
 * query needs to restate that.
 */
function scope(b: Bounds): string {
  return `${inRange(b)}
      AND $session_id IN (${countedSessions(b)}
      )`;
}

export type NamedCount = { name: string; count: number };

// The menu is small (well under 200 items), so every "top N" primitive fetches
// one fixed generous pool and slices to `limit` in JS. This keeps the HogQL query
// string IDENTICAL regardless of the caller's `limit`, so the query cache dedupes
// the many callers that ask for the same list at different pool sizes (10/50/60/80)
// into ONE ClickHouse query per render — the callers already sort-then-slice, so
// results are unchanged. Raise this only if the menu ever approaches 200 items.
const TOP_POOL = 200;

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
      AND ${scope(b)}
      AND name != ''
    GROUP BY name ORDER BY c DESC LIMIT ${TOP_POOL}
  `);
  return rows.slice(0, limit).map((r) => ({ name: String(r[0]), count: Number(r[1]) }));
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
      AND ${scope(b)}
      AND name != ''
    GROUP BY name ORDER BY c DESC LIMIT ${TOP_POOL}
  `);
  return rows.slice(0, limit).map((r) => ({ name: String(r[0]), count: Number(r[1]) }));
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
      AND ${scope(b)}
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

export type AbandonedViewDay = {
  name: string;
  date: string; // yyyy-mm-dd, local
  b5to10: number;
  b10to20: number;
  b20plus: number;
};

/**
 * Same as `getAbandonedViews` but broken out per item PER DAY, unlimited. Feeds
 * `getAbandonedViewsNet`, which drops the (item, day) pairs the item actually
 * sold on before re-aggregating per item. Not shown directly.
 */
export async function getAbandonedViewsByDay(range: DateRange): Promise<AbandonedViewDay[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT properties.item_name AS name,
           toDate(${TS()}) AS d,
           countIf(toFloat(properties.dwell_ms) < 10000) AS b1,
           countIf(toFloat(properties.dwell_ms) >= 10000 AND toFloat(properties.dwell_ms) < 20000) AS b2,
           countIf(toFloat(properties.dwell_ms) >= 20000) AS b3
    FROM events
    WHERE event = 'item_view_abandoned'
      AND ${scope(b)}
      AND name != ''
    GROUP BY name, d
  `);
  return rows.map((r) => ({
    name: String(r[0]),
    date: String(r[1]),
    b5to10: Number(r[2]),
    b10to20: Number(r[3]),
    b20plus: Number(r[4]),
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
      AND ${scope(b)}
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
      WHERE ${scope(b)}
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
      AND ${scope(b)}
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
    WHERE ${scope(b)}
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
      AND ${scope(b)}
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
 * A visit is one device's activity separated from its next by more than this.
 *
 * PostHog's own `$session_id` cannot express a restaurant visit: posthog-js
 * CLAMPS `session_idle_timeout_seconds` to 30 minutes max, and a meal runs
 * 60–120. A diner who browses on arrival, pockets the phone, then reopens the
 * menu for dessert was being counted as two visits. We therefore ignore
 * `$session_id` for COUNTING and stitch the events back together per device at
 * this gap instead.
 *
 * Duration deliberately stays on the `$session_id` grain (see below) — the two
 * grains answer different questions.
 */
const VISIT_GAP_SECONDS = 2 * 60 * 60;

/**
 * Visit count + median dwell (seconds) over the range, restricted to diners who
 * actually scanned a table QR.
 *
 * Two deliberate departures from "count PostHog sessions":
 *
 * 1. TABLE-ONLY. The menu renders fine with no `?t=` and is publicly reachable,
 *    so anyone browsing from Instagram or a shared link produced a session
 *    indistinguishable from a seated diner's. Those are real humans but zero
 *    covers, and they inflated every figure derived from this number.
 *
 * 2. VISIT GRAIN, NOT SESSION GRAIN. Counted per device at VISIT_GAP_SECONDS
 *    (see above) rather than per `$session_id`.
 *
 * `median_seconds` intentionally stays on the `$session_id` grain and keeps the
 * `count() >= 2` guard: it measures CONTINUOUS engagement, and stretching it
 * across a two-hour meal gap would report the length of dinner, not of menu
 * reading. Note the guard excludes far less than it appears to — `capture_pageview`
 * and `capture_pageleave` are both on, so even a bounce carries two events.
 */
export async function getSessionStats(range: DateRange) {
  const b = bounds(range);
  const [visitRows, durationRows] = await Promise.all([
    hogql(`
      SELECT sum(visits) AS visits
      FROM (
        SELECT distinct_id,
               1 + arrayCount(g -> g > ${VISIT_GAP_SECONDS},
                     arrayDifference(arraySort(groupArray(toUnixTimestamp(timestamp))))) AS visits
        FROM events
        WHERE ${scope(b)}
          AND distinct_id != ''
        GROUP BY distinct_id
      )
    `),
    hogql(`
      SELECT median(duration) AS median_seconds
      FROM (
        SELECT $session_id AS sid,
               dateDiff('second', min(timestamp), max(timestamp)) AS duration
        FROM events
        WHERE ${scope(b)}
        GROUP BY sid
        HAVING count() >= 2
      )
    `),
  ]);
  return {
    sessions: visitRows[0] ? Number(visitRows[0][0]) || 0 : 0,
    avgSeconds: durationRows[0] ? Math.round(Number(durationRows[0][0]) || 0) : 0,
  };
}

/** Daily counts of menu views + waiter calls (for the comparison chart). */
export async function getDailyEngagement(range: DateRange) {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT toDate(${TS()}) AS d,
           countIf(event = 'item_viewed') AS views,
           countIf(event = 'waiter_called') AS waiter_calls
    FROM events
    WHERE ${scope(b)}
    GROUP BY d ORDER BY d
  `);
  return rows.map((r) => ({
    date: String(r[0]),
    views: Number(r[1]),
    waiterCalls: Number(r[2]),
  }));
}

export type ItemViewPrice = { name: string; price: number; views: number };

/**
 * Distinct-session views per item, carrying the price on the view event.
 *
 * Raw material for the price-band analysis in `lib/analytics/price-bands.ts`,
 * which bands these views AND real POS sales on the same per-item price so the
 * two are directly comparable. The tracked price is only a fallback there (for
 * names no longer on the menu); the menu's own price wins when it exists.
 *
 * Deliberately NOT a view→cart conversion: the menu has no checkout, so a price
 * band's success has to be judged on what actually sold.
 */
export async function getItemViewsWithPrice(range: DateRange): Promise<ItemViewPrice[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT properties.item_name AS name,
           median(toFloat(properties.price)) AS price,
           count(DISTINCT $session_id) AS c
    FROM events
    WHERE event = 'item_viewed'
      AND ${scope(b)}
      AND name != ''
    GROUP BY name ORDER BY c DESC LIMIT ${TOP_POOL}
  `);
  return rows.map((r) => ({ name: String(r[0]), price: Number(r[1]) || 0, views: Number(r[2]) }));
}

export type ItemDiscountDay = { name: string; date: string; views: number; discounted: boolean };

/**
 * Per item PER DAY: distinct-session views and whether the item was discounted
 * that day (`discount_pct` property, added 2026-07-05).
 *
 * Day granularity is what makes a SALES-based discount comparison possible —
 * POS sales are day-level, so `getDiscountSalesSplit` can join on (item, day)
 * and total what each group actually sold instead of what it got carted.
 */
export async function getItemViewDiscountDays(range: DateRange): Promise<ItemDiscountDay[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT properties.item_name AS name,
           toDate(${TS()}) AS d,
           count(DISTINCT $session_id) AS c,
           max(toFloat(coalesce(properties.discount_pct, '0'))) AS disc
    FROM events
    WHERE event = 'item_viewed'
      AND ${scope(b)}
      AND name != ''
    GROUP BY name, d
  `);
  return rows.map((r) => ({
    name: String(r[0]),
    date: String(r[1]),
    views: Number(r[2]),
    discounted: Number(r[3]) > 0,
  }));
}

/**
 * Menu views by weekday × hour (heatmap). toDayOfWeek is ISO: 1 = Monday.
 */
export async function getWeekHeatmap(range: DateRange): Promise<{ day: number; hour: number; count: number }[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT toDayOfWeek(${TS()}) AS d, toHour(${CLOCK_TS}) AS h, count() AS c
    FROM events
    WHERE event = 'item_viewed'
      AND ${scope(b)}
    GROUP BY d, h
  `);
  return rows.map((r) => ({ day: Number(r[0]), hour: Number(r[1]), count: Number(r[2]) }));
}

export type PromoEngagement = {
  featured: { clicks: number; sessions: number; toCart: number };
  suggested: { clicks: number; sessions: number; toCart: number };
  /** Suggested-rail items by click volume, keyed by item_id (names resolved in promo.ts). */
  topSuggestedIds: { id: string; clicks: number }[];
};

/**
 * Featured-banner and suggested-rail engagement: raw click volume, distinct
 * sessions, and how many of those sessions went on to add anything to cart — i.e.
 * whether that menu real estate is actually working. Item ids are resolved to
 * names by the caller (promo.ts) since names live in Supabase.
 */
export async function getPromoEngagement(range: DateRange): Promise<PromoEngagement> {
  const b = bounds(range);
  const [clickRows, funnelRows, topSuggested] = await Promise.all([
    hogql(`
      SELECT event, count() AS clicks
      FROM events
      WHERE event IN ('featured_item_clicked','suggested_item_clicked')
        AND ${scope(b)}
      GROUP BY event
    `),
    hogql(`
      SELECT
        countIf(has(e,'featured_item_clicked')) AS f_sess,
        countIf(has(e,'featured_item_clicked') AND has(e,'item_added_to_cart')) AS f_cart,
        countIf(has(e,'suggested_item_clicked')) AS s_sess,
        countIf(has(e,'suggested_item_clicked') AND has(e,'item_added_to_cart')) AS s_cart
      FROM (
        SELECT $session_id AS sid, groupArray(event) AS e
        FROM events
        WHERE ${scope(b)}
          AND event IN ('featured_item_clicked','suggested_item_clicked','item_added_to_cart')
        GROUP BY sid
      )
    `),
    hogql(`
      SELECT properties.item_id AS id, count() AS c
      FROM events
      WHERE event = 'suggested_item_clicked'
        AND ${scope(b)}
        AND id != ''
      GROUP BY id ORDER BY c DESC LIMIT 8
    `),
  ]);

  const clicks = new Map(clickRows.map((r) => [String(r[0]), Number(r[1])]));
  const f = funnelRows[0];
  return {
    featured: {
      clicks: clicks.get("featured_item_clicked") ?? 0,
      sessions: f ? Number(f[0]) : 0,
      toCart: f ? Number(f[1]) : 0,
    },
    suggested: {
      clicks: clicks.get("suggested_item_clicked") ?? 0,
      sessions: f ? Number(f[2]) : 0,
      toCart: f ? Number(f[3]) : 0,
    },
    topSuggestedIds: topSuggested.map((r) => ({ id: String(r[0]), clicks: Number(r[1]) })),
  };
}

/**
 * An item within a locale, carrying its penetration RATE — the share of that
 * locale's own sessions that viewed it. Rate, not raw count, is what's comparable
 * across locales: almost every diner stays on the default language, so the EN
 * audience is a fraction of TR's and their raw view counts can never be compared
 * directly. `count` is kept only as secondary context.
 */
export type LocaleItem = { name: string; count: number; rate: number };

export type LocalePref = {
  locale: string;
  sessions: number;
  medianSeconds: number;
  topItems: LocaleItem[];
};

/**
 * Behavior split by menu language (the `locale` super-property): per-locale
 * session count, median dwell, and each locale's most-viewed items — answers
 * "do English-menu diners want different things than Turkish-menu diners?".
 */
export async function getLocalePreferences(range: DateRange, perLocale = 5): Promise<LocalePref[]> {
  const b = bounds(range);
  const [statRows, itemRows] = await Promise.all([
    hogql(`
      SELECT loc, count() AS sessions, median(duration) AS med
      FROM (
        SELECT $session_id AS sid,
               any(properties.locale) AS loc,
               dateDiff('second', min(timestamp), max(timestamp)) AS duration
        FROM events
        WHERE ${scope(b)}
        GROUP BY sid
        HAVING count() >= 2
      )
      WHERE loc != ''
      GROUP BY loc
    `),
    hogql(`
      SELECT properties.locale AS loc, properties.item_name AS name, count(DISTINCT $session_id) AS c
      FROM events
      WHERE event = 'item_viewed'
        AND ${scope(b)}
        AND name != '' AND loc != ''
      GROUP BY loc, name
    `),
  ]);

  const stats = new Map(
    statRows.map((r) => [String(r[0]), { sessions: Number(r[1]), med: Math.round(Number(r[2]) || 0) }])
  );
  const itemsByLoc = new Map<string, NamedCount[]>();
  for (const r of itemRows) {
    const loc = String(r[0]);
    const list = itemsByLoc.get(loc) ?? [];
    list.push({ name: String(r[1]), count: Number(r[2]) });
    itemsByLoc.set(loc, list);
  }

  // Only the supported locales, stable order, that actually have data.
  return (["tr", "en"] as const)
    .filter((loc) => stats.has(loc) || itemsByLoc.has(loc))
    .map((loc) => {
      const sessions = stats.get(loc)?.sessions ?? 0;
      return {
        locale: loc,
        sessions,
        medianSeconds: stats.get(loc)?.med ?? 0,
        // Penetration rate = distinct-session views ÷ this locale's session count.
        // (Ranking by rate is identical to ranking by count within a locale, since
        // sessions is constant here — only the comparable figure changes.)
        topItems: (itemsByLoc.get(loc) ?? [])
          .sort((a, b) => b.count - a.count)
          .slice(0, perLocale)
          .map((it) => ({ ...it, rate: sessions > 0 ? Math.min(1, it.count / sessions) : 0 })),
      };
    });
}

/** Orders/views by hour-of-day (peak hours, from item_viewed). */
export async function getPeakHours(range: DateRange) {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT toHour(${CLOCK_TS}) AS h, count() AS c
    FROM events
    WHERE event = 'item_viewed'
      AND ${scope(b)}
    GROUP BY h ORDER BY h
  `);
  const byHour = new Map(rows.map((r) => [Number(r[0]), Number(r[1])]));
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: byHour.get(h) ?? 0 }));
}
