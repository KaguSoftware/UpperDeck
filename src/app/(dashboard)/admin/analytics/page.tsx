import { PageHeader, GhostButton } from "../_components";
import { requireRole } from "@/lib/auth/require-session";
import {
  resolveRange,
  resolveCompare,
  rangeLength,
  salesCoverage,
  isLiveRange,
  RELIABLE_COVERAGE,
} from "@/lib/analytics/range";
import { loadBusinessDayStart } from "@/lib/analytics/business-day";
import { getLocalizedCategoryNames, localizeCategoryCounts } from "@/lib/analytics/categories";
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
import { getMenuEngineering } from "@/lib/analytics/menu-matrix";
import { buildDataBasis } from "@/lib/analytics/confidence";
import { getPromoPerformance } from "@/lib/analytics/promo";
import { getBoughtTogether } from "@/lib/analytics/basket";
import { getRealFoodFilter } from "@/lib/analytics/food";
import { insightsConfigured, isInsightFresh } from "@/lib/analytics/insights";
import {
  getExclusionRules,
  makeKeepFilter,
  dropExcludedMentions,
  pickOffMenu,
  itemKey,
} from "@/lib/analytics/exclusions";
import { AnalyticsClient, type AnalyticsData } from "./_client";

export const dynamic = "force-dynamic";

/**
 * Upper bound on the sold-item tail collected for the ignore dropdown — far above
 * any real menu's item count, but bounded so a bad import can't build a huge list.
 *
 * Safe as a coverage guarantee because the list is sorted by quantity: an item
 * only enters a Kalıplar item pattern after clearing a real qty floor (6+ units in
 * the loosest level), so it would take 500 distinct products each selling that
 * much for a pattern subject to fall outside this pool.
 */
const ITEM_POOL = 500;

/**
 * Depth of the per-item funnel pool. The conversion table now offers search and
 * "show all", so it has to HOLD every product rather than the top 15 — a table
 * that can't reach item 16 of 89 is the one thing the owner most wants to sort.
 * Hidden Gems reads the same pool (it needs the low-view tail), so this is still
 * one aggregation, not two.
 */
const CONVERSION_POOL = 500;

