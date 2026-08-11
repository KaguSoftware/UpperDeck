"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import { resolveRange, resolveCompare, datesInRange, type CompareBasis } from "@/lib/analytics/range";
import {
  getRealSalesSummary,
  getRealBestSellers,
  listSalesEntries,
  type DateRange,
} from "@/lib/analytics/sales";
import { getMenuEngineering, menuEngineeringForModel } from "@/lib/analytics/menu-matrix";
import { buildDataBasis } from "@/lib/analytics/confidence";
import { getItemConversion, getAbandonedViewsNet } from "@/lib/analytics/compare";
import {
  getTopViewedItems,
  getEngagementFunnel,
  getSessionStats,
  getCartConversion,
  getCategoryPopularity,
  engagementWindow,
} from "@/lib/analytics/posthog";
import { getPriceBandSales, getDiscountSalesSplit } from "@/lib/analytics/price-bands";
import { buildOverview } from "@/lib/analytics/overview";
import {
  loadBusinessDayStart,
  normalizeBusinessDayStart,
  BUSINESS_DAY_START_KEY,
} from "@/lib/analytics/business-day";
import { getLocalizedCategoryNames, localizeCategoryCounts } from "@/lib/analytics/categories";
import {
  generateFindingsBatch,
  revalidateFindings,
  insightsConfigured,
  isInsightFresh,
  validatePatterns,
  rankFindings,
  lastInsightsError,
  MAX_FINDINGS,
  type InsightsInput,
  type PatternForJudge,
} from "@/lib/analytics/insights";
import {
  minePatterns,
  MAX_PATTERN_LEVEL,
  type PatternKind,
  type PatternConfidence,
} from "@/lib/analytics/patterns";
import {
  getExclusionRules,
  makeKeepFilter,
  normalizeExclusionList,
  dropExcludedMentions,
  pickOffMenu,
  exclusionSignature,
  itemKey,
  type ExclusionRules,
  EXCLUDED_ITEMS_SETTINGS_KEY,
  AUTO_EXCLUDE_OFFMENU_SETTINGS_KEY,
  OFFMENU_OVERRIDES_SETTINGS_KEY,
} from "@/lib/analytics/exclusions";

const RangeSchema = z.object({
  range: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  // Which window the deltas compare against — the AI has to name the same one the
  // KPI cards do, or its "…e göre" clause is simply false. See resolveCompare.
  cmp: z.string().optional(),
  mode: z.enum(["load", "recheck"]).optional(),
});

// In-memory cache per date range, 1h TTL. Fine for this single-instance
// dashboard; resets on redeploy, which just means one extra generation.
const cache = new Map<string, { at: number; findings: string[] }>();
const TTL_MS = 60 * 60 * 1000;

// Cap the generation loop. Each cycle asks the model for findings it hasn't
// surfaced yet; it stops early once a cycle returns nothing new.
const MAX_CYCLES = 3;

/** Pause between generation cycles so the free tier's per-minute token bucket
 *  refills before the next full-payload request. See generateAll. */
const CYCLE_GAP_MS = 8_000;

/** Non-zero temperature for recall-only cycles — see generateAll. Small on
 *  purpose: enough to explore a different angle, not enough to invent numbers. */
const RECALL_TEMPERATURE = 0.4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type InsightFinding = { text: string; isNew: boolean };
export type InsightsResult = {
  ok: boolean;
  /** The current canonical set. `isNew` marks findings added by the latest recheck. */
  findings: InsightFinding[];
  /** Findings that a recheck determined no longer hold (empty on a plain load). */
  resolved: string[];
  /** True when served from cache/stored set without hitting the model. */
  cached: boolean;
  /**
   * Why it failed, when the cause is known and RETRYING WON'T FIX IT (bad key,
   * retired model, no AI configured). Absent when the model was reached and simply
   * had nothing to say — the one case where the retry button is the right advice.
   */
  reason?: string;
  /** False when the failure is permanent — the UI hides the retry button. */
  retryable?: boolean;
};

const FAIL: InsightsResult = { ok: false, findings: [], resolved: [], cached: false };

/** FAIL carrying a diagnosis, so the card can explain itself instead of guessing. */
function failWith(reason: string, retryable: boolean): InsightsResult {
  return { ...FAIL, reason, retryable };
}

function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

const normFinding = (s: string) => s.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");

