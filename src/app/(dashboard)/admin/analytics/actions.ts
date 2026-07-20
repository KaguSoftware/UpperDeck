"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import { resolveRange, previousRange } from "@/lib/analytics/range";
import { getRealSalesSummary, getRealBestSellers, type DateRange } from "@/lib/analytics/sales";
import { getItemConversion, getAbandonedViewsNet } from "@/lib/analytics/compare";
import {
  getTopViewedItems,
  getTopCartedItems,
  getEngagementFunnel,
  getSessionStats,
  getCartConversion,
  getCategoryPopularity,
  getPriceBands,
  getDiscountSplit,
} from "@/lib/analytics/posthog";
import {
  generateFindingsBatch,
  revalidateFindings,
  insightsConfigured,
  isInsightFresh,
  type InsightsInput,
} from "@/lib/analytics/insights";

const RangeSchema = z.object({
  range: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  mode: z.enum(["load", "recheck"]).optional(),
});

// In-memory cache per date range, 1h TTL. Fine for this single-instance
// dashboard; resets on redeploy, which just means one extra generation.
const cache = new Map<string, { at: number; findings: string[] }>();
const TTL_MS = 60 * 60 * 1000;

// Cap the generation loop. Each cycle asks the model for findings it hasn't
// surfaced yet; it stops early once a cycle returns nothing new.
const MAX_CYCLES = 3;

export type InsightFinding = { text: string; isNew: boolean };
export type InsightsResult = {
  ok: boolean;
  /** The current canonical set. `isNew` marks findings added by the latest recheck. */
  findings: InsightFinding[];
  /** Findings that a recheck determined no longer hold (empty on a plain load). */
  resolved: string[];
  /** True when served from cache/stored set without hitting the model. */
  cached: boolean;
};

const FAIL: InsightsResult = { ok: false, findings: [], resolved: [], cached: false };

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

/** Latest persisted set for this exact range (with its age), or empty if none. */
async function loadStoredSet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  range: DateRange
): Promise<{ insights: string[]; createdAt: string | null }> {
  const { data } = await supabase
    .from("analytics_insights")
    .select("insights, created_at")
    .eq("range_from", range.from)
    .eq("range_to", range.to)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  return {
    insights: Array.isArray(row?.insights) ? row.insights.map(String).filter(Boolean) : [],
    createdAt: row?.created_at ?? null,
  };
}

/** Assemble everything the model sees for a range (shared by generate + recheck). */
async function buildInsightsInput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  range: DateRange
): Promise<InsightsInput> {
  const prev = previousRange(range);
  const [
    summary,
    bestSellers,
    topViewed,
    topCarted,
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
  ] = await Promise.all([
    getRealSalesSummary(range),
    getRealBestSellers(range),
    getTopViewedItems(range),
    getTopCartedItems(range),
    getEngagementFunnel(range),
    getSessionStats(range),
    getCartConversion(range),
    getCategoryPopularity(range),
    getAbandonedViewsNet(range),
    getItemConversion(range),
    getPriceBands(range),
    getDiscountSplit(range),
    getRealSalesSummary(prev),
    getEngagementFunnel(prev),
    getSessionStats(prev),
  ]);

  const funnelCount = (f: { step: string; count: number }[], prefix: string) =>
    f.find((x) => x.step.startsWith(prefix))?.count ?? 0;
  const views = funnelCount(funnel, "Görüntü");
  const waiterCalls = funnelCount(funnel, "Garson");

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
    topViewed,
    topCarted,
    bestSellers,
    funnel,
    abandonedViews,
    categoryPopularity,
    itemConversion,
    priceBands,
    discountSplit,
    deltas: {
      totalSales: pctDelta(summary.totalSales, prevSummary.totalSales),
      totalCovers: pctDelta(summary.totalCovers, prevSummary.totalCovers),
      views: pctDelta(views, funnelCount(prevFunnel, "Görüntü")),
      waiterCalls: pctDelta(waiterCalls, funnelCount(prevFunnel, "Garson")),
      sessions: pctDelta(sessions.sessions, prevSessions.sessions),
    },
    previousInsights,
  };
}

/** Full build in cycles: keep asking for findings not yet found until a pass adds nothing. */
async function generateAll(input: InsightsInput): Promise<string[]> {
  let found: string[] = [];
  for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
    const batch = await generateFindingsBatch(input, found);
    const fresh = dedupeNew(batch, found);
    if (fresh.length === 0) break;
    found = [...found, ...fresh];
  }
  return found;
}

export async function generateInsightsAction(params: {
  range?: string;
  from?: string;
  to?: string;
  mode?: "load" | "recheck";
}): Promise<InsightsResult> {
  const parsed = RangeSchema.safeParse(params);
  if (!parsed.success) return FAIL;
  const mode = parsed.data.mode ?? "load";

  const { supabase, profile } = await requireRole(["owner", "dev"]);
  if (!insightsConfigured()) return FAIL;

  const { range } = resolveRange(parsed.data);
  const key = `${range.from}_${range.to}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;

  // Load mode reuses a cached/persisted set — this is what keeps the findings
  // stable across page loads instead of re-rolling a new random set each time.
  // A set only counts as reusable while it's within the 3-day freshness window;
  // once it's stale we fall through and fully re-generate on this load.
  if (mode === "load") {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return toResult(hit.findings, [], new Set(), true);
    const stored = await loadStoredSet(s, range);
    if (stored.insights.length && isInsightFresh(stored.createdAt)) {
      cache.set(key, { at: Date.now(), findings: stored.insights });
      return toResult(stored.insights, [], new Set(), true);
    }
  }

  const input = await buildInsightsInput(s, range);

  let current: string[];
  let resolved: string[] = [];
  let newlyAdded = new Set<string>();
  let baseline: string[] = []; // set we started from, to detect real changes

  if (mode === "recheck") {
    // Recheck validates the current set no matter its age (the user asked for it).
    const existing = cache.get(key)?.findings ?? (await loadStoredSet(s, range)).insights;
    baseline = existing;
    if (existing.length) {
      const r = await revalidateFindings(input, existing);
      const added = dedupeNew(r.added, r.ongoing);
      current = [...r.ongoing, ...added];
      resolved = r.resolved;
      newlyAdded = new Set(added.map(normFinding));
    } else {
      current = await generateAll(input); // nothing to validate yet — build fresh
    }
  } else {
    current = await generateAll(input);
  }

  if (current.length === 0 && resolved.length === 0) return FAIL;

  cache.set(key, { at: Date.now(), findings: current });

  // Persist the new canonical set for future loads/rechecks. Non-fatal if the
  // table is missing. A recheck that produced an identical set (nothing added,
  // resolved, or renumbered) is skipped so clicking doesn't append duplicate rows.
  const changed = mode !== "recheck" || resolved.length > 0 || !sameSet(current, baseline);
  if (changed) {
    const { error: insertError } = await s.from("analytics_insights").insert({
      range_from: range.from,
      range_to: range.to,
      insights: current,
      created_by: profile.id,
    });
    if (insertError) console.warn("[insights] history insert failed", insertError.message);
  }

  return toResult(current, resolved, newlyAdded, false);
}
