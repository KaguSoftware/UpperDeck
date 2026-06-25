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

/** Run a HogQL query; returns rows as arrays, or [] on any failure. */
async function hogql(query: string): Promise<unknown[][]> {
  if (!posthogConfigured()) return [];
  try {
    const res = await fetch(`${HOST}/api/projects/${PROJECT_ID}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      // Short revalidate window keeps the dashboard snappy without stale-forever data.
      next: { revalidate: 60 },
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
}

// HogQL date bounds (inclusive). `to` is end-of-day.
function bounds(range: DateRange) {
  return {
    from: `'${range.from} 00:00:00'`,
    to: `'${range.to} 23:59:59'`,
  };
}

export type NamedCount = { name: string; count: number };

/** Most-viewed menu items (item_viewed events). */
export async function getTopViewedItems(range: DateRange, limit = 10): Promise<NamedCount[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT properties.item_name AS name, count() AS c
    FROM events
    WHERE event = 'item_viewed'
      AND timestamp >= ${b.from} AND timestamp <= ${b.to}
      AND name != ''
    GROUP BY name ORDER BY c DESC LIMIT ${limit}
  `);
  return rows.map((r) => ({ name: String(r[0]), count: Number(r[1]) }));
}

/** Category navigation popularity (category_selected events). */
export async function getCategoryPopularity(range: DateRange, limit = 12): Promise<NamedCount[]> {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT properties.category AS name, count() AS c
    FROM events
    WHERE event = 'category_selected'
      AND timestamp >= ${b.from} AND timestamp <= ${b.to}
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
    WHERE timestamp >= ${b.from} AND timestamp <= ${b.to}
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
      AND timestamp >= ${b.from} AND timestamp <= ${b.to}
    GROUP BY event
  `);
  const m = new Map(rows.map((r) => [String(r[0]), Number(r[1])]));
  return [
    { step: "Görüntülenen", count: m.get("item_viewed") ?? 0 },
    { step: "Sepete Eklenen", count: m.get("item_added_to_cart") ?? 0 },
    { step: "Garson Çağrısı", count: m.get("waiter_called") ?? 0 },
  ];
}

/** Session count + average duration (seconds) over the range. */
export async function getSessionStats(range: DateRange) {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT count() AS sessions, avg(duration) AS avg_seconds
    FROM (
      SELECT $session_id AS sid,
             dateDiff('second', min(timestamp), max(timestamp)) AS duration
      FROM events
      WHERE timestamp >= ${b.from} AND timestamp <= ${b.to}
        AND $session_id IS NOT NULL
      GROUP BY sid
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
    SELECT toDate(timestamp) AS d,
           countIf(event = 'item_viewed') AS views,
           countIf(event = 'waiter_called') AS waiter_calls
    FROM events
    WHERE timestamp >= ${b.from} AND timestamp <= ${b.to}
    GROUP BY d ORDER BY d
  `);
  return rows.map((r) => ({
    date: String(r[0]),
    views: Number(r[1]),
    waiterCalls: Number(r[2]),
  }));
}

/** Orders/views by hour-of-day (peak hours, from item_viewed). */
export async function getPeakHours(range: DateRange) {
  const b = bounds(range);
  const rows = await hogql(`
    SELECT toHour(timestamp) AS h, count() AS c
    FROM events
    WHERE event = 'item_viewed'
      AND timestamp >= ${b.from} AND timestamp <= ${b.to}
    GROUP BY h ORDER BY h
  `);
  const byHour = new Map(rows.map((r) => [Number(r[0]), Number(r[1])]));
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: byHour.get(h) ?? 0 }));
}
