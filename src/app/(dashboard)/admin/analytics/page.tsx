import { PageHeader, GhostButton } from "../_components";
import { requireRole } from "@/lib/auth/require-session";
import { resolveRange, previousRange } from "@/lib/analytics/range";
import { getRealSalesSummary, getRealSalesOverTime, getRealBestSellers } from "@/lib/analytics/sales";
import { getSalesVsEngagement, getItemConversion } from "@/lib/analytics/compare";
import {
  posthogConfigured,
  getTopViewedItems,
  getTopCartedItems,
  getTableActivity,
  getCartConversion,
  getCategoryPopularity,
  getLocaleSplit,
  getEngagementFunnel,
  getSessionStats,
  getPeakHours,
  getAbandonedViews,
  getPriceBands,
  getWeekHeatmap,
} from "@/lib/analytics/posthog";
import { insightsConfigured } from "@/lib/analytics/insights";
import { AnalyticsClient, type AnalyticsData } from "./_client";

export const dynamic = "force-dynamic";

/** Percent change vs previous period; null when there's no baseline. */
function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { supabase } = await requireRole("dev");

  const sp = await searchParams;
  const { preset, range } = resolveRange(sp);
  const prev = previousRange(range);

  const [
    summary,
    revenueOverTime,
    bestSellers,
    comparison,
    topViewed,
    topCarted,
    tableActivity,
    cartConversion,
    categoryPopularity,
    localeSplit,
    funnel,
    sessions,
    peakHours,
    abandonedViews,
    itemConversion,
    priceBands,
    weekHeatmap,
    prevSummary,
    prevFunnel,
    prevSessions,
    prevCartConversion,
  ] = await Promise.all([
    getRealSalesSummary(range),
    getRealSalesOverTime(range),
    getRealBestSellers(range),
    getSalesVsEngagement(range),
    getTopViewedItems(range),
    getTopCartedItems(range),
    getTableActivity(range),
    getCartConversion(range),
    getCategoryPopularity(range),
    getLocaleSplit(range),
    getEngagementFunnel(range),
    getSessionStats(range),
    getPeakHours(range),
    getAbandonedViews(range),
    getItemConversion(range),
    getPriceBands(range),
    getWeekHeatmap(range),
    // Previous period of equal length, for the KPI deltas.
    getRealSalesSummary(prev),
    getEngagementFunnel(prev),
    getSessionStats(prev),
    getCartConversion(prev),
  ]);

  const funnelCount = (f: { step: string; count: number }[], prefix: string) =>
    f.find((x) => x.step.startsWith(prefix))?.count ?? 0;
  const views = funnelCount(funnel, "Görüntü");
  const waiterCalls = funnelCount(funnel, "Garson");

  // Recent AI analyses for the history list. Non-fatal if the table is missing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: historyRows } = await (supabase as any)
    .from("analytics_insights")
    .select("created_at, range_from, range_to, insights")
    .order("created_at", { ascending: false })
    .limit(3);

  const data: AnalyticsData = {
    preset,
    range,
    posthogConfigured: posthogConfigured(),
    insightsConfigured: insightsConfigured(),
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
    deltas: {
      totalSales: pctDelta(summary.totalSales, prevSummary.totalSales),
      totalCovers: pctDelta(summary.totalCovers, prevSummary.totalCovers),
      avgSpendPerCover: pctDelta(summary.avgSpendPerCover, prevSummary.avgSpendPerCover),
      views: pctDelta(views, funnelCount(prevFunnel, "Görüntü")),
      avgSeconds: pctDelta(sessions.avgSeconds, prevSessions.avgSeconds),
      waiterCalls: pctDelta(waiterCalls, funnelCount(prevFunnel, "Garson")),
      cartConversion: pctDelta(cartConversion, prevCartConversion),
      sessions: pctDelta(sessions.sessions, prevSessions.sessions),
    },
    comparison,
    revenueOverTime,
    topViewed,
    topCarted,
    tableActivity,
    funnel,
    peakHours,
    categoryPopularity,
    localeSplit,
    bestSellers,
    abandonedViews,
    itemConversion,
    priceBands,
    weekHeatmap,
    insightsHistory: ((historyRows ?? []) as {
      created_at: string;
      range_from: string;
      range_to: string;
      insights: string[];
    }[]).map((r) => ({
      date: r.created_at.slice(0, 10),
      rangeFrom: r.range_from,
      rangeTo: r.range_to,
      insights: r.insights,
    })),
  };

  return (
    <>
      <PageHeader
        title="Analitik"
        subtitle="Menü etkileşimi & gerçek satışlar"
        action={<GhostButton href="/admin/analytics/sales">Gerçek Satış Gir</GhostButton>}
      />
      <AnalyticsClient data={data} />
    </>
  );
}
