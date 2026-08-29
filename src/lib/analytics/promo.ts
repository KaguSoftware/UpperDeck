import "server-only";
import { getServerClient } from "@/lib/supabase/server";
import { getPromoEngagement } from "@/lib/analytics/posthog";
import type { DateRange } from "@/lib/analytics/sales";

/**
 * Featured-banner / suggested-rail performance for the analytics tab.
 *
 * Combines the raw PostHog engagement (clicks, sessions, add-to-cart follow-
 * through) with Supabase menu-item names so the dashboard can show whether that
 * prime menu real estate earns its place. `convPct` = of the sessions that
 * clicked, how many went on to add anything to cart.
 */
export type PromoPerformance = {
  /** True when any promo click was recorded in the range. */
  hasData: boolean;
  featured: { clicks: number; sessions: number; toCart: number; convPct: number };
  suggested: { clicks: number; sessions: number; toCart: number; convPct: number };
  topSuggested: { name: string; clicks: number }[];
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export async function getPromoPerformance(range: DateRange): Promise<PromoPerformance> {
  const eng = await getPromoEngagement(range);

  // Resolve suggested item ids → Turkish display names.
  let topSuggested: { name: string; clicks: number }[] = [];
  const ids = eng.topSuggestedIds.map((x) => x.id).filter(Boolean);
  if (ids.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await getServerClient()) as any;
    const { data } = await supabase.from("menu_items").select("id, name_tr").in("id", ids);
    const nameById = new Map<string, string>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((data ?? []) as any[]).map((r) => [r.id as string, r.name_tr as string])
    );
    topSuggested = eng.topSuggestedIds
      .map((x) => ({ name: nameById.get(x.id) ?? "", clicks: x.clicks }))
      .filter((x) => x.name);
  }

  return {
    hasData: eng.featured.clicks + eng.suggested.clicks > 0,
    featured: { ...eng.featured, convPct: pct(eng.featured.toCart, eng.featured.sessions) },
    suggested: { ...eng.suggested, convPct: pct(eng.suggested.toCart, eng.suggested.sessions) },
    topSuggested,
  };
}