/** Percent change vs the comparison period; null when there's no baseline. */
function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; cmp?: string }>;
}) {
  const { supabase } = await requireRole(["owner", "dev"]);

  const sp = await searchParams;
  // Decides where a day starts, so it has to be in place before the range is
  // resolved ("Bugün" at 01:30) and before any query buckets a timestamp.
  const businessDayStartHour = await loadBusinessDayStart(supabase);
  const { preset, range } = resolveRange(sp);
  const compare = resolveCompare(sp, range);
  const prev = compare.range;

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

  // Owner-configured "ignore" rules: the manually ticked list plus, when the auto
  // rule is on, everything no longer on the menu. Read first so item-level metrics
  // (and the basket pairing, which filters at query time) all honor them.
  // Money/amount aggregates are intentionally left whole.
  //
  // This stays a serial pre-fetch (not folded into the wave below) on purpose:
  // getBoughtTogether filters items by `keep` DURING its pairing aggregation, so a
  // filtered item never forms a pair — it genuinely needs the rules up front.
  // The insights-history reads, which have no such dependency, ARE folded in.
  const rules = await getExclusionRules(supabase);
  const excludedItems = rules.manual;
  const keep = makeKeepFilter(rules);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;

  const [
    summary,
    revenueOverTime,
    bestSellersDeep,
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
    categoryNames,
    promoConfigResult,
    suggestedGroupsResult,
    historyResult,
    currentResult,
  ] = await Promise.all([
    getRealSalesSummary(range),
    getRealSalesOverTime(range),
    // Deep pool: the query already reads every sale row of the range and slices in
    // memory, so asking for the long tail costs nothing extra. The chart still
    // shows the top 10 (sliced below); the tail exists so the ignore dropdown can
    // offer EVERY sold product — Kalıplar mines the whole tail, so a pattern can
    // name an item that never reaches any top-N list.
    getRealBestSellers(range, ITEM_POOL),
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
    // Deep pool: feeds both the conversion table (which now searches and sorts
    // over the WHOLE menu) AND hidden gems below, so the funnel is aggregated
    // once, not twice.
    getItemConversion(range, CONVERSION_POOL),
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
    // Slug → localized name for the category chart, which otherwise puts raw
    // English identifiers ("cold-drinks", "dog-bun") on a Turkish page.
    getLocalizedCategoryNames(supabase),
    // Is the promo real estate CONFIGURED? "0 clicks" means two completely
    // different things depending on the answer, and the card said neither.
    s.from("settings").select("key, value").in("key", ["hero_mode", "featured_item_id"]),
    s.from("suggested_groups").select("id").limit(1),
    // Folded in from a former second wave — no dependency on any result above.
    // Recent AI analyses for the history list. Non-fatal if the table is missing.
    s.from("analytics_insights")
      .select("created_at, range_from, range_to, insights")
      .order("created_at", { ascending: false })
      .limit(3),
    // Latest persisted set for THIS range AND comparison basis — shown on load so
    // findings stay stable (no fresh random generation on every visit). Keyed on
    // the basis too because findings name the window they compare against, so a set
    // written under "geçen yıl" must not surface while the badges read "önceki
    // dönem". Only reused while within the 3-day freshness window; older than that
    // it's treated as absent so the client fully re-generates on load.
    s.from("analytics_insights")
      .select("insights, created_at")
      .eq("range_from", range.from)
      .eq("range_to", range.to)
      .eq("compare_basis", compare.basis)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const { data: historyRows } = historyResult;
  const { data: currentRows } = currentResult;

  // Derive both item-funnel views from the single deep-pool conversion run above,
  // instead of a second full getItemConversion + getHiddenGems pass.
  const itemConversion = itemConversionDeep;
  // FILTER, then take ten. Slicing first meant that when eight of the top ten
  // sellers were ignored (or auto-hidden as off-menu), the chart rendered two
  // lonely bars on an axis built for ten and looked broken — while eight
  // perfectly good sellers sat just below the cut.
  const bestSellers = bestSellersDeep.filter((x) => keep(x.item_name)).slice(0, 10);

  // Menu engineering: popularity × margin per item, from `menu_items.cost`. Fed the
  // deep sold list we already have, so the second axis costs one small menu read
  // rather than another pass over every sale row. `hasData: false` until a cost is
  // entered anywhere — nothing downstream then mentions margin at all.
  const [hiddenGems, menuEngineering] = await Promise.all([
    getHiddenGems(range, 6, itemConversionDeep),
    getMenuEngineering(range, keep, { sold: bestSellersDeep }),
  ]);

  // How much of the picked window the POS log actually covers. A range that
  // silently spans a gap (e.g. an un-imported month) under-reports its total and
  // turns every comparison into arithmetic across unequal spans, so both the
  // banner and the muted delta badges are driven from here.
  const coverage = salesCoverage(range, revenueOverTime.map((d) => d.date));
  const prevCoverageRatio = prevSummary.daysWithData / Math.max(1, rangeLength(prev));
  const salesDeltaReliable =
    coverage.ratio >= RELIABLE_COVERAGE && prevCoverageRatio >= RELIABLE_COVERAGE;

  const promoSettings = (promoConfigResult.data ?? []) as { key: string; value: string }[];
  const settingOf = (key: string) => promoSettings.find((r) => r.key === key)?.value ?? "";
  const promoConfig = {
    featured: settingOf("hero_mode") === "featured" && Boolean(settingOf("featured_item_id")),
    suggested: (suggestedGroupsResult.data ?? []).length > 0,
  };

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

  // Options for the ignore dropdown: every item name seen this range, unioned with
  // already-excluded names (so they can be toggled back on even with no data now).
  //
  // This must be the FULL universe, not the top-N lists the charts render. Kalıplar
  // mines the whole tail — daily-share co-movement and weekday skew run over every
  // sold item, basket lift over every ordered item — so a pattern regularly names a
  // product that reaches no chart's top 10. Sourcing the options from the charts
  // left exactly those products with no checkbox: visible in Kalıplar, impossible
  // to ignore. Each list below is already fetched above, so this costs no queries:
  //   bestSellersDeep  → every POS-sold item  (co-move + weekday + price-band families)
  //   basket.itemNames → every app-ordered item (basket family)
  //   localePrefs      → per-locale favourites (locale segment family)
  //   viewed/carted/conversion/abandoned → PostHog-side names with no sales
  const optionMap = new Map<string, string>(); // match key -> display name
  for (const name of [
    ...topViewed.map((x) => x.name),
    ...topCarted.map((x) => x.name),
    ...bestSellersDeep.map((x) => x.item_name),
    ...itemConversionDeep.map((x) => x.name),
    ...abandonedViews.map((x) => x.name),
    ...basket.itemNames,
    ...localePrefs.flatMap((l) => l.topItems.map((i) => i.name)),
    ...excludedItems,
  ]) {
    const k = itemKey(name);
    if (!optionMap.has(k)) optionMap.set(k, name);
  }
  const itemOptions = [...optionMap.values()].sort((a, b) => a.localeCompare(b, "tr"));

  // What the auto rule reads as off-menu — the dashboard's only honest way to say
  // WHAT a single toggle just hid, so the dropdown can mark each one "menü dışı"
  // instead of silently shrinking every chart. Empty when the rule is off (or when
  // the menu read came back empty, which disarms it).
  //
  // Two lists: everything the rule matched (so an overridden item still carries its
  // marker) and the subset actually being dropped right now.
  const offMenuItems = pickOffMenu(rules, itemOptions, { includeOverridden: true });
  const autoExcludedItems = pickOffMenu(rules, itemOptions);

  const storedRow = currentRows?.[0];
  const initialInsights: string[] | null =
    isInsightFresh(storedRow?.created_at) && Array.isArray(storedRow?.insights)
      ? // The stored set is range-keyed, so it can predate the current rules — strip
        // any finding naming a now-ignored item so the AI card never shows one.
        dropExcludedMentions(storedRow.insights.map(String).filter(Boolean), [
          ...excludedItems,
          ...autoExcludedItems,
        ])
      : null;

  const data: AnalyticsData = {
    preset,
    range,
    // What the % badges are measured against — the single most common unanswered
    // question about a delta on this page.
    compare: {
      basis: compare.basis,
      label: compare.label,
      range: compare.range,
      // No POS entries in the baseline window means every % badge is blank for a
      // reason the owner can't see otherwise — most often on "geçen yıl" before a
      // year of history exists.
      hasData: prevSummary.daysWithData > 0,
    },
    salesCoverage: coverage,
    menuEngineering,
    // The sample behind every claim on the page — printed on the AI card and used
    // verbatim by the server-side confidence gate, so the two can't disagree.
    dataBasis: buildDataBasis({
      range,
      salesDates: revenueOverTime.map((d) => d.date),
      sessions: sessions.sessions,
      engagementDays: engNow.days,
      itemsWithSales: bestSellersDeep.filter((b) => keep(b.item_name) && b.qty > 0).length,
    }),
    salesDeltaReliable,
    businessDayStart: businessDayStartHour,
    // Server-computed so the client never derives "today" itself — that would
    // risk a hydration mismatch on a page rendered across a date boundary.
    live: isLiveRange(range),
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
    categoryPopularity: localizeCategoryCounts(categoryPopularity, categoryNames),
    localeSplit,
    bestSellers,
    abandonedViews: abandonedViews.filter((x) => keep(x.name)),
    itemConversion: itemConversion.filter((x) => keep(x.name)),
    priceBands,
    weekHeatmap,
    // New insight sections — item-level ones honor the ignore list too.
    // Hidden Gems additionally keeps only real food (no drinks/extras/sauces/fries).
    hiddenGems: hiddenGems.filter((x) => keep(x.name) && isRealFood(x.name)),
    momentum: {
      ...momentum,
      rising: momentum.rising.filter((x) => keep(x.name)),
      fading: momentum.fading.filter((x) => keep(x.name)),
    },
    promo: { ...promo, topSuggested: promo.topSuggested.filter((x) => keep(x.name)) },
    promoConfig,
    // Already filtered at query time via `keep`. `itemNames` is deliberately not
    // forwarded — it feeds `itemOptions` above and would otherwise ship the whole
    // ordered-item universe to the client twice.
    basket: { pairs: basket.pairs, orders: basket.orders },
    localePrefs: localePrefs.map((l) => ({ ...l, topItems: l.topItems.filter((x) => keep(x.name)) })),
    excludedItems,
    autoExcludeOffMenu: rules.autoOffMenu,
    offMenuItems,
    offMenuOverrides: rules.overrides,
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