/** Drop batch entries already present in `have` (exact or containment) — a safety
 *  net on top of the model being told not to repeat `alreadyFound`. */
function dedupeNew(batch: string[], have: string[]): string[] {
  const seen = have.map(normFinding).filter(Boolean);
  const out: string[] = [];
  for (const b of batch) {
    const n = normFinding(b);
    if (!n) continue;
    if (seen.some((s) => s === n || s.includes(n) || n.includes(s))) continue;
    seen.push(n);
    out.push(b);
  }
  return out;
}

/** Same findings regardless of order (normalized) — used to skip no-op recheck rows. */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b.map(normFinding));
  return a.every((x) => bs.has(normFinding(x)));
}

function toResult(findings: string[], resolved: string[], newlyAdded: Set<string>, cached: boolean): InsightsResult {
  return {
    ok: true,
    findings: findings.map((t) => ({ text: t, isNew: newlyAdded.has(normFinding(t)) })),
    resolved,
    cached,
  };
}

/**
 * Latest persisted set for this exact range AND comparison basis (with its age),
 * or empty if none.
 *
 * The basis is part of the identity, not a detail: findings name the window they
 * compare against, so a set generated under "geçen yıl" must never be replayed
 * while the badges above it read "önceki dönem".
 */
async function loadStoredSet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  range: DateRange,
  basis: CompareBasis
): Promise<{ insights: string[]; createdAt: string | null }> {
  const { data } = await supabase
    .from("analytics_insights")
    .select("insights, created_at")
    .eq("range_from", range.from)
    .eq("range_to", range.to)
    .eq("compare_basis", basis)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  return {
    insights: Array.isArray(row?.insights) ? row.insights.map(String).filter(Boolean) : [],
    createdAt: row?.created_at ?? null,
  };
}

/**
 * The ignored items of a range as actual NAMES, for the two places that reuse a
 * stored set and so need names rather than the `keep` predicate: stripping AI
 * findings that quote an ignored item, and dropping patterns about one.
 *
 * The manual list is already names. The auto (off-menu) rule is a predicate, so it
 * gets resolved against a universe — the range's sold items, deep enough to cover
 * the tail. Resolving through a real universe is also what keeps the auto rule off
 * a pattern's NON-item subjects (price bands, "İndirim"): those never appear in the
 * sold list, so they are never treated as delisted products.
 *
 * The read only happens when the rule is on and a stored set exists to reuse, so
 * the default path costs nothing extra.
 */
async function ignoredItemNames(rules: ExclusionRules, range: DateRange): Promise<string[]> {
  if (!rules.autoOffMenu || rules.menu === null) return rules.manual;
  const sold = await getRealBestSellers(range, 500);
  return [...rules.manual, ...pickOffMenu(rules, sold.map((s) => s.item_name))];
}

