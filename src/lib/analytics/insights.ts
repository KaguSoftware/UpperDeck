import "server-only";
import { env } from "@/lib/env";

/**
 * AI insights over the analytics data via xAI (Grok).
 *
 * Plain fetch against the OpenAI-compatible chat completions endpoint — no SDK
 * dependency, mirroring how posthog.ts talks to its API. Returns [] on any
 * failure (unconfigured, network, bad response) so the dashboard never breaks.
 */

const XAI_URL = "https://api.x.ai/v1/chat/completions";
const MODEL = "grok-4-fast-non-reasoning";

export function insightsConfigured(): boolean {
  return Boolean(env.XAI_API_KEY);
}

/** Trimmed serialization of the analytics page data — only what the model needs. */
export type InsightsInput = {
  range: { from: string; to: string };
  kpis: {
    totalSales: number;
    totalCovers: number;
    avgSpendPerCover: number;
    sessions: number;
    avgSeconds: number;
    waiterCalls: number;
    views: number;
    cartConversion: number;
  };
  topViewed: { name: string; count: number }[];
  topCarted: { name: string; count: number }[];
  bestSellers: { item_name: string; qty: number; revenue: number }[];
  funnel: { step: string; count: number }[];
  abandonedViews: { name: string; views: number }[];
  categoryPopularity: { name: string; count: number }[];
  itemConversion: { name: string; views: number; carts: number; sold: number; convPct: number }[];
  priceBands: { band: string; views: number; carts: number }[];
  discountSplit: { group: string; views: number; carts: number }[];
  /** KPI deltas vs the previous period of equal length, in percent (null = no baseline). */
  deltas: Record<string, number | null>;
  /** Earlier generated insight sets, newest first — lets the model follow up on past advice. */
  previousInsights: { date: string; insights: string[] }[];
};

const SYSTEM_PROMPT = `You are a restaurant menu analytics advisor for a QR-code menu.
You receive engagement data (item views, add-to-carts, waiter calls) and real POS sales for a date range,
plus an "abandonedViews" table: items that WERE viewed on the menu during the period but did NOT appear in
the real POS sales at all (viewed but never actually sold). Each row is { name, views }. Treat a high view
count with zero sales as a demand / visibility / naming-mismatch gap: the item draws interest but doesn't
convert to an order — investigate price, description, placement, or whether its menu name matches the POS name.

You also receive: "itemConversion" (per item: views → cart adds → actually sold),
"priceBands" (view→cart conversion by price range), "discountSplit" (discounted vs
full-price conversion), "deltas" (percent change of each KPI vs the previous period
of equal length), and "previousInsights" (your earlier analyses, newest first).

Produce 4-7 short, concrete, actionable insights IN TURKISH. Focus on:
- best and worst sellers, and shared traits between them (ingredients, category, price band)
- items viewed a lot but rarely added to cart or sold
- dwell-time patterns per the bucket meanings above, with the suggested fix
- meaningful period-over-period movement (deltas) — what improved, what declined
- whether discounts and price bands actually change behavior
- follow-ups on previousInsights: if something was flagged before, say whether it improved
Every bullet must contain a takeaway or action, never just restate a number. No greetings, no fluff.

Respond with ONLY a JSON array of strings, e.g. ["insight 1","insight 2"].`;

export async function generateInsights(data: InsightsInput): Promise<string[]> {
  if (!insightsConfigured()) return [];
  try {
    const res = await fetch(XAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(data) },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[insights] xAI request failed", res.status, await res.text());
      return [];
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "";
    return parseInsights(content);
  } catch (err) {
    console.error("[insights] request error", err);
    return [];
  }
}

/** Parse the model output defensively: JSON array first, line-split fallback. */
function parseInsights(content: string): string[] {
  const trimmed = content.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // fall through to line splitting
  }
  return trimmed
    .split("\n")
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
}
