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
  abandonedViews: { name: string; b5to10: number; b10to20: number; b20plus: number; total: number }[];
  categoryPopularity: { name: string; count: number }[];
};

const SYSTEM_PROMPT = `You are a restaurant menu analytics advisor for a QR-code menu.
You receive engagement data (item views, add-to-carts, waiter calls) and real POS sales for a date range,
plus an "abandonedViews" table: items whose detail page was opened and closed WITHOUT adding to cart,
bucketed by how long the diner looked — 5-10s (photo/appeal likely weak), 10-20s (description not convincing),
20s+ (read everything and still didn't buy: content or price problem).

Produce 4-7 short, concrete, actionable insights IN TURKISH. Focus on:
- best and worst sellers, and shared traits between them (ingredients, category, price band)
- items viewed a lot but rarely added to cart or sold
- dwell-time patterns per the bucket meanings above, with the suggested fix
- conversion through the funnel
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
