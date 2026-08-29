import "server-only";
import type { NamedCount } from "@/lib/analytics/posthog";

/**
 * Category SLUG → the name the owner actually calls it.
 *
 * `category_selected` is tracked with the URL slug ("cold-drinks", "french-toast",
 * "dog-bun"), which is fine as a stable key and wrong as a label: it puts raw
 * English identifiers on the axis of an otherwise fully Turkish page. The
 * localized names already exist one table over, so the chart uses those and falls
 * back to the slug only for a category that has since been deleted.
 */
export async function getLocalizedCategoryNames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  locale: "tr" | "en" = "tr"
): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("categories").select("slug, name_tr, name_en");
  if (error) {
    console.warn("[analytics] category name read failed — falling back to slugs", error.message);
    return new Map();
  }
  const map = new Map<string, string>();
  for (const row of (data ?? []) as { slug: string; name_tr: string; name_en: string }[]) {
    const name = (locale === "en" ? row.name_en : row.name_tr) || row.name_tr || row.name_en;
    if (row.slug && name) map.set(row.slug, name);
  }
  return map;
}

/** Relabel slug-keyed counts with their localized names, keeping order. */
export function localizeCategoryCounts(rows: NamedCount[], names: Map<string, string>): NamedCount[] {
  return rows.map((r) => ({ ...r, name: names.get(r.name) ?? r.name }));
}