/** Assemble everything the model sees for a range (shared by generate + recheck). */
async function buildInsightsInput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  range: DateRange,
  preset: string,
  cmp: string | undefined
): Promise<InsightsInput> {
  // The owner's chosen baseline, not an assumed one: "önceki dönem", "4 hafta
  // önce" or "geçen yıl". Every delta below — and the sentence the model writes
  // about it — refers to this window.
  const compare = resolveCompare({ cmp }, range);
  const prev = compare.range;

  // Drop ignored items (manually ticked + off-menu when that rule is on) from the
  // item-level lists the model reasons over, so its findings match the (filtered)
  // charts. Aggregate KPIs/funnel stay whole. Read first: the price-band and
  // discount aggregates are built FROM item-level data, so they need the filter at
  // aggregation time, not after.
  const rules = await getExclusionRules(supabase);
  const keep = makeKeepFilter(rules);

  const [
    summary,
    bestSellers,
    topViewed,
    funnel,
    sessions,
    cartConversion,
    categoryPopularity,
    abandonedViews,
    itemConversion,
    priceBands,
    discountSplit,
    prevSummary,
    prevFunnel,
    prevSessions,
    prevCartConversion,
    categoryNames,
    menuEngineering,
    entries,
  ] = await Promise.all([
    getRealSalesSummary(range),
    getRealBestSellers(range),
    getTopViewedItems(range),
    getEngagementFunnel(range),
    getSessionStats(range),
    getCartConversion(range),
    getCategoryPopularity(range),
    getAbandonedViewsNet(range),
    getItemConversion(range),
    getPriceBandSales(range, keep),
    getDiscountSalesSplit(range, keep),
    getRealSalesSummary(prev),
    getEngagementFunnel(prev),
    getSessionStats(prev),
    getCartConversion(prev),
    getLocalizedCategoryNames(supabase),
    // Profit side. Empty (hasData: false) until a cost is entered, in which case
    // the model is told there is no margin data rather than shown zeros.
    getMenuEngineering(range, keep),
    // Which DAYS actually have POS data — the calendar behind every sample-size
    // rule in the prompt (a 16-day range holds two Wednesdays).
    listSalesEntries(range),
  ]);

  const funnelCount = (f: { step: string; count: number }[], prefix: string) =>
    f.find((x) => x.step.startsWith(prefix))?.count ?? 0;
  const views = funnelCount(funnel, "Görüntü");
  const waiterCalls = funnelCount(funnel, "Garson");

  // Mirrors page.tsx: the tracking floor can shorten the PREVIOUS window without
  // shortening the current one, and a delta between windows of different lengths
  // is a fabricated number. No comparable baseline → no engagement delta.
  const engagementComparable =
    !engagementWindow(prev).empty && engagementWindow(prev).days === engagementWindow(range).days;
  const engDelta = (cur: number, previous: number) => (engagementComparable ? pctDelta(cur, previous) : null);

  // What the deterministic summary card is already saying on the same screen —
  // handed to the model as things not to repeat. Built from the same numbers the
  // client builds it from, so the two lists can't drift.
  const deltasForOverview = {
    totalSales: pctDelta(summary.totalSales, prevSummary.totalSales),
    totalCovers: summary.totalCovers > 0 ? pctDelta(summary.totalCovers, prevSummary.totalCovers) : null,
    avgSpendPerCover:
      summary.totalCovers > 0 ? pctDelta(summary.avgSpendPerCover, prevSummary.avgSpendPerCover) : null,
    views: engDelta(views, funnelCount(prevFunnel, "Görüntü")),
    cartConversion: engDelta(cartConversion, prevCartConversion),
    sessions: engDelta(sessions.sessions, prevSessions.sessions),
  };
  const overview = buildOverview({
    preset,
    kpis: {
      totalSales: summary.totalSales,
      totalCovers: summary.totalCovers,
      avgSpendPerCover: summary.avgSpendPerCover,
      sessions: sessions.sessions,
      avgSeconds: sessions.avgSeconds,
      waiterCalls,
      views,
      cartConversion,
    },
    deltas: deltasForOverview,
    itemConversion: itemConversion.filter((x) => keep(x.name)),
    abandonedViews: abandonedViews.filter((x) => keep(x.name)),
    bestSellers: bestSellers.filter((x) => keep(x.item_name)),
    menuEngineering,
  });

  // Earlier analyses (may be empty; table might not exist yet — that's fine).
  const { data: historyRows } = await supabase
    .from("analytics_insights")
    .select("created_at, insights")
    .order("created_at", { ascending: false })
    .limit(3);
  const previousInsights = ((historyRows ?? []) as { created_at: string; insights: string[] }[]).map((r) => ({
    date: r.created_at.slice(0, 10),
    insights: r.insights,
  }));

  return {
    range,
    kpis: {
      totalSales: summary.totalSales,
      totalCovers: summary.totalCovers,
      avgSpendPerCover: summary.avgSpendPerCover,
      sessions: sessions.sessions,
      avgSeconds: sessions.avgSeconds,
      waiterCalls,
      views,
      cartConversion,
    },
    topViewed: topViewed.filter((x) => keep(x.name)),
    bestSellers: bestSellers.filter((x) => keep(x.item_name)),
    // The "Sepete Eklenen" step is withheld from the model (the chart still shows
    // it to the owner): given a views count and a cart count side by side it kept
    // reading the ratio as demand, which is exactly the wrong verdict here.
    funnel: funnel.filter((f) => !f.step.startsWith("Sepete")),
    abandonedViews: abandonedViews.filter((x) => keep(x.name)),
    // Localized names, matching the chart — the model would otherwise write
    // findings about "cold-drinks" in an otherwise Turkish sentence.
    categoryPopularity: localizeCategoryCounts(categoryPopularity, categoryNames),
    // Cart counts are dropped here on purpose: the model kept reading views→carts
    // as demand. It sees views, real sold quantity and the views→sale rate only.
    itemConversion: itemConversion
      .filter((x) => keep(x.name))
      .map(({ name, views, sold, convPct }) => ({ name, views, sold, convPct })),
    priceBands: priceBands.map((b) => ({
      ...b,
      convPct: b.views > 0 ? Math.round((b.sold / b.views) * 100) : 0,
    })),
    discountSplit: discountSplit.map((d) => ({
      ...d,
      convPct: d.views > 0 ? Math.round((d.sold / d.views) * 100) : 0,
    })),
    deltas: {
      totalSales: pctDelta(summary.totalSales, prevSummary.totalSales),
      totalCovers: pctDelta(summary.totalCovers, prevSummary.totalCovers),
      views: engDelta(views, funnelCount(prevFunnel, "Görüntü")),
      waiterCalls: engDelta(waiterCalls, funnelCount(prevFunnel, "Garson")),
      sessions: engDelta(sessions.sessions, prevSessions.sessions),
    },
    comparison: {
      basis: compare.basis,
      label: compare.label,
      from: prev.from,
      to: prev.to,
      // No entries in the baseline window → every delta is null and the model must
      // not narrate a change. Common on "geçen yıl" before a year of history exists.
      hasData: prevSummary.daysWithData > 0,
    },
    menuEngineering: menuEngineeringForModel(menuEngineering),
    dataBasis: buildDataBasis({
      range,
      salesDates: entries.map((e) => e.entry_date),
      sessions: sessions.sessions,
      engagementDays: engagementWindow(range).days,
      itemsWithSales: bestSellers.filter((b) => keep(b.item_name) && b.qty > 0).length,
    }),
    previousInsights,
    alreadyShown: [overview.headline, ...overview.strengths, ...overview.push, ...overview.watch],
    salesCoverage: {
      days: datesInRange(range).length,
      daysWithData: summary.daysWithData,
      ratio: datesInRange(range).length > 0 ? summary.daysWithData / datesInRange(range).length : 0,
    },
  };
}

