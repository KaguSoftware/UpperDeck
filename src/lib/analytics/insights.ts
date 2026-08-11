import "server-only";
import { env } from "@/lib/env";
import type { MenuEngineeringForModel } from "@/lib/analytics/menu-matrix";
import {
  MIN_TREND_DAYS,
  MIN_WEEKDAY_DAYS,
  TR_WEEKDAYS,
  type DataBasis,
} from "@/lib/analytics/confidence";

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
//
// Was `llama-3.3-70b-versatile`, which Groq scheduled for decommission on
// 2026-08-16 (its listed replacement is this model). A retired model answers every
// request with a 4xx, and `chat()` turns any non-OK response into "" — which the
// caller reads as "no findings" and renders as "Yorum oluşturulamadı", identically
// on every retry. Nothing about that surface says "wrong model", so it is worth
// stating here: if this card fails permanently while the rest of the tab is fine,
// check this constant against the models list before anything else.
const MODEL = "openai/gpt-oss-120b";

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
  bestSellers: { item_name: string; qty: number; revenue: number }[];
  funnel: { step: string; count: number }[];
  abandonedViews: { name: string; b5to10: number; b10to20: number; b20plus: number; total: number }[];
  categoryPopularity: { name: string; count: number }[];
  /** Per item: views, real POS quantity sold, and views→SALE rate. No cart column
   *  on purpose — it only ever tempted the model into cart-based verdicts. */
  itemConversion: { name: string; views: number; sold: number; convPct: number }[];
  /** Per price band: views, real POS quantity + revenue, and views→SALE rate. */
  priceBands: { band: string; views: number; sold: number; revenue: number; convPct: number }[];
  /** Discounted vs full-price, measured on real sales (not cart adds). */
  discountSplit: { group: string; views: number; sold: number; convPct: number }[];
  /** KPI deltas vs the chosen comparison window, in percent (null = no baseline). */
  deltas: Record<string, number | null>;
  /**
   * WHICH window `deltas` compares against. "The period before this one" is only
   * one of three choices ("önceki dönem" / "4 hafta önce" / "geçen yıl"), and a
   * finding that says "geçen döneme göre" when the owner picked last year is
   * simply wrong — so the label travels with the numbers.
   */
  comparison: { basis: string; label: string; from: string; to: string; hasData: boolean };
  /**
   * Cost-derived profit picture: the menu-engineering matrix (star / plowhorse /
   * puzzle / dog per item), the covered totals, and how much of the period's
   * revenue has a cost entered. null when no cost has been entered at all — the
   * model then has no profit data and must not invent margins.
   */
  menuEngineering: MenuEngineeringForModel | null;
  /**
   * How much data each KIND of claim may rest on. Sample size is the difference
   * between a finding and a coincidence, and the model cannot see the shape of the
   * calendar from the numbers alone: "Wednesdays run 5.3×" over a 16-day range is
   * a claim about two Wednesdays, and one burnt owner stops trusting the section.
   */
  dataBasis: DataBasis;
  /** Earlier generated insight sets, newest first — lets the model follow up on past advice. */
  previousInsights: { date: string; insights: string[] }[];
  /**
   * Lines the deterministic overview card ALREADY shows on the same screen. The
   * model repeating them is the single biggest source of filler, so they are
   * handed over explicitly as things not to say again.
   */
  alreadyShown: string[];
  /**
   * Share of the period's days that actually have POS data (0–1) and the day
   * counts behind it. Below ~0.9 the totals under-report and every
   * period-over-period figure is arithmetic across unequal spans — the model has
   * to know before it calls a gap a decline.
   */
  salesCoverage: { days: number; daysWithData: number; ratio: number };
};

/** Findings shown at once. Five with money attached beat nineteen without. */
export const MAX_FINDINGS = 5;

