import "server-only";
import { getServerClient } from "@/lib/supabase/server";

export type FeaturedItem = {
  id: string;
  name: string;
  image_url: string | null;
  emoji: string;
  price: number;
};

export type HeroSettings = {
  heroMode: "none" | "media" | "featured";
  heroMediaUrl: string | null;
  heroMediaType: "image" | "video" | null;
  featuredItemId: string | null;
  featuredLabel: string | null;
  featuredBadge: string | null;
  featuredDiscount: number | null;
  featuredItem: FeaturedItem | null;
};

export async function getHeroSettings(): Promise<HeroSettings> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["hero_mode", "hero_media_url", "hero_media_type", "featured_item_id", "featured_label", "featured_badge", "featured_discount"]);

  const rows = (data ?? []) as { key: string; value: string | null }[];
  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? null;

  const heroMode = (get("hero_mode") || "none") as "none" | "media" | "featured";
  const url = get("hero_media_url") || null;
  const type = get("hero_media_type") as "image" | "video" | null;
  const featuredItemId = get("featured_item_id") || null;
  const featuredLabel = get("featured_label") || null;
  const featuredBadge = get("featured_badge") || null;
  const rawDiscount = get("featured_discount");
  const featuredDiscount = rawDiscount ? parseInt(rawDiscount, 10) || null : null;

  let featuredItem: FeaturedItem | null = null;
  if (heroMode === "featured" && featuredItemId) {
    const { data: item } = await supabase
      .from("menu_items")
      .select("id, name_en, image_url, emoji, price")
      .eq("id", featuredItemId)
      .single();
    if (item) {
      featuredItem = { id: item.id, name: item.name_en, image_url: item.image_url, emoji: item.emoji, price: item.price };
    }
  }

  return { heroMode, heroMediaUrl: heroMode === "media" ? url : null, heroMediaType: type || null, featuredItemId, featuredLabel, featuredBadge, featuredDiscount, featuredItem };
}

export type AddonOptionPublic = { id: string; label: string; price: number };
export type AddonGroupPublic  = { id: string; label: string; multi: boolean; options: AddonOptionPublic[] };

export type PublicCategory = {
  slug: string;
  name: string;
  emoji: string | null;
  image_url: string | null;
  subcategories: { slug: string; name: string }[];
};
export type PublicMenuItem = {
  id: string;
  cat: string;
  subcat: string | null;
  name: string;
  hook: string;
  desc: string;
  image_url: string | null;
  emoji: string;
  highlight: "green-fill" | "orange-fill" | null;
  price: number;
  spicy: boolean;
  sold_out: boolean;
  addonGroups: AddonGroupPublic[];
};