/**
 * Build in cycles, then keep only the five findings with the most money at stake.
 *
 * The cycles are a RECALL device, not a length target: each pass asks the model
 * for findings it hasn't surfaced yet, so the pool is wide before it's cut. What
 * reaches the card is `MAX_FINDINGS`, ranked by the ₺ figure each one cites —
 * previously this shipped the entire pool, which is how the card ended up with
 * nineteen near-identical sentences.
 */
async function generateAll(input: InsightsInput): Promise<string[]> {
  let found: string[] = [];
  for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
    // Each pass re-sends the full payload, so back-to-back cycles spend several
    // thousand tokens inside one minute and trip the free tier's TPM ceiling
    // mid-run. chat() will wait out a 429, but arriving under the limit is much
    // cheaper than being bounced off it — the pause between cycles lets the token
    // bucket refill instead of paying for a rejected request first.
    if (cycle > 0) await sleep(CYCLE_GAP_MS);
    // Later cycles exist purely for RECALL — they ask for what the earlier passes
    // missed. At temperature 0 over an unchanged payload the model retraces the
    // same ground and dedupeNew discards the result, spending a full request for
    // nothing; a little spread is what makes the extra pass worth its tokens.
    const batch = await generateFindingsBatch(input, found, cycle === 0 ? 0 : RECALL_TEMPERATURE);
    const fresh = dedupeNew(batch, found);
    if (fresh.length === 0) break;
    found = [...found, ...fresh];
    // Enough candidates to rank a good five out of — more passes only add tail.
    if (found.length >= MAX_FINDINGS * 2) break;
  }
  return rankFindings(found);
}

