import "server-only";
import { env } from "@/lib/env";

/**
 * AI insights over the analytics data via Groq (GroqCloud).
 *
 * Plain fetch against the OpenAI-compatible chat completions endpoint — no SDK
 * dependency, mirroring how posthog.ts talks to its API. Everything returns
 * safely ([] / unchanged) on any failure so the dashboard never breaks.
 *
 * Two operations back the analytics tab:
 *  - generateFindingsBatch — one pass that returns findings NOT already found,
 *    so the caller can loop in cycles and gather the full set without a hard cap.
 *  - revalidateFindings — re-checks an existing set against the latest data and
 *    reports which still hold, which resolved, and which are new.
 *
 * temperature is 0 so repeated runs over the same data stay consistent rather
 * than surfacing different "random" findings each time.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Swap for any current Groq-hosted model — see https://console.groq.com/docs/models
const MODEL = "llama-3.3-70b-versatile";

export function insightsConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY);
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
  itemConversion: { name: string; views: number; carts: number; sold: number; convPct: number }[];
  priceBands: { band: string; views: number; carts: number }[];
  discountSplit: { group: string; views: number; carts: number }[];
  /** KPI deltas vs the previous period of equal length, in percent (null = no baseline). */
  deltas: Record<string, number | null>;
  /** Earlier generated insight sets, newest first — lets the model follow up on past advice. */
  previousInsights: { date: string; insights: string[] }[];
};

/** Outcome of re-checking an existing finding set against the latest data. */
export type RevalidateResult = {
  /** Still true now — figures refreshed to current values. */
  ongoing: string[];
  /** No longer holds (improved or reversed) — restates what changed. */
  resolved: string[];
  /** New distinct findings not covered by the existing set. */
  added: string[];
};

const DATA_CONTEXT = `You are a restaurant menu analytics advisor for a QR-code menu.
You receive engagement data (item views, add-to-carts, waiter calls) and real POS sales for a date range,
plus an "abandonedViews" table: items whose detail page was opened and closed WITHOUT adding to cart,
bucketed by how long the diner looked — 5-10s (photo/appeal likely weak), 10-20s (description not convincing),
20s+ (read everything and still didn't buy: content or price problem).
You also receive: "itemConversion" (per item: views → cart adds → actually sold),
"priceBands" (view→cart conversion by price range), "discountSplit" (discounted vs full-price conversion),
"deltas" (percent change of each KPI vs the previous period of equal length),
and "previousInsights" (your earlier analyses, newest first).
Every finding must cite a specific number from the data AND carry a concrete takeaway or action —
never just restate a number. No greetings, no fluff. Write IN TURKISH.`;

const GENERATE_SYSTEM = `${DATA_CONTEXT}

Extract EVERY distinct, well-supported finding the data justifies — do NOT cap the count, but never pad:
skip anything you can't tie to a real number. Cover, where supported: best/worst sellers and shared traits
(ingredients, category, price band); items viewed a lot but rarely carted or sold; dwell-time patterns per
the bucket meanings above, with the matching fix; meaningful period-over-period movement (deltas) — what
improved, what declined; whether discounts and price bands actually change behavior; and follow-ups on
previousInsights.

The user message includes "alreadyFound": findings already produced in earlier passes. Do NOT repeat or
rephrase any of them — return ONLY genuinely new, distinct findings. If nothing new remains, return [].

Respond with ONLY a JSON array of strings, e.g. ["bulgu 1","bulgu 2"].`;

const REVALIDATE_SYSTEM = `${DATA_CONTEXT}

You are re-checking an existing set of findings ("existingFindings") against the LATEST data. Classify each
existing finding and look for new ones:
- "ongoing": findings STILL TRUE given the current data — keep them, updating any figures to current values.
- "resolved": findings that NO LONGER hold because the situation improved or reversed — briefly restate what changed.
- "added": NEW distinct findings not covered by existingFindings.
Base every item on a specific current number. Do not move a finding to "resolved" unless the data clearly
shows it no longer applies.

Respond with ONLY a JSON object: {"ongoing":[...],"resolved":[...],"added":[...]}.`;

/** One chat completion; returns the raw content string ("" on any failure). */
async function chat(system: string, user: string): Promise<string> {
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0, // consistent findings across runs, not fresh random ones
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[insights] Groq request failed", res.status, await res.text());
      return "";
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    console.error("[insights] request error", err);
    return "";
  }
}

/**
 * One generation pass. `alreadyFound` is echoed to the model so it returns only
 * findings not already surfaced — call this in a loop to collect the full set.
 */
export async function generateFindingsBatch(data: InsightsInput, alreadyFound: string[]): Promise<string[]> {
  if (!insightsConfigured()) return [];
  const content = await chat(GENERATE_SYSTEM, JSON.stringify({ ...data, alreadyFound }));
  return parseStringArray(content);
}

/** Re-check an existing set against the latest data. Keeps the set on any failure. */
export async function revalidateFindings(data: InsightsInput, existing: string[]): Promise<RevalidateResult> {
  if (!insightsConfigured()) return { ongoing: existing, resolved: [], added: [] };
  const content = await chat(REVALIDATE_SYSTEM, JSON.stringify({ ...data, existingFindings: existing }));
  return parseRevalidate(content, existing);
}

function stripFence(content: string): string {
  return content.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
}

/** Parse a JSON array of strings; line-split fallback. */
function parseStringArray(content: string): string[] {
  const trimmed = stripFence(content);
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

/** Parse the {ongoing,resolved,added} object; on failure keep the existing set intact. */
function parseRevalidate(content: string, existing: string[]): RevalidateResult {
  const trimmed = stripFence(content);
  const arr = (x: unknown): string[] => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>;
      return { ongoing: arr(o.ongoing), resolved: arr(o.resolved), added: arr(o.added) };
    }
  } catch {
    // fall through
  }
  return { ongoing: existing, resolved: [], added: [] };
}