/**
 * Largest ₺ amount a finding cites, used to rank by money at stake.
 *
 * Turkish digit grouping is "55.000" / "1.250,50", so dots are thousands
 * separators and the comma is the decimal mark — parsing them the other way
 * around turns ₺55.000 into ₺55 and buries the biggest finding. Returns 0 when
 * the finding names no amount, which sorts it below every one that does.
 */
export function findingImpact(text: string): number {
  let max = 0;
  // A number immediately before or after a ₺ / "TL" marker — a bare "12" in
  // "12 adet" is a quantity, not money, and must not outrank a real amount.
  const re = /(?:₺|\bTL\b)\s*([\d.]+(?:,\d+)?)|([\d.]+(?:,\d+)?)\s*(?:₺|\bTL\b)/gi;
  for (const m of text.matchAll(re)) {
    const raw = (m[1] ?? m[2] ?? "").replace(/\./g, "").replace(",", ".");
    const n = Number(raw);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max;
}

/**
 * Rank by money at stake and cut to `limit`. Applied to whatever the model
 * returns, so a run that ignores the cap still can't flood the card.
 */
export function rankFindings(findings: string[], limit = MAX_FINDINGS): string[] {
  return [...findings]
    .map((text, i) => ({ text, impact: findingImpact(text), i }))
    .sort((a, b) => b.impact - a.impact || a.i - b.i)
    .slice(0, limit)
    .map((f) => f.text);
}

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
You receive engagement data (item views, waiter calls) and real POS sales for a date range,
plus an "abandonedViews" table: items whose detail page was opened and closed WITHOUT ordering,
bucketed by how long the diner looked — 5-10s (photo/appeal likely weak), 10-20s (description not convincing),
20s+ (read everything and still didn't buy: content or price problem).
You also receive: "itemConversion" (per item: views, quantity actually SOLD, and convPct =
views→SALE rate in percent), "priceBands" (per price range: views, quantity SOLD, revenue, and convPct =
views→SALE rate), "discountSplit" (discounted vs full-price items, same views/sold/convPct shape),
"deltas" (percent change of each KPI vs the comparison window described in "comparison" — read
comparison.label and NAME that window in your sentence; it may be the preceding period, four weeks earlier,
or the same period last year, and calling it the wrong thing makes the finding false),
"menuEngineering" (see below), "dataBasis" (see below),
and "previousInsights" (your earlier analyses, newest first).

PROFIT IS THE LANGUAGE, NOT REVENUE. When "menuEngineering" is present, each item carries a real cost-based
unit margin, a total profit for the period, and a quadrant from the standard menu-engineering framework:
- "star": popular AND high margin → protect it; never discount it, never shrink its portion.
- "plowhorse": popular but LOW margin → it carries traffic and earns little; raise the price a little or cut
  the portion cost. This is where the money usually is.
- "puzzle": high margin but UNPOPULAR → worth promoting harder (placement, photo, staff mention).
- "dog": unpopular AND low margin → candidate to cut from the menu.
Prefer profit over revenue in every comparison: a top-revenue plowhorse losing to a mid-revenue star is the
kind of finding the owner cannot see anywhere else on the dashboard. An item whose unitMargin is negative is
sold BELOW cost — always worth a finding. Use the quadrant words in plain Turkish (yıldız / yük atı / bilmece
/ köpek is jargon — say "hem çok satıyor hem yüksek kâr bırakıyor", "çok satıyor ama kâr bırakmıyor",
"kârlı ama az satıyor", "az satıyor ve kâr da bırakmıyor").
menuEngineering.covered.revenueSharePct is the share of the period's real revenue whose items have a cost
entered. When it is low (or covered.reliable is false), a profit finding speaks ONLY for those items — say so,
and never present the covered profit as the restaurant's total profit. When "menuEngineering" is null, no cost
has been entered: do not mention margin, cost or profit at all, and do not estimate them.

SAMPLE SIZE IS A HARD GATE, NOT A CAVEAT. "dataBasis" tells you exactly how much data exists:
- Never make a WEEKDAY claim ("Çarşamba günleri…") unless that weekday appears at least ${MIN_WEEKDAY_DAYS}
  times in dataBasis.weekdayCounts. Two Wednesdays is not a pattern, however extreme the ratio.
- Never build a finding on fewer than 5 sold units or 5 views for the item in question.
- When dataBasis.salesDays is under ${MIN_TREND_DAYS}, do not describe any trend, rise or fall in sales at all.
- Whenever a finding rests on a SUBSET of the period (a weekday, a handful of days, one item's few sales),
  state that sample inside the sentence — "4 Çarşamba günü üzerinden", "12 günün verisiyle". A claim whose
  sample cannot be stated out loud without embarrassment must be dropped, not softened.
Dropping a thin finding costs nothing. Publishing one costs the owner's trust in everything else here.

IMPORTANT — real POS SALES are the ground truth for demand, and EVERY conversion figure you are given is
already views→SALE. This menu has NO checkout: the cart is an optional scratchpad most diners skip before
ordering verbally, so per-item and per-band add-to-cart counts are NOT provided and must never be invented
or inferred. Judge an item, a price band or a discount ONLY on what it actually SOLD and its views→sale rate.
Never describe an item, band or discount in terms of "sepete eklenme" / "sepete ekleme oranı" — that data
does not exist here. (The single exception is the KPI "cartConversion": the share of sessions that opened the
cart and went on to call the waiter. It is a whole-restaurant engagement rate — usable for a period-over-period
observation, NEVER as evidence about any item, price band or discount.)
A convPct above 100 is NOT success and NEVER evidence that an item, band or price is working. It is an
exposure problem: the item sells more than its menu page is ever opened, i.e. diners order it WITHOUT
browsing it (verbally, from habit, or from a printed menu). Read it as "this product is not being browsed" —
so the menu is doing nothing for it and any menu-side change to it will reach almost nobody — never as
"içeriği veya fiyatı başarılı görünüyor". The reverse case (a high views→sale rate under 100) is the one that
says the menu page is converting.
When sold figures are entirely absent for the period, say so plainly instead of substituting an engagement
proxy for demand.

"salesCoverage" tells you how much of the period the POS log actually covers. When ratio is below 0.9 the
totals are INCOMPLETE — missing days, not lost business. In that case you must not attribute any total or
period-over-period change to performance; either say the data is incomplete or drop the finding.

Every finding must cite a specific number from the data AND carry a concrete takeaway or action —
never just restate a number. No greetings, no fluff. Write IN TURKISH.

ATTACH THE MONEY. Every finding must end with what it is worth per month, in ₺, derived from the figures you
were given — e.g. "ayda yaklaşık 55.000 ₺" — computed from the item's own revenue, its sold quantity times
its effective price, or the revenue of the band it sits in, scaled to 30 days from the range length. Say
"yaklaşık"; an estimate is expected. A finding with no money attached is not worth showing: drop it.

WRITE FOR A RESTAURANT OWNER, NOT AN ANALYST. NEVER name the internal data fields or tables in your output —
the reader has never heard of "priceBands", "itemConversion", "abandonedViews", "discountSplit", "deltas",
"funnel", "topViewed", "bestSellers", "categoryPopularity" or "KPIs", and a phrase like
"priceBands verilerine göre" is meaningless to them. NEVER open a finding with "X verilerine göre". Say the
thing in plain restaurant Turkish instead: not "priceBands'e göre 400+ bandı" but "400₺ ve üzeri ürünler";
not "itemConversion düşük" but "çok görüntülenmesine rağmen az satılıyor".

DO NOT restate what the owner already sees at a glance. The dashboard already shows them, as their own tables
and charts, the most-viewed items, the best-sellers, category popularity, and each item's view/sale figures.
So a finding that merely names a ranking — "X en çok satan", "X en çok
görüntülenen", "X hem çok görüntüleniyor hem çok satıyor" — is worthless; they can read it themselves. Never
point out that something obviously-working is working; a positive confirmation of the expected is not a
finding. Each finding must expose a TENSION or non-obvious relationship they would NOT catch from those
tables — e.g. heavily viewed but rarely SOLD, a price band whose items barely sell per view, a dwell-time
signal, a period-over-period reversal, a discount that isn't moving sales — and pair it with a concrete action.

The user message includes "alreadyShown": sentences the dashboard's own summary card is ALREADY displaying,
immediately above yours, on the same screen. Never repeat, rephrase or elaborate any of them — a finding that
overlaps one of those lines is worse than no finding, because the reader sees the same sentence twice.

Include ONLY strong, material findings. A finding qualifies only if ALL hold:
- it rests on a meaningful sample — ignore items with very few views or sales (roughly under 5), a couple of
  data points prove nothing;
- it cites a concrete number and the movement is material (skip deltas smaller than ~10% and rounding-noise);
- it is non-obvious — NOT something visible by glancing at the dashboard's own rankings/charts, and not
  already in "alreadyShown";
- it leads to a clear action;
- it carries a ₺ figure for what acting on it is worth per month;
- it clears the sample-size gate above, and names its sample whenever it rests on a subset of the period.
Drop anything weak, speculative, marginal, obvious, or merely restating a ranking. Fewer strong findings are
far better than many thin ones — never pad the list to look thorough.

NEVER produce several findings of the same shape. One sentence per product saying "X'in satış oranı düşük,
içeriği veya fiyatı gözden geçirilmelidir", repeated for every item and price band, is the failure mode to
avoid: if many items share a problem, that is ONE finding about the group, with the combined money attached.`;

const GENERATE_SYSTEM = `${DATA_CONTEXT}

Return AT MOST ${MAX_FINDINGS} findings, ordered by how much money is at stake — biggest first. Fewer is
fine; returning two sharp findings is a better answer than five padded ones. Never pad:
skip anything you can't tie to a real number, and skip anything the owner already sees in the dashboard's
own rankings. Do NOT simply announce who the best or worst sellers are — that is already on screen. Instead
look for the non-obvious tension, where supported: a shared trait uniting the winners or losers (ingredient,
category, price band) that the owner wouldn't spot item-by-item; items viewed a lot but rarely SOLD (low
views→sale rate); dwell-time patterns per the bucket meanings above, with the matching fix; meaningful
period-over-period movement (deltas) — what improved, what declined; whether discounts and price bands
actually change real SALES; a popular item that earns far less profit than a quieter one (menuEngineering);
an item selling below cost; and follow-ups on previousInsights.

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
sample, material number, clear action, ₺ impact attached — drop weak or speculative ones rather than keep
them. "ongoing" plus "added" must not exceed ${MAX_FINDINGS} sentences in total; when more survive, keep the
ones with the most money at stake and drop the rest.

Respond with ONLY a JSON object: {"ongoing":[...],"resolved":[...],"added":[...]}.`;

/**
 * Why the last upstream call failed, if it did.
 *
 * `chat()` collapses every failure into "" and the caller reads "" as "the model
 * found nothing" — so a dead API key, a decommissioned model and a genuinely
 * quiet dataset all render as the same "Yorum oluşturulamadı". That message sends
 * the owner to a retry button which cannot possibly help, because a 4xx is
 * identical on every attempt. Recording the reason lets the UI say which of the
 * two it is, and the owner stop retrying something that will never succeed.
 *
 * Module-scoped rather than threaded through every return type: the failure is
 * about the transport, not about any one caller's data, and every entry point
 * runs inside one request.
 */
let lastUpstreamError: string | null = null;

/** The last Groq transport/API failure, or null if the last call reached the model. */
export function lastInsightsError(): string | null {
  return lastUpstreamError;
}

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
      const body = (await res.text()).slice(0, 300);
      console.error("[insights] Groq request failed", res.status, body);
      // 4xx is a configuration fault (key, model, quota) — it will fail the same
      // way forever. 5xx really is worth another attempt.
      lastUpstreamError =
        res.status >= 400 && res.status < 500
          ? `Groq ${res.status} — model/anahtar ayarı (yeniden denemek çözmez)`
          : `Groq ${res.status} — geçici sunucu hatası`;
      return "";
    }
    lastUpstreamError = null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    console.error("[insights] request error", err);
    lastUpstreamError = "Groq'a ulaşılamadı — ağ hatası";
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
 * Turkish weekday names as a finding would spell them, longest first.
 *
 * The order is load-bearing: "Cumartesi" contains "Cuma" and "Pazartesi" contains
 * "Pazar", so a shorter name tested first would credit a Saturday claim to Friday's
 * sample. Suffixes are matched loosely (-ları, -leri, -da…) because the model
 * writes "Çarşambaları", not "Çarşamba".
 */
const WEEKDAY_PATTERNS: { day: string; re: RegExp }[] = [...TR_WEEKDAYS]
  .sort((a, b) => b.length - a.length)
  .map((day) => ({ day, re: new RegExp(day.replace("ı", "[ıi]"), "i") }));

/** Words that assert a movement over time — the claims MIN_TREND_DAYS guards. */
const TREND_WORDS =
  /(artt|arttı|artış|yüksel|düş(tü|üş)|geriled|azal|iyileş|kötüleş|trend|ivme|yavaşla|hızlan)/i;

/**
 * Drop findings whose sample the data can't support — the last line of the
 * confidence gate, after the prompt has already been told the rules.
 *
 * The prompt is instruction; this is enforcement. A model told "never claim a
 * weekday pattern from two Wednesdays" will still occasionally do it, and that one
 * finding is the one that costs the owner's trust in the whole section. Both checks
 * are deliberately narrow (they read the claim's SUBJECT, never its argument) so a
 * legitimate finding is never silently swallowed:
 *
 *  - a sentence naming a weekday is dropped unless that weekday actually occurs
 *    MIN_WEEKDAY_DAYS times among the days with sales data;
 *  - a sentence asserting a rise or fall is dropped when the period holds fewer
 *    than MIN_TREND_DAYS recorded days to draw a line through.
 */
export function dropLowConfidenceClaims(
  texts: string[],
  basis: DataBasis
): { kept: string[]; dropped: string[] } {
  const counts = new Map(basis.weekdayCounts.map((w) => [w.day, w.days]));
  const kept: string[] = [];
  const dropped: string[] = [];

  for (const text of texts) {
    const named = WEEKDAY_PATTERNS.find((w) => w.re.test(text));
    if (named && (counts.get(named.day) ?? 0) < MIN_WEEKDAY_DAYS) {
      dropped.push(text);
      continue;
    }
    if (basis.salesDays < MIN_TREND_DAYS && TREND_WORDS.test(text)) {
      dropped.push(text);
      continue;
    }
    kept.push(text);
  }
  return { kept, dropped };
}

/** Everything the confidence gate rejects, logged once so thin output is debuggable. */
function gate(texts: string[], data: InsightsInput): string[] {
  const { kept, dropped } = dropLowConfidenceClaims(texts.filter(isStrong), data.dataBasis);
  if (dropped.length) {
    console.warn(`[insights] dropped ${dropped.length} low-confidence finding(s)`, dropped);
  }
  return kept;
}

/**
 * One generation pass. `alreadyFound` is echoed to the model so it returns only
 * findings not already surfaced — call this in a loop to collect the full set.
 */
export async function generateFindingsBatch(data: InsightsInput, alreadyFound: string[]): Promise<string[]> {
  if (!insightsConfigured()) return [];
  const content = await chat(GENERATE_SYSTEM, JSON.stringify({ ...data, alreadyFound }));
  return gate(parseStringArray(content), data);
}

/** Re-check an existing set against the latest data. Keeps the set on any failure. */
export async function revalidateFindings(data: InsightsInput, existing: string[]): Promise<RevalidateResult> {
  if (!insightsConfigured()) return { ongoing: existing, resolved: [], added: [] };
  const content = await chat(REVALIDATE_SYSTEM, JSON.stringify({ ...data, existingFindings: existing }));
  const r = parseRevalidate(content, existing);
  // Apply the same strength + confidence bar to what we keep/add. `resolved` is
  // informational ("this no longer holds"), so it passes through untouched.
  return { ongoing: gate(r.ongoing, data), resolved: r.resolved, added: gate(r.added, data) };
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
  kind: "co-move" | "basket" | "time" | "segment" | "margin";
  subjects: string[];
  metrics: Record<string, number | string>;
  /** Neutral English description of what was computed. */
  hint: string;
  /**
   * The sample the claim rests on, already tiered by the miner. Handed over so the
   * judge phrases the sample INTO the sentence rather than presenting a thin figure
   * as settled fact — thin candidates are surfaced, not suppressed, so the wording
   * is what carries the caveat.
   */
  confidence: "high" | "medium" | "low";
  /** That sample in plain Turkish, e.g. "4 Çarşamba günü" — quote it verbatim. */
  sampleLabel: string;
};

/** A pattern the judge kept, with its final Turkish sentence. */
export type JudgedPattern = { id: string; text: string };

const VALIDATE_SYSTEM = `You are the quality gate for a restaurant-menu "patterns" feature (QR-code menu).
You receive an array "candidates": each is a REAL statistical pattern already computed from the data
(correlation, market-basket lift, weekday over-indexing, a segment skew, or a cost-based margin movement).
The numbers are ground truth — NEVER recompute, doubt, or adjust them. Your ONLY job is judgment + phrasing.

Each candidate carries "sampleLabel" (how much data it rests on, in plain Turkish) and "confidence"
("high", "medium" or "low"). You MUST include the sampleLabel inside the sentence you write, verbatim, in
parentheses or as a clause — e.g. "(4 Çarşamba günü üzerinden)". An owner reading a pattern has to be able to
see how much it stands on without asking. Then match the STRENGTH OF THE CLAIM to the confidence:
- "high": state it as an established pattern and recommend the action directly.
- "medium": state it as an emerging signal ("…gibi görünüyor", "…eğilimi var") and keep the action cheap and
  reversible — never recommend cutting an item or changing a price on a medium sample.
- "low": the sample is genuinely thin, so write it as a HYPOTHESIS TO WATCH, not a finding. Say plainly that
  the data is limited ("henüz az veriyle", "doğrulanması gerek") and let the action be nothing more than
  "izleyin" / "veri biriktikçe tekrar bakın". Never attach a confident number-driven instruction to a "low"
  candidate, and never imply it is proven. A low candidate is still worth showing — it is an early hint the
  owner may recognise from the floor — but it must never read like the high-confidence ones.
Judge NOVELTY the same way at every tier: a thin sample is not an excuse to keep an obvious pattern.

Every quantity in these candidates comes from REAL sales (owner-entered POS quantities) or from item views.
This menu has NO checkout and add-to-cart data is deliberately not part of any candidate, so a "conversion"
here always means views → actually SOLD. Never phrase a pattern as being about "sepete ekleme" / adding to
cart, and never present a sales rate as an intent or cart rate.

KEEP a candidate only if a smart restaurant owner would find it genuinely NON-OBVIOUS and ACTIONABLE.
REJECT (keep=false) anything that is:
- obvious / already known — two universally popular items selling together, a staple that of course sells
  on busy days, "people who order food also order a drink", or any pairing whose lift is barely above 1;
- trivial or circular — restating that a bestseller sells well;
- an artifact — a "pattern" that just reflects overall volume rather than a relationship;
- not something the owner could act on OR watch for;
- a medium- or low-confidence claim whose implied action is expensive or irreversible (rewrite it as
  something to watch instead of rejecting it, if the relationship itself is interesting).
Note that a small sample is NOT by itself a reason to reject: report it as a hypothesis per the tier rules
above. Reject for being obvious, circular or unusable — not for being early.
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
