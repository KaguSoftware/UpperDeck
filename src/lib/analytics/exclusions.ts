import "server-only";
import { canonicalItemName } from "@/lib/analytics/clean-sales";

/**
 * Owner-configured "ignore these items" list for the analytics tab.
 *
 * Some menu entries dominate the item-level charts without carrying any signal —
 * e.g. an upsell like "Menu Upgrade" tops views/carts/best-sellers on every range
 * but tells the owner nothing. This list omits such items from the INSIGHT-level
 * views (top viewed/carted, conversion, abandoned, best-sellers → and therefore the
 * deterministic Overview and the AI insights) so the analysis focuses on real
 * products.
 *
 * It deliberately does NOT touch money/amount aggregates (total sales, covers,
 * average spend, total views, funnel counts): those stay complete.
 *
 * Stored as a JSON string array in the key/value `settings` table.
 */

export const EXCLUDED_ITEMS_SETTINGS_KEY = "analytics_excluded_items";

/**
 * Shared match key — same CANONICAL key compare.ts / price-bands.ts / patterns.ts
 * use to line up PostHog menu names with POS item names, so an exclusion entered
 * once matches both sources.
 *
 * It folds kitchen-name aliases too (`canonicalItemName`, not just
 * `normalizeItemName`): several callers hand `keep()` a RAW sheet name
 * ("Oklahoma Smash") while the charts and patterns display the canonical menu
 * name ("Oklahoma Onion"). Keying on the normalized form alone let the raw
 * variant slip past an exclusion the owner had already ticked.
 */
export const itemKey = (name: string) => canonicalItemName(name).toLocaleLowerCase("tr");

/** Read the configured item names to ignore. Safe ([]) on any failure. */
export async function getExcludedItemNames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string[]> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", EXCLUDED_ITEMS_SETTINGS_KEY)
    .maybeSingle();
  const raw = data?.value;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Predicate that keeps only item names NOT in the excluded set (by match key). */
export function makeKeepFilter(excluded: string[]): (name: string) => boolean {
  const keys = new Set(excluded.map(itemKey));
  return (name: string) => !keys.has(itemKey(name));
}

/**
 * Drop freeform AI lines (findings / pattern sentences) that NAME an excluded
 * item. A safety net for reused or persisted sets that were generated before the
 * owner excluded the item: generation already filters item-level inputs, but a
 * stored set from an earlier run can still mention it, so we strip those on reuse.
 * Case-insensitive substring match on the display name (Turkish locale).
 */
export function dropExcludedMentions(texts: string[], excluded: string[]): string[] {
  if (!excluded.length) return texts;
  const needles = excluded.map((n) => n.trim().toLocaleLowerCase("tr")).filter((n) => n.length >= 2);
  if (!needles.length) return texts;
  return texts.filter((t) => {
    const low = t.toLocaleLowerCase("tr");
    return !needles.some((n) => low.includes(n));
  });
}

/** Trim, drop blanks, and dedupe by match key while keeping the display form. */
export function normalizeExclusionList(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const t = String(n).trim();
    if (!t) continue;
    const k = itemKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
