"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import { resolveRange } from "@/lib/analytics/range";
import { getRealSalesSummary, getRealBestSellers } from "@/lib/analytics/sales";
import {
  getTopViewedItems,
  getTopCartedItems,
  getEngagementFunnel,
  getSessionStats,
  getCartConversion,
  getCategoryPopularity,
  getAbandonedViews,
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

export async function generateInsightsAction(params: {
  range?: string;
  from?: string;
  to?: string;
}): Promise<InsightsResult> {
  const parsed = RangeSchema.safeParse(params);
  if (!parsed.success) return { ok: false, insights: [], cached: false };

  await requireRole("dev");
  if (!insightsConfigured()) return { ok: false, insights: [], cached: false };

  const { range } = resolveRange(parsed.data);
  const key = `${range.from}_${range.to}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { ok: true, insights: hit.insights, cached: true };
  }

  // Re-fetch the underlying data server-side (never trust client-sent numbers).
  const [summary, bestSellers, topViewed, topCarted, funnel, sessions, cartConversion, categoryPopularity, abandonedViews] =
    await Promise.all([
      getRealSalesSummary(range),
      getRealBestSellers(range),
      getTopViewedItems(range),
      getTopCartedItems(range),
      getEngagementFunnel(range),
      getSessionStats(range),
      getCartConversion(range),
      getCategoryPopularity(range),
      getAbandonedViews(range),
    ]);

  const views = funnel.find((f) => f.step.startsWith("Görüntü"))?.count ?? 0;
  const waiterCalls = funnel.find((f) => f.step.startsWith("Garson"))?.count ?? 0;

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
  };

  const insights = await generateInsights(input);
  if (insights.length === 0) return { ok: false, insights: [], cached: false };

  cache.set(key, { at: Date.now(), insights });
  return { ok: true, insights, cached: false };
}