export async function generateInsightsAction(params: {
  range?: string;
  from?: string;
  to?: string;
  cmp?: CompareBasis | string;
  mode?: "load" | "recheck";
}): Promise<InsightsResult> {
  const parsed = RangeSchema.safeParse(params);
  if (!parsed.success) return FAIL;
  const mode = parsed.data.mode ?? "load";

  const { supabase, profile } = await requireRole(["owner", "dev"]);
  if (!insightsConfigured()) return failWith("GROQ_API_KEY tanımlı değil", false);

  // Must precede resolveRange + every query: it decides where a day starts.
  await loadBusinessDayStart(supabase);
  const { preset, range } = resolveRange(parsed.data);
  // Fold the ignore rules into the cache key so changing either one regenerates
  // rather than serving cached findings that still mention an item now ignored.
  // (The range-keyed DB set is filtered at build time on the next recheck.)
  const rules = await getExclusionRules(supabase);
  // The comparison basis is part of the identity of a finding set: the same range
  // compared against last month and against last year yields genuinely different
  // findings, and serving one for the other puts the wrong baseline in the owner's
  // sentence. It keys the memory cache here and the stored row in the table.
  const basis = resolveCompare(parsed.data, range).basis;
  const key = `${range.from}_${range.to}|c:${basis}${exclusionSignature(rules)}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;

  // Resolved at most once per call, and only where a stored set is actually reused.
  let blocklist: string[] | null = null;
  const ignoredNames = async () => (blocklist ??= await ignoredItemNames(rules, range));

  // Load mode reuses a cached/persisted set — this is what keeps the findings
  // stable across page loads instead of re-rolling a new random set each time.
  // A set only counts as reusable while it's within the 3-day freshness window;
  // once it's stale we fall through and fully re-generate on this load.
  if (mode === "load") {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return toResult(hit.findings, [], new Set(), true);
    const stored = await loadStoredSet(s, range, basis);
    if (stored.insights.length && isInsightFresh(stored.createdAt)) {
      // The DB set is keyed by range + basis only, so it can predate the current
      // ignore rules — strip any finding naming a now-ignored item before reuse.
      const storedInsights = dropExcludedMentions(stored.insights, await ignoredNames());
      if (storedInsights.length) {
        cache.set(key, { at: Date.now(), findings: storedInsights });
        return toResult(storedInsights, [], new Set(), true);
      }
    }
  }

  const input = await buildInsightsInput(s, range, preset, parsed.data.cmp);

  let current: string[];
  let resolved: string[] = [];
  let newlyAdded = new Set<string>();
  let baseline: string[] = []; // set we started from, to detect real changes

  if (mode === "recheck") {
    // Recheck validates the current set no matter its age (the user asked for it).
    // Filter first so a stored set predating the ignore rules doesn't feed ignored
    // items back into the revalidation prompt.
    const cached = cache.get(key)?.findings;
    const existing =
      cached ?? dropExcludedMentions((await loadStoredSet(s, range, basis)).insights, await ignoredNames());
    baseline = existing;
    if (existing.length) {
      const r = await revalidateFindings(input, existing);
      const added = dedupeNew(r.added, r.ongoing);
      // Same cap as generation. Added findings are ranked in alongside ongoing
      // ones rather than appended past the limit — a new ₺80.000 problem should
      // displace a surviving ₺5.000 one, not be hidden below it.
      current = rankFindings([...r.ongoing, ...added]);
      resolved = r.resolved;
      newlyAdded = new Set(added.map(normFinding));
    } else {
      current = await generateAll(input); // nothing to validate yet — build fresh
    }
  } else {
    current = await generateAll(input);
  }

  if (current.length === 0 && resolved.length === 0) {
    // Distinguish "the model was unreachable" from "the model found nothing".
    // Both used to render the same retry prompt, which is useless advice for the
    // first case — a 4xx answers identically however many times it's clicked.
    const upstream = lastInsightsError();
    return upstream
      ? failWith(upstream, !upstream.includes("yeniden denemek çözmez"))
      : failWith("Bu dönem için öne çıkan bir bulgu çıkmadı", true);
  }

  cache.set(key, { at: Date.now(), findings: current });

  // Persist the new canonical set for future loads/rechecks. Non-fatal if the
  // table is missing. A recheck that produced an identical set (nothing added,
  // resolved, or renumbered) is skipped so clicking doesn't append duplicate rows.
  const changed = mode !== "recheck" || resolved.length > 0 || !sameSet(current, baseline);
  if (changed) {
    const { error: insertError } = await s.from("analytics_insights").insert({
      range_from: range.from,
      range_to: range.to,
      // Stored WITH its baseline, so a future load only reuses it for the same one.
      compare_basis: basis,
      insights: current,
      created_by: profile.id,
    });
    if (insertError) console.warn("[insights] history insert failed", insertError.message);
  }

  return toResult(current, resolved, newlyAdded, false);
}

// ---------- Patterns ("Kalıplar") ----------

// Separate in-memory cache from the insights one — different shape, same 1h TTL.
const patternsCache = new Map<string, { at: number; patterns: PatternItem[] }>();

// How many WELL-SUPPORTED patterns we aim for before stopping the widening loop,
// and how many candidates each pass hands the judge (keeps the prompt bounded).
const PATTERN_TARGET = 6;
const CANDIDATES_PER_PASS = 24;

// Hard ceiling on the card, thin-sample patterns included. Without it a data-poor
// range — the one that produces the most low-confidence candidates — would print
// the longest list, which is exactly backwards.
const MAX_PATTERNS = 10;

export type PatternItem = {
  id: string;
  kind: PatternKind;
  /** Final sentence: the LLM judge's phrasing, or the templated fallback. */
  text: string;
  subjects: string[];
  metrics: Record<string, number | string>;
  strength: number;
  /**
   * Sample tier from the miner — "low" never reaches here (patterns.ts drops it).
   * Rendered as a chip so a medium-sample pattern is never read as settled fact.
   * Optional because pattern sets persisted before this existed have no value.
   */
  confidence?: PatternConfidence;
  /** How much data it rests on, in plain Turkish ("4 Çarşamba günü"). */
  sampleLabel?: string;
  /** The raw sample count behind `sampleLabel`. */
  sampleSize?: number;
};

export type PatternsResult = {
  ok: boolean;
  patterns: PatternItem[];
  /** True when served from cache/stored set without re-mining. */
  cached: boolean;
  /** False when GROQ_API_KEY is absent — patterns still generate via the math gate + templates. */
  usedAI: boolean;
};

const PATTERNS_FAIL: PatternsResult = { ok: false, patterns: [], cached: false, usedAI: false };

/** Latest persisted pattern set for this exact range (with age), or empty. */
async function loadStoredPatterns(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  range: DateRange
): Promise<{ patterns: PatternItem[]; createdAt: string | null }> {
  const { data } = await supabase
    .from("analytics_patterns")
    .select("patterns, created_at")
    .eq("range_from", range.from)
    .eq("range_to", range.to)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  return {
    patterns: Array.isArray(row?.patterns) ? (row.patterns as PatternItem[]) : [],
    createdAt: row?.created_at ?? null,
  };
}

/**
 * Mine → validate → widen. Each cycle mines at a looser statistical level, hands
 * fresh candidates to the LLM judge (which rejects the obvious ones and phrases
 * the rest), and stops once we have enough strong patterns or the levels run out.
 * Without an LLM key it degrades to the math gate + templated sentences.
 *
 * The target counts WELL-SUPPORTED patterns only. Thin-sample ones are kept and
 * shown (labelled "düşük güven"), but they must not end the search: a widening pass
 * can surface a pattern with a large sample and a milder signal — genuinely the
 * better finding — and counting a handful of two-day curiosities toward the target
 * would stop the loop before it ever got there.
 */
async function buildPatterns(range: DateRange, keep: (name: string) => boolean): Promise<PatternItem[]> {
  const ai = insightsConfigured();
  const found: PatternItem[] = [];
  const foundIds = new Set<string>();
  const solid = () => found.filter((p) => p.confidence !== "low").length;

  for (let level = 0; level < MAX_PATTERN_LEVEL && solid() < PATTERN_TARGET && found.length < MAX_PATTERNS; level++) {
    const candidates = (await minePatterns(range, keep, level)).filter((c) => !foundIds.has(c.id));
    if (candidates.length === 0) continue;
    const pool = candidates.slice(0, CANDIDATES_PER_PASS);

    // Sample data travels with every candidate from here on, so a pattern can
    // never be shown (or judged) without the size of the thing it rests on.
    const carry = (c: (typeof pool)[number]) => ({
      subjects: c.subjects,
      metrics: c.metrics,
      strength: c.strength,
      confidence: c.confidence,
      sampleLabel: c.sampleLabel,
      sampleSize: c.sampleSize,
    });

    if (ai) {
      const forJudge: PatternForJudge[] = pool.map((c) => ({
        id: c.id,
        kind: c.kind,
        subjects: c.subjects,
        metrics: c.metrics,
        hint: c.desc,
        // Every tier reaches the judge, including "low": the prompt's job is to
        // match the strength of the sentence to the strength of the sample, not to
        // pretend thin patterns don't exist.
        confidence: c.confidence,
        sampleLabel: c.sampleLabel,
      }));
      const judged = await validatePatterns(
        forJudge,
        found.map((p) => p.text)
      );
      const byId = new Map(pool.map((c) => [c.id, c]));
      for (const j of judged) {
        const c = byId.get(j.id);
        if (!c || foundIds.has(c.id)) continue;
        foundIds.add(c.id);
        found.push({ id: c.id, kind: c.kind, text: j.text, ...carry(c) });
        if (solid() >= PATTERN_TARGET || found.length >= MAX_PATTERNS) break;
      }
    } else {
      // No judge: the math gate already dropped the obvious ones (lift≈1, weak
      // correlation). Take the strongest candidates with their templated sentence —
      // already tier-ordered by the miner, so the solid ones land first.
      for (const c of pool) {
        if (solid() >= PATTERN_TARGET || found.length >= MAX_PATTERNS) break;
        if (foundIds.has(c.id)) continue;
        foundIds.add(c.id);
        found.push({ id: c.id, kind: c.kind, text: c.fallbackText, ...carry(c) });
      }
      break; // no widening benefit without the judge — one strong pass is enough
    }
  }

  // Tier before strength, matching minePatterns. Sorting on strength alone would
  // undo the miner's ordering and let a thin-sample pattern with a dramatic ratio
  // head the card — small samples produce dramatic ratios, which is precisely why
  // they belong underneath. Absent tier (a set persisted before tiers existed)
  // sorts as the middle grade rather than to the bottom.
  const rank = (p: PatternItem) => (p.confidence === "high" ? 2 : p.confidence === "low" ? 0 : 1);
  return found.sort((a, b) => rank(b) - rank(a) || b.strength - a.strength);
}

export async function generatePatternsAction(params: {
  range?: string;
  from?: string;
  to?: string;
  mode?: "load" | "rescan";
}): Promise<PatternsResult> {
  const parsed = z
    .object({ range: z.string().optional(), from: z.string().optional(), to: z.string().optional(), mode: z.enum(["load", "rescan"]).optional() })
    .safeParse(params);
  if (!parsed.success) return PATTERNS_FAIL;
  const mode = parsed.data.mode ?? "load";

  const { supabase, profile } = await requireRole(["owner", "dev"]);
  await loadBusinessDayStart(supabase);
  const { range } = resolveRange(parsed.data);
  const rules = await getExclusionRules(supabase);
  const keep = makeKeepFilter(rules);
  const key = `${range.from}_${range.to}${exclusionSignature(rules)}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const usedAI = insightsConfigured();

  // Load mode reuses a fresh cached/persisted set so patterns stay stable across
  // visits instead of re-mining (and re-billing the judge) every page load.
  if (mode === "load") {
    const hit = patternsCache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return { ok: true, patterns: hit.patterns, cached: true, usedAI };
    const stored = await loadStoredPatterns(s, range);
    if (stored.patterns.length && isInsightFresh(stored.createdAt)) {
      // Patterns carry their subjects, so honoring the ignore rules on reuse is
      // exact: drop any pattern whose items include a now-ignored one. Matched
      // against a NAME list rather than `keep`, because aggregate patterns (price
      // band, discount) have non-item subjects that the off-menu rule would
      // otherwise read as delisted products and wipe out the whole family.
      const ignoredKeys = new Set((await ignoredItemNames(rules, range)).map(itemKey));
      const storedPatterns = stored.patterns
        .filter((p) => p.subjects.every((sub) => !ignoredKeys.has(itemKey(sub))))
        // Evict patterns generated under the OLD price-band shape, which printed
        // a per-view index as a percentage ("%570 satışa dönüşüyor"). Those are
        // wrong, not merely stale, and the 3-day reuse window would keep serving
        // them — with their wrong sentence already baked in — long after the fix.
        // Keyed on the retired metric name, so it costs nothing once they age out.
        .filter((p) => !Object.keys(p.metrics).some((k) => /salesPerViewPct$/i.test(k)));
      if (storedPatterns.length) {
        patternsCache.set(key, { at: Date.now(), patterns: storedPatterns });
        return { ok: true, patterns: storedPatterns, cached: true, usedAI };
      }
    }
  }

  const patterns = await buildPatterns(range, keep);
  if (patterns.length === 0) {
    // Cache the empty result briefly so a data-poor range doesn't re-mine on every visit.
    patternsCache.set(key, { at: Date.now(), patterns: [] });
    return { ok: true, patterns: [], cached: false, usedAI };
  }

  patternsCache.set(key, { at: Date.now(), patterns });

  // Persist for future loads/rescans. Non-fatal if the table isn't there yet.
  const { error: insertError } = await s.from("analytics_patterns").insert({
    range_from: range.from,
    range_to: range.to,
    patterns,
    created_by: profile.id,
  });
  if (insertError) console.warn("[patterns] history insert failed", insertError.message);

  return { ok: true, patterns, cached: false, usedAI };
}

