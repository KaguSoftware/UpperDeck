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

/**
 * Persisted findings are reused as-is for this long. Past it they're stale and a
 * page load fully re-generates them; within it, only an explicit recheck updates.
 */
export const INSIGHTS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** True while a stored set (by its created_at) is still within the reuse window. */
export function isInsightFresh(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && Date.now() - t < INSIGHTS_TTL_MS;
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
You also receive: "itemConversion" (per item: views, cart adds, actually sold, and convPct =
views→SALE rate in percent), "priceBands" (view→cart conversion by price range),
"discountSplit" (discounted vs full-price conversion),
"deltas" (percent change of each KPI vs the previous period of equal length),
and "previousInsights" (your earlier analyses, newest first).

IMPORTANT — real POS SALES are the ground truth for demand. This menu has NO checkout, so many
diners order verbally without ever adding to cart; add-to-cart is only a weak intent proxy. Judge an
item's success or failure on how much it actually SOLD (and its views→sale rate), NOT on cart adds.
Only fall back to cart data when sales figures are absent. Never call an item a winner because it was
carted a lot, and never call it a failure for low carts if it sold well.

Every finding must cite a specific number from the data AND carry a concrete takeaway or action —
never just restate a number. No greetings, no fluff. Write IN TURKISH.

WRITE FOR A RESTAURANT OWNER, NOT AN ANALYST. NEVER name the internal data fields or tables in your output —
the reader has never heard of "priceBands", "itemConversion", "abandonedViews", "discountSplit", "deltas",
"funnel", "topViewed", "topCarted", "bestSellers", "categoryPopularity" or "KPIs", and a phrase like
"priceBands verilerine göre" is meaningless to them. NEVER open a finding with "X verilerine göre". Say the
thing in plain restaurant Turkish instead: not "priceBands'e göre 400+ bandı" but "400₺ ve üzeri ürünler";
not "itemConversion düşük" but "çok görüntülenmesine rağmen az satılıyor".

DO NOT restate what the owner already sees at a glance. The dashboard already shows them, as their own tables
and charts, the most-viewed items, the most-added-to-cart items, the best-sellers, category popularity, and
each item's view/cart/sale figures. So a finding that merely names a ranking — "X en çok satan", "X en çok
görüntülenen", "X hem çok görüntüleniyor hem çok satıyor" — is worthless; they can read it themselves. Never
point out that something obviously-working is working; a positive confirmation of the expected is not a
finding. Each finding must expose a TENSION or non-obvious relationship they would NOT catch from those
tables — e.g. heavily viewed but rarely SOLD, a price band that kills add-to-cart, a dwell-time signal, a
period-over-period reversal, a discount that isn't moving anything — and pair it with a concrete action.

Include ONLY strong, material findings. A finding qualifies only if ALL hold:
- it rests on a meaningful sample — ignore items with very few views or sales (roughly under 5), a couple of
  data points prove nothing;
- it cites a concrete number and the movement is material (skip deltas smaller than ~10% and rounding-noise);
- it is non-obvious — NOT something visible by glancing at the dashboard's own rankings/charts;
- it leads to a clear action.
Drop anything weak, speculative, marginal, obvious, or merely restating a ranking. Fewer strong findings are
far better than many thin ones — never pad the list to look thorough.`;

const GENERATE_SYSTEM = `${DATA_CONTEXT}

Extract EVERY distinct, well-supported finding the data justifies — do NOT cap the count, but never pad:
skip anything you can't tie to a real number, and skip anything the owner already sees in the dashboard's
own rankings. Do NOT simply announce who the best or worst sellers are — that is already on screen. Instead
look for the non-obvious tension, where supported: a shared trait uniting the winners or losers (ingredient,
category, price band) that the owner wouldn't spot item-by-item; items viewed a lot but rarely SOLD (low
views→sale rate); dwell-time patterns per the bucket meanings above, with the matching fix; meaningful
period-over-period movement (deltas) — what improved, what declined; whether discounts and price bands
actually change behavior; and follow-ups on previousInsights.

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
shows it no longer applies. Hold "ongoing" and "added" to the same strength bar as generation: meaningful
sample, material number, clear action — drop weak or speculative ones rather than keep them.

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
 * Weak-argument guard: the prompt requires every finding to cite a concrete
 * number, so anything without a digit is a vague claim we drop. Also filters out
 * trivially short strings. A last-line defense on top of the prompt's strength bar.
 */
const isStrong = (s: string) => /\d/.test(s) && s.trim().length >= 15;

/**
 * One generation pass. `alreadyFound` is echoed to the model so it returns only
 * findings not already surfaced — call this in a loop to collect the full set.
 */
