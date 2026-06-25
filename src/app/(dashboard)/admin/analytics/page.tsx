import { PageHeader, GhostButton } from "../_components";
import { resolveRange } from "@/lib/analytics/range";
import { getRealSalesSummary, getRealSalesOverTime, getRealBestSellers } from "@/lib/analytics/sales";
import { getSalesVsEngagement } from "@/lib/analytics/compare";
import {
  posthogConfigured,
  getTopViewedItems,
  getCategoryPopularity,
  getLocaleSplit,
  getEngagementFunnel,
  getSessionStats,
  getPeakHours,
} from "@/lib/analytics/posthog";
import { AnalyticsClient, type AnalyticsData } from "./_client";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { preset, range } = resolveRange(sp);

  const [
    summary,
    revenueOverTime,
    bestSellers,
    comparison,
    topViewed,
    categoryPopularity,
    localeSplit,
    funnel,
    sessions,
    peakHours,
  ] = await Promise.all([
    getRealSalesSummary(range),
    getRealSalesOverTime(range),
    getRealBestSellers(range),
    getSalesVsEngagement(range),
    getTopViewedItems(range),
    getCategoryPopularity(range),
    getLocaleSplit(range),
    getEngagementFunnel(range),
    getSessionStats(range),
    getPeakHours(range),
  ]);

  const views = funnel.find((f) => f.step.startsWith("Görüntü"))?.count ?? 0;
  const waiterCalls = funnel.find((f) => f.step.startsWith("Garson"))?.count ?? 0;

  const data: AnalyticsData = {
    preset,
    range,
    posthogConfigured: posthogConfigured(),
    kpis: {
      totalSales: summary.totalSales,
      totalCovers: summary.totalCovers,
      avgSpendPerCover: summary.avgSpendPerCover,
      sessions: sessions.sessions,
      avgSeconds: sessions.avgSeconds,
      waiterCalls,
      views,
    },
    comparison,
    revenueOverTime,
    topViewed,
    funnel,
    peakHours,
    categoryPopularity,
    localeSplit,
    bestSellers,
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
