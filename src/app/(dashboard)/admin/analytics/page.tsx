import { PageHeader, GhostButton } from "../_components";
import { requireRole } from "@/lib/auth/require-session";
import { resolveRange, previousRange } from "@/lib/analytics/range";
import { getRealSalesSummary, getRealSalesOverTime, getRealBestSellers } from "@/lib/analytics/sales";
import { getSalesVsEngagement, getItemConversion, getAbandonedViewsNet } from "@/lib/analytics/compare";
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
  getPriceBands,
  getWeekHeatmap,
} from "@/lib/analytics/posthog";
import { insightsConfigured, isInsightFresh } from "@/lib/analytics/insights";
import { getExcludedItemNames, makeKeepFilter, itemKey } from "@/lib/analytics/exclusions";
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
  const { supabase } = await requireRole(["owner", "dev"]);

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
    getAbandonedViewsNet(range),
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
  const s = supabase as any;
  const [{ data: historyRows }, { data: currentRows }] = await Promise.all([
    s.from("analytics_insights")
      .select("created_at, range_from, range_to, insights")
      .order("created_at", { ascending: false })
      .limit(3),
    // Latest persisted set for THIS range — shown on load so findings stay stable
    // (no fresh random generation on every visit). Only reused while within the
    // 3-day freshness window; older than that it's treated as absent so the client
    // fully re-generates on load. null when nothing (fresh) is stored.
    s.from("analytics_insights")
      .select("insights, created_at")
      .eq("range_from", range.from)
      .eq("range_to", range.to)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const storedRow = currentRows?.[0];
  const initialInsights: string[] | null =
    isInsightFresh(storedRow?.created_at) && Array.isArray(storedRow?.insights)
      ? storedRow.insights.map(String).filter(Boolean)
      : null;

  // Owner-configured "ignore" list. Excluded items are dropped from the item-level
  // views below (top viewed/carted, conversion, abandoned, best-sellers) so they
  // stop polluting the Overview and AI insights. Money/amount aggregates (sales,
  // covers, views count, funnel) are intentionally left whole.
  const excludedItems = await getExcludedItemNames(supabase);
  const keep = makeKeepFilter(excludedItems);

  // Options for the ignore dropdown: every item name seen this range, unioned with
  // already-excluded names (so they can be toggled back on even with no data now).
  const optionMap = new Map<string, string>(); // match key -> display name
  for (const name of [
    ...topViewed.map((x) => x.name),
    ...topCarted.map((x) => x.name),
    ...bestSellers.map((x) => x.item_name),
    ...itemConversion.map((x) => x.name),
    ...abandonedViews.map((x) => x.name),
    ...excludedItems,
  ]) {
    const k = itemKey(name);
    if (!optionMap.has(k)) optionMap.set(k, name);
  }
  const itemOptions = [...optionMap.values()].sort((a, b) => a.localeCompare(b, "tr"));

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
    // Item-level lists: excluded items removed (feeds charts + Overview + insights).
    topViewed: topViewed.filter((x) => keep(x.name)),
    topCarted: topCarted.filter((x) => keep(x.name)),
    tableActivity,
    funnel,
    peakHours,
    categoryPopularity,
    localeSplit,
    bestSellers: bestSellers.filter((x) => keep(x.item_name)),
    abandonedViews: abandonedViews.filter((x) => keep(x.name)),
    itemConversion: itemConversion.filter((x) => keep(x.name)),
    priceBands,
    weekHeatmap,
    excludedItems,
    itemOptions,
    initialInsights,
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