export async function generateFindingsBatch(data: InsightsInput, alreadyFound: string[]): Promise<string[]> {
  if (!insightsConfigured()) return [];
  const content = await chat(GENERATE_SYSTEM, JSON.stringify({ ...data, alreadyFound }));
  return parseStringArray(content).filter(isStrong);
}

/** Re-check an existing set against the latest data. Keeps the set on any failure. */
export async function revalidateFindings(data: InsightsInput, existing: string[]): Promise<RevalidateResult> {
  if (!insightsConfigured()) return { ongoing: existing, resolved: [], added: [] };
  const content = await chat(REVALIDATE_SYSTEM, JSON.stringify({ ...data, existingFindings: existing }));
  const r = parseRevalidate(content, existing);
  // Apply the same strength bar to what we keep/add (resolved is informational, left as-is).
  return { ongoing: r.ongoing.filter(isStrong), resolved: r.resolved, added: r.added.filter(isStrong) };
}

// ---------- pattern validation (the "is this a good insight?" gate) ----------

/**
 * A computed pattern candidate handed to the judge. The numbers are already
 * calculated in patterns.ts and are ground truth — the model must NOT recompute
 * or second-guess them, only decide whether the pattern is worth showing and, if
 * so, phrase it. Kept intentionally minimal so the model reasons over the claim,
 * not the whole dataset.
 */
export type PatternForJudge = {
  id: string;
  kind: "co-move" | "basket" | "time" | "segment";
  subjects: string[];
  metrics: Record<string, number | string>;
  /** Neutral English description of what was computed. */
  hint: string;
};

/** A pattern the judge kept, with its final Turkish sentence. */
export type JudgedPattern = { id: string; text: string };

const VALIDATE_SYSTEM = `You are the quality gate for a restaurant-menu "patterns" feature (QR-code menu).
You receive an array "candidates": each is a REAL statistical pattern already computed from the data
(correlation, market-basket lift, weekday over-indexing, or a segment skew). The numbers are ground truth —
NEVER recompute, doubt, or adjust them. Your ONLY job is judgment + phrasing.

KEEP a candidate only if a smart restaurant owner would find it genuinely NON-OBVIOUS and ACTIONABLE.
REJECT (keep=false) anything that is:
- obvious / already known — two universally popular items selling together, a staple that of course sells
  on busy days, "people who order food also order a drink", or any pairing whose lift is barely above 1;
- trivial or circular — restating that a bestseller sells well;
- an artifact — a correlation with a tiny sample, or a "pattern" that just reflects overall volume;
- not something the owner could act on.
Be strict: it is far better to keep 2 sharp patterns than 8 mild ones. Keeping nothing is a valid answer.

For every KEPT candidate, write ONE natural TURKISH sentence that: states the relationship in plain words,
cites the single most telling number from its metrics, and ends with a concrete action or takeaway. No
greetings, no fluff, no restating the raw metric names. The user message may include "alreadyKept" —
sentences already shown; do NOT produce anything that duplicates or rephrases those.

Respond with ONLY a JSON array of objects: [{"id":"<candidate id>","keep":true,"sentence":"<Turkish>"}].
Include every candidate you KEEP; omit or set keep=false for the rest.`;

/**
 * Run the LLM taste/novelty gate over computed candidates. Returns only the kept
 * ones with their Turkish sentence, in the model's returned order. Safe on any
 * failure (returns []), so the caller can fall back to templated sentences.
 */
export async function validatePatterns(
  candidates: PatternForJudge[],
  alreadyKept: string[] = []
): Promise<JudgedPattern[]> {
  if (!insightsConfigured() || candidates.length === 0) return [];
  const content = await chat(VALIDATE_SYSTEM, JSON.stringify({ candidates, alreadyKept }));
  const trimmed = stripFence(content);
  const validIds = new Set(candidates.map((c) => c.id));
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    const out: JudgedPattern[] = [];
    const usedIds = new Set<string>();
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as { id?: unknown; keep?: unknown; sentence?: unknown };
      const id = String(r.id ?? "");
      const text = String(r.sentence ?? "").trim();
      // keep defaults to true when the model emits only survivors (per the prompt).
      const keep = r.keep === undefined ? true : Boolean(r.keep);
      if (!keep || !validIds.has(id) || usedIds.has(id) || !isStrong(text)) continue;
      usedIds.add(id);
      out.push({ id, text });
    }
    return out;
  } catch {
    return [];
  }
}

function stripFence(content: string): string {
  return content
    // Defense in depth: drop any reasoning-model <think> block that leaks into
    // content (e.g. if reasoning_format is ever "raw"), so the JSON survives.
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```(?:json)?/, "")
    .replace(/```$/, "")
    .trim();
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
