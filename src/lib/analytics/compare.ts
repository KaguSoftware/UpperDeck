import "server-only";
import { getRealSalesOverTime, type DateRange } from "@/lib/analytics/sales";
import { getDailyEngagement } from "@/lib/analytics/posthog";

/**
 * Headline correlation: real daily revenue (Supabase) vs menu engagement
 * (PostHog views + waiter calls) on one shared daily timeline.
 *
 * Days with engagement but no entered sales show revenue: null (charts render a
 * gap and the UI hints "no sales entered"). Days with sales but no engagement
 * data (PostHog absent) show zeros.
 */
export async function getSalesVsEngagement(range: DateRange) {
  const [sales, engagement] = await Promise.all([
    getRealSalesOverTime(range),
    getDailyEngagement(range),
  ]);

  const salesByDate = new Map(sales.map((s) => [s.date, s]));
  const engByDate = new Map(engagement.map((e) => [e.date, e]));
  const dates = [...new Set([...salesByDate.keys(), ...engByDate.keys()])].sort();

  return dates.map((date) => {
    const s = salesByDate.get(date);
    const e = engByDate.get(date);
    return {
      date,
      revenue: s ? s.revenue : null,
      covers: s ? s.covers : null,
      views: e ? e.views : 0,
      waiterCalls: e ? e.waiterCalls : 0,
    };
  });
}
