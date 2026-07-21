import "server-only";
import { getServerClient } from "@/lib/supabase/server";
import { canonicalItemName } from "@/lib/analytics/clean-sales";

/**
 * "Real food" filter for the Hidden Gems section.
 *
 * Hidden Gems should surface actual dishes to promote (burgers, waffles, shared
 * plates, sweets) — not drinks, add-ons or sauces. We classify by the item's menu
 * CATEGORY (authoritative), with two name-based exceptions:
 *   - fries ("patates") live under the `shared` category but aren't the point;
 *   - "menu" / upgrade items are add-ons, not a dish.
 */

// Non-food categories (slugs) — drinks, extras/add-ons and sauces.
const NON_FOOD_CATEGORIES = new Set([
  "cold-drinks",
  "hot-drinks",
  "milkshakes",
  "mocktails",
  "extra",
  "breakfast-extra",
  "sauces",
]);

// Non-food by name, regardless of category (fries sit under `shared`).
const NON_FOOD_NAME = /(patates|fries|\bmenü?\b|upgrade)/i;

const key = (name: string) => canonicalItemName(name).toLocaleLowerCase("tr");

/**
 * Returns a predicate that keeps only real-food item names. Items not found in
 * the menu are kept as long as their name isn't obviously non-food, so a name
 * mismatch never silently hides a real dish.
 */
export async function getRealFoodFilter(): Promise<(name: string) => boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await getServerClient()) as any;
  const [{ data: items }, { data: cats }] = await Promise.all([
    supabase.from("menu_items").select("name_en, name_tr, category_id"),
    supabase.from("categories").select("id, slug"),
  ]);

  const slugById = new Map<string, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((cats ?? []) as any[]).map((c) => [c.id as string, c.slug as string])
  );
  // Every menu name (en + tr, canonicalized) → its category slug.
  const slugByName = new Map<string, string>();
  for (const r of (items ?? []) as { name_en: string; name_tr: string; category_id: string }[]) {
    const slug = slugById.get(r.category_id) ?? "";
    if (r.name_en) slugByName.set(key(r.name_en), slug);
    if (r.name_tr) slugByName.set(key(r.name_tr), slug);
  }

  return (name: string) => {
    if (NON_FOOD_NAME.test(name)) return false;
    const slug = slugByName.get(key(name));
    return !(slug && NON_FOOD_CATEGORIES.has(slug));
  };
}