export async function getPublicMenu(locale: "en" | "tr"): Promise<{
  categories: PublicCategory[];
  items: PublicMenuItem[];
}> {
  const supabase = await getServerClient();

  const { data: cats, error: catsError } = await supabase
    .from("categories")
    .select("id, slug, name_en, name_tr, sort_order, emoji, image_url, parent_id")
    .order("sort_order", { ascending: true });

  if (catsError) {
    throw new Error(`Failed to fetch categories: ${catsError.message}`);
  }

  const { data: rows, error: itemsError } = await supabase
    .from("menu_items")
    .select(
      "id, category_id, name_en, name_tr, hook_en, hook_tr, desc_en, desc_tr, emoji, highlight, image_url, price, spicy, sold_out, sort_order"
    )
    .eq("is_available", true)
    .order("sort_order", { ascending: true });

  if (itemsError) {
    throw new Error(`Failed to fetch menu items: ${itemsError.message}`);
  }

  // Fetch all addon groups with their options in one query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: addonRaw } = await (supabase as any)
    .from("addon_groups")
    .select("id, category_id, menu_item_id, label_en, label_tr, multi, sort_order, addon_options(id, label_en, label_tr, price, sort_order)")
    .order("sort_order", { ascending: true });

  type RawAddonOption = { id: string; label_en: string; label_tr: string; price: number; sort_order: number };
  type RawAddonGroup  = { id: string; category_id: string | null; menu_item_id: string | null; label_en: string; label_tr: string; multi: boolean; sort_order: number; addon_options: RawAddonOption[] };
  const addonGroups: RawAddonGroup[] = (addonRaw ?? []) as RawAddonGroup[];

  // Build lookup: id → cat row
  const catById = new Map(cats.map((c) => [c.id, c]));

  // Resolve the "effective slug" for an item: use its category's parent slug if it has one,
  // otherwise its own category slug. This is what goes into item.cat.
  // We also need the sub-slug for grouping within the section.
  function resolveItemCat(categoryId: string): { topSlug: string; subSlug: string | null } {
    const cat = catById.get(categoryId);
    if (!cat) return { topSlug: "", subSlug: null };
    if (cat.parent_id) {
      const parent = catById.get(cat.parent_id);
      return { topSlug: parent?.slug ?? cat.slug, subSlug: cat.slug };
    }
    return { topSlug: cat.slug, subSlug: null };
  }

  // Top-level categories only (for the sections list)
  const topCats = cats.filter((c) => !c.parent_id);

  const categories: PublicCategory[] = topCats.map((c) => {
    const subs = cats.filter((s) => s.parent_id === c.id);
    return {
      slug: c.slug,
      name: locale === "tr" ? c.name_tr : c.name_en,
      emoji: c.emoji ?? null,
      image_url: c.image_url ?? null,
      subcategories: subs.map((s) => ({
        slug: s.slug,
        name: locale === "tr" ? s.name_tr : s.name_en,
      })),
    };
  });

  const items: PublicMenuItem[] = rows
    .filter((r) => catById.has(r.category_id))
    .sort((a, b) => {
      const ra = resolveItemCat(a.category_id);
      const rb = resolveItemCat(b.category_id);
      const catA = catById.get(a.category_id)!;
      const catB = catById.get(b.category_id)!;
      // Sort by top-level sort_order first
      const topA = catA.parent_id ? catById.get(catA.parent_id)?.sort_order ?? catA.sort_order : catA.sort_order;
      const topB = catB.parent_id ? catById.get(catB.parent_id)?.sort_order ?? catB.sort_order : catB.sort_order;
      if (topA !== topB) return topA - topB;
      // Then by sub sort_order
      if (catA.sort_order !== catB.sort_order) return catA.sort_order - catB.sort_order;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name_en.localeCompare(b.name_en);
    })
    .map((r) => {
      const { topSlug, subSlug } = resolveItemCat(r.category_id);

      // Resolve addon groups: item-level overrides category-level
      const cat = catById.get(r.category_id);
      const parentCatId = cat?.parent_id ?? null;
      const itemGroups = addonGroups.filter((g) => g.menu_item_id === r.id);
      const catGroups  = addonGroups.filter(
        (g) => g.category_id === r.category_id || (parentCatId && g.category_id === parentCatId)
      );
      const resolved = (itemGroups.length > 0 ? itemGroups : catGroups).map((g) => ({
        id: g.id,
        label: locale === "tr" ? g.label_tr : g.label_en,
        multi: g.multi,
        options: (g.addon_options ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((o) => ({
            id: o.id,
            label: locale === "tr" ? o.label_tr : o.label_en,
            price: o.price,
          })),
      }));

      return {
        id: r.id,
        cat: topSlug,
        subcat: subSlug,
        name: locale === "tr" ? r.name_tr : r.name_en,
        hook: locale === "tr" ? r.hook_tr : r.hook_en,
        desc: locale === "tr" ? r.desc_tr : r.desc_en,
        image_url: r.image_url,
        emoji: r.emoji,
        highlight: r.highlight as "green-fill" | "orange-fill" | null,
        price: r.price,
        spicy: r.spicy,
        sold_out: r.sold_out,
        addonGroups: resolved,
      };
    });

  return { categories, items };
}
