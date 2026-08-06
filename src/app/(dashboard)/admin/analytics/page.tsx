import { PageHeader, GhostButton } from "../_components";
import { requireRole } from "@/lib/auth/require-session";
import { resolveRange, previousRange } from "@/lib/analytics/range";
import { getRealSalesSummary, getRealSalesOverTime, getRealBestSellers } from "@/lib/analytics/sales";
import {
  getSalesVsEngagement,
  getItemConversion,
  getAbandonedViewsNet,
  getHiddenGems,
  getItemMomentum,
} from "@/lib/analytics/compare";
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
  getWeekHeatmap,
  getLocalePreferences,
  engagementWindow,
} from "@/lib/analytics/posthog";
import { getPriceBandSales } from "@/lib/analytics/price-bands";
import { getPromoPerformance } from "@/lib/analytics/promo";
import { getBoughtTogether } from "@/lib/analytics/basket";
import { getRealFoodFilter } from "@/lib/analytics/food";
import { insightsConfigured, isInsightFresh } from "@/lib/analytics/insights";
import { getExcludedItemNames, makeKeepFilter, dropExcludedMentions, itemKey } from "@/lib/analytics/exclusions";
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

  // Engagement (PostHog) has a hard data floor, so the window it can actually
  // answer for is often SHORTER than the one the owner picked, while real sales
  // (Supabase) always cover the full pick. Two KPI-row consequences, both fixed
  // below — see `salesInEngagementWindow` and `engDelta`.
  const engNow = engagementWindow(range);
  const engPrev = engagementWindow(prev);

  // A period-over-period delta is only meaningful between windows of equal
  // length. The floor can shorten the PREVIOUS one without shortening the
  // current one (e.g. "30 gün" today compares 30 days of views against the 3
  // days of the previous window that clear the floor), which reads as a ~10x
  // jump that never happened. No comparable baseline → no delta, which is what
  // `pctDelta` already expresses with null.
  const engagementComparable = !engPrev.empty && engPrev.days === engNow.days;

  // Owner-configured "ignore" list. Read first so item-level metrics (and the
  // basket pairing, which filters at query time) all honor it. Money/amount
  // aggregates are intentionally left whole.
  //
  // This stays a serial pre-fetch (not folded into the wave below) on purpose:
  // getBoughtTogether filters items by `keep` DURING its pairing aggregation, so a
  // filtered item never forms a pair — it genuinely needs the ignore list up front.
  // The insights-history reads, which have no such dependency, ARE folded in.
  const excludedItems = await getExcludedItemNames(supabase);
  const keep = makeKeepFilter(excludedItems);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;

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
    itemConversionDeep,
    priceBands,
    weekHeatmap,
    momentum,
    promo,
    basket,
    localePrefs,
    isRealFood,
    prevSummary,
    prevFunnel,
    prevSessions,
    prevCartConversion,
    historyResult,
    currentResult,
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
    // Deep pool (80): feeds both the conversion table (sliced to its own limit in
    // the client) AND hidden gems below, so the funnel is aggregated once, not twice.
    getItemConversion(range, 80),
    // Views AND real sales per price band — the band chart is a views→SALE rate,
    // never views→cart. Honors the ignore list because it is built from item-level
    // data (an ignored upsell would otherwise carry its whole band).
    getPriceBandSales(range, keep),
    getWeekHeatmap(range),
    getItemMomentum(range),
    getPromoPerformance(range),
    getBoughtTogether(range, keep),
    getLocalePreferences(range),
    getRealFoodFilter(),
    // Previous period of equal length, for the KPI deltas. Sales always have a
    // real baseline; the engagement three are skipped outright when the floor
    // makes the previous window non-comparable — their deltas would be dropped
    // anyway, so this also spares three ClickHouse queries per render.
    getRealSalesSummary(prev),
    engagementComparable ? getEngagementFunnel(prev) : Promise.resolve([]),
    engagementComparable ? getSessionStats(prev) : Promise.resolve({ sessions: 0, avgSeconds: 0 }),
    engagementComparable ? getCartConversion(prev) : Promise.resolve(0),
    // Folded in from a former second wave — no dependency on any result above.
    // Recent AI analyses for the history list. Non-fatal if the table is missing.
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
  const { data: historyRows } = historyResult;
  const { data: currentRows } = currentResult;

  // Derive both item-funnel views from the single deep-pool conversion run above,
  // instead of a second full getItemConversion + getHiddenGems pass. Slicing the
  // deep pool to 15 yields the same top-15 the shallow call did (sorted by views).
  const itemConversion = itemConversionDeep.slice(0, 15);
  const hiddenGems = await getHiddenGems(range, 6, itemConversionDeep);

  const funnelCount = (f: { step: string; count: number }[], prefix: string) =>
    f.find((x) => x.step.startsWith(prefix))?.count ?? 0;
  const views = funnelCount(funnel, "Görüntü");
  const waiterCalls = funnelCount(funnel, "Garson");

  /** Delta for an engagement KPI — null unless both windows are the same length. */
  const engDelta = (cur: number, previous: number) => (engagementComparable ? pctDelta(cur, previous) : null);

  // The covers estimate is sessions × a multiplier, and per-cover spend divides
  // real sales BY that estimate. Sessions stop at the data floor, so on a range
  // that starts before it the numerator spanned the full period while the
  // denominator spanned only the tail — "Kişi Başı" came out inflated by the
  // ratio of the two (roughly 3x on "90 gün"). Restricting the numerator to the
  // engagement window puts both sides on the same days. Identical to
  // `summary.totalSales` whenever nothing was clipped, and free: it re-uses the
  // daily series already fetched above rather than adding a query.
  const salesInEngagementWindow = engNow.empty
    ? 0
    : engNow.clipped
      ? revenueOverTime.filter((d) => d.date >= engNow.from).reduce((sum, d) => sum + d.revenue, 0)
      : summary.totalSales;

  const storedRow = currentRows?.[0];
  const initialInsights: string[] | null =
    isInsightFresh(storedRow?.created_at) && Array.isArray(storedRow?.insights)
      ? // The stored set is range-keyed, so it can predate the ignore list — strip any
        // finding naming a now-excluded item so the AI card never shows one.
        dropExcludedMentions(storedRow.insights.map(String).filter(Boolean), excludedItems)
      : null;

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
    engagement: engNow,
    kpis: {
      totalSales: summary.totalSales,
      totalCovers: summary.totalCovers,
      avgSpendPerCover: summary.avgSpendPerCover,
      salesInEngagementWindow,
      sessions: sessions.sessions,
      avgSeconds: sessions.avgSeconds,
      waiterCalls,
      views,
      cartConversion,
    },
    deltas: {
      totalSales: pctDelta(summary.totalSales, prevSummary.totalSales),
      // No real covers entered this period → don't compare (avoids a false "covers
      // dropped 100%" in the deterministic overview; the estimate is display-only).
      totalCovers: summary.totalCovers > 0 ? pctDelta(summary.totalCovers, prevSummary.totalCovers) : null,
      avgSpendPerCover: summary.totalCovers > 0 ? pctDelta(summary.avgSpendPerCover, prevSummary.avgSpendPerCover) : null,
      views: engDelta(views, funnelCount(prevFunnel, "Görüntü")),
      avgSeconds: engDelta(sessions.avgSeconds, prevSessions.avgSeconds),
      waiterCalls: engDelta(waiterCalls, funnelCount(prevFunnel, "Garson")),
      cartConversion: engDelta(cartConversion, prevCartConversion),
      sessions: engDelta(sessions.sessions, prevSessions.sessions),
    },
    comparison,
    revenueOverTime,
    // Item-level lists: excluded items removed (feeds charts + Overview + insights).
    topViewed: topViewed.filter((x) => keep(x.name)),
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
    // New insight sections — item-level ones honor the ignore list too.
    // Hidden Gems additionally keeps only real food (no drinks/extras/sauces/fries).
    hiddenGems: hiddenGems.filter((x) => keep(x.name) && isRealFood(x.name)),
    momentum: {
      rising: momentum.rising.filter((x) => keep(x.name)),
      fading: momentum.fading.filter((x) => keep(x.name)),
    },
    promo: { ...promo, topSuggested: promo.topSuggested.filter((x) => keep(x.name)) },
    basket, // already filtered at query time via `keep`
    localePrefs: localePrefs.map((l) => ({ ...l, topItems: l.topItems.filter((x) => keep(x.name)) })),
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