/**
 * Persist the owner's "ignore these items" list for the analytics tab. Excluded
 * items are dropped from item-level views (top viewed/carted, conversion,
 * abandoned, best-sellers) and from the AI insights; money/amount totals are not
 * touched. Stored as a JSON array in the key/value `settings` table.
 */
export async function setExcludedItemsAction(names: string[]): Promise<{ ok: boolean }> {
  const parsed = z.array(z.string().max(200)).max(300).safeParse(names);
  if (!parsed.success) return { ok: false };

  const { supabase } = await requireRole(["owner", "dev"]);
  const clean = normalizeExclusionList(parsed.data);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const { error } = await s
    .from("settings")
    .upsert({ key: EXCLUDED_ITEMS_SETTINGS_KEY, value: JSON.stringify(clean) }, { onConflict: "key" });
  if (error) {
    console.warn("[analytics] setExcludedItems failed", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Flip the "also ignore items that are no longer on the menu" rule. On, every item
 * name that doesn't match a `menu_items` / add-on entry drops out of the item-level
 * views and the AI the same way a manually ticked one does — so delisted dishes
 * stop occupying the charts — and turning it off brings them all straight back.
 * Money/amount totals are untouched either way.
 *
 * Flipping it also clears the per-item overrides: switching the rule off and on is
 * the documented way to re-apply it from scratch, which means the exceptions
 * collected under the previous run must not survive the cycle.
 */
export async function setAutoExcludeOffMenuAction(on: boolean): Promise<{ ok: boolean }> {
  const parsed = z.boolean().safeParse(on);
  if (!parsed.success) return { ok: false };

  const { supabase } = await requireRole(["owner", "dev"]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const { error } = await s.from("settings").upsert(
    [
      { key: AUTO_EXCLUDE_OFFMENU_SETTINGS_KEY, value: parsed.data ? "1" : "0" },
      { key: OFFMENU_OVERRIDES_SETTINGS_KEY, value: "[]" },
    ],
    { onConflict: "key" }
  );
  if (error) {
    console.warn("[analytics] setAutoExcludeOffMenu failed", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Persist the per-item exceptions to the auto rule — products the matcher read as
 * delisted that the owner knows are live (a POS spelling too far from the menu
 * entry, a seasonal item off the menu but still sold). An override puts the item
 * back into every item-level view; it does not touch the manual ignore list, and
 * it is wiped whenever the auto rule is toggled.
 */
export async function setOffMenuOverridesAction(names: string[]): Promise<{ ok: boolean }> {
  const parsed = z.array(z.string().max(200)).max(300).safeParse(names);
  if (!parsed.success) return { ok: false };

  const { supabase } = await requireRole(["owner", "dev"]);
  const clean = normalizeExclusionList(parsed.data);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const { error } = await s
    .from("settings")
    .upsert({ key: OFFMENU_OVERRIDES_SETTINGS_KEY, value: JSON.stringify(clean) }, { onConflict: "key" });
  if (error) {
    console.warn("[analytics] setOffMenuOverrides failed", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Persist when the restaurant's business day starts.
 *
 * A kitchen serving past midnight books a 01:30 order on the calendar day the
 * clock rolled over to, while the shift, the cash-up and the owner all call it
 * the previous night. Which convention is used silently changes every daily
 * bucket, weekday pattern and heatmap cell on the tab, so it is a stated,
 * owner-controlled setting rather than an implicit midnight.
 *
 * 0 keeps plain calendar days (the default and the previous behavior).
 */
export async function setBusinessDayStartAction(hour: number): Promise<{ ok: boolean }> {
  const parsed = z.number().safeParse(hour);
  if (!parsed.success) return { ok: false };

  const { supabase } = await requireRole(["owner", "dev"]);
  const value = normalizeBusinessDayStart(parsed.data);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const { error } = await s
    .from("settings")
    .upsert({ key: BUSINESS_DAY_START_KEY, value: String(value) }, { onConflict: "key" });
  if (error) {
    console.warn("[analytics] setBusinessDayStart failed", error.message);
    return { ok: false };
  }
  return { ok: true };
}
