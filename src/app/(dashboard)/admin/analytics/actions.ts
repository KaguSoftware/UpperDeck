"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import { resolveRange, previousRange } from "@/lib/analytics/range";
import { getRealSalesSummary, getRealBestSellers } from "@/lib/analytics/sales";
import { getItemConversion, getAbandonedItems } from "@/lib/analytics/compare";
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
import { generateInsights, insightsConfigured, type InsightsInput } from "@/lib/analytics/insights";

const RangeSchema = z.object({
  range: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// In-memory cache per date range, 1h TTL. Fine for this single-instance
// dashboard; resets on redeploy, which just means one extra generation.
const cache = new Map<string, { at: number; insights: string[] }>();
const TTL_MS = 60 * 60 * 1000;

export type InsightsResult = { ok: boolean; insights: string[]; cached: boolean };

function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export async function generateInsightsAction(params: {
  range?: string;
  from?: string;
  to?: string;
}): Promise<InsightsResult> {
  const parsed = RangeSchema.safeParse(params);
  if (!parsed.success) return { ok: false, insights: [], cached: false };

  const { supabase, profile } = await requireRole("dev");
  if (!insightsConfigured()) return { ok: false, insights: [], cached: false };

  const { range } = resolveRange(parsed.data);
  const key = `${range.from}_${range.to}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { ok: true, insights: hit.insights, cached: true };
  }

  const prev = previousRange(range);

  // Re-fetch the underlying data server-side (never trust client-sent numbers).
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
    getAbandonedItems(range),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const { data: historyRows } = await s
    .from("analytics_insights")
    .select("created_at, insights")
    .order("created_at", { ascending: false })
    .limit(3);
  const previousInsights = ((historyRows ?? []) as { created_at: string; insights: string[] }[]).map((r) => ({
    date: r.created_at.slice(0, 10),
    insights: r.insights,
  }));

  const input: InsightsInput = {
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

  const insights = await generateInsights(input);
  if (insights.length === 0) return { ok: false, insights: [], cached: false };

  cache.set(key, { at: Date.now(), insights });

  // Persist for future runs to reference. Non-fatal if the table is missing.
  const { error: insertError } = await s.from("analytics_insights").insert({
    range_from: range.from,
    range_to: range.to,
    insights,
    created_by: profile.id,
  });
  if (insertError) console.warn("[insights] history insert failed", insertError.message);

  return { ok: true, insights, cached: false };
}
