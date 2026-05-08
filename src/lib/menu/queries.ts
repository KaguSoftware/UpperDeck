import "server-only";
import { unstable_cache } from "next/cache";
import { getCacheClient } from "@/lib/supabase/server";

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
  featuredItemId: string | null;
  featuredLabel: string | null;
  featuredBadge: string | null;
  featuredDiscount: number | null;
  featuredItem: FeaturedItem | null;
};

async function _getHeroSettings(): Promise<HeroSettings> {
  const supabase = getCacheClient();
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["hero_mode", "hero_media_url", "featured_item_id", "featured_label", "featured_badge", "featured_discount"]);

  const rows = (data ?? []) as { key: string; value: string | null }[];
  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? null;

  const heroMode = (get("hero_mode") || "none") as "none" | "media" | "featured";
  const url = get("hero_media_url") || null;
  const featuredItemId = get("featured_item_id") || null;
  const featuredLabel = get("featured_label") || null;
  const featuredBadge = get("featured_badge") || null;
  const rawDiscount = get("featured_discount");
  const featuredDiscount = rawDiscount ? parseInt(rawDiscount, 10) || null : null;

  let featuredItem: FeaturedItem | null = null;
  if (heroMode === "featured" && featuredItemId) {
    const { data: item } = await supabase
      .from("menu_items")
      .select("id, name_en, name_tr, image_url, emoji, price")
      .eq("id", featuredItemId)
      .single();
    if (item) {
      featuredItem = { id: item.id, name: item.name_en, image_url: item.image_url, emoji: item.emoji, price: item.price };
    }
  }

  return { heroMode, heroMediaUrl: heroMode === "media" ? url : null, featuredItemId, featuredLabel, featuredBadge, featuredDiscount, featuredItem };
}

export const getHeroSettings = unstable_cache(
  _getHeroSettings,
  ["hero-settings"],
  { tags: ["hero"] }
);

export type AddonOptionPublic = { id: string; label: string; price: number; image_url: string | null; emoji: string | null };
export type AddonGroupPublic  = { id: string; label: string; multi: boolean; options: AddonOptionPublic[] };

export type SuggestedItemPublic = { id: string; name: string; price: number; image_url: string | null; emoji: string };

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
  suggestedItems: SuggestedItemPublic[];
};

async function _getPublicMenu(locale: "en" | "tr"): Promise<{
  categories: PublicCategory[];
  items: PublicMenuItem[];
}> {
  const supabase = getCacheClient();
  const n = locale === "tr" ? "tr" : "en";

  const { data: cats, error: catsError } = await supabase
    .from("categories")
    .select(`id, slug, name_${n}, sort_order, emoji, image_url, parent_id`)
    .order("sort_order", { ascending: true });

  if (catsError) {
    throw new Error(`Failed to fetch categories: ${catsError.message}`);
  }

  const { data: rows, error: itemsError } = await supabase
    .from("menu_items")
    .select(
      `id, category_id, name_${n}, hook_${n}, desc_${n}, emoji, highlight, image_url, price, spicy, sold_out, sort_order`
    )
    .eq("is_available", true)
    .order("sort_order", { ascending: true });

  if (itemsError) {
    throw new Error(`Failed to fetch menu items: ${itemsError.message}`);
  }

  // Fetch all addon groups with their options in one query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: addonRaw, error: addonError } = await (supabase as any)
    .from("addon_groups")
    .select(`id, category_id, menu_item_id, label_${n}, multi, sort_order, addon_options(id, label_${n}, price, sort_order, menu_item_id, menu_items(image_url, emoji))`)
    .order("sort_order", { ascending: true });
  if (addonError) console.warn("[getPublicMenu] addon_groups query failed:", addonError.message);

  type RawAddonOption = { id: string; [label: string]: unknown; price: number; sort_order: number; menu_item_id: string | null; menu_items: { image_url: string | null; emoji: string } | null };
  type RawAddonGroup  = { id: string; category_id: string | null; menu_item_id: string | null; [label: string]: unknown; multi: boolean; sort_order: number; addon_options: RawAddonOption[] };
  const addonGroups: RawAddonGroup[] = (addonRaw ?? []) as RawAddonGroup[];

  // Fetch all suggested groups with their items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: suggestedRaw, error: suggestedError } = await (supabase as any)
    .from("suggested_groups")
    .select(`id, category_id, menu_item_id, sort_order, suggested_items(id, sort_order, menu_item_id, menu_items(id, name_${n}, image_url, emoji, price))`)
    .order("sort_order", { ascending: true });
  if (suggestedError) console.warn("[getPublicMenu] suggested_groups query failed:", suggestedError.message);

  type RawSuggestedItem = { id: string; sort_order: number; menu_item_id: string; menu_items: { id: string; [name: string]: unknown; image_url: string | null; emoji: string; price: number } | null };
  type RawSuggestedGroup = { id: string; category_id: string | null; menu_item_id: string | null; sort_order: number; suggested_items: RawSuggestedItem[] };
  const suggestedGroups: RawSuggestedGroup[] = (suggestedRaw ?? []) as RawSuggestedGroup[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catById = new Map((cats as any[]).map((c) => [c.id, c]));

  function resolveItemCat(categoryId: string): { topSlug: string; subSlug: string | null } {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cat = catById.get(categoryId) as any;
    if (!cat) return { topSlug: "", subSlug: null };
    if (cat.parent_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parent = catById.get(cat.parent_id) as any;
      return { topSlug: parent?.slug ?? cat.slug, subSlug: cat.slug };
    }
    return { topSlug: cat.slug, subSlug: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topCats = (cats as any[]).filter((c) => !c.parent_id);

  const categories: PublicCategory[] = topCats.map((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subs = (cats as any[]).filter((s) => s.parent_id === c.id);
    return {
      slug: c.slug,
      name: c[`name_${n}`] as string,
      emoji: c.emoji ?? null,
      image_url: c.image_url ?? null,
      subcategories: subs.map((s) => ({
        slug: s.slug,
        name: s[`name_${n}`] as string,
      })),
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: PublicMenuItem[] = (rows as any[])
    .filter((r) => catById.has(r.category_id))
    .sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const catA = catById.get(a.category_id) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const catB = catById.get(b.category_id) as any;
      const topA = catA.parent_id ? (catById.get(catA.parent_id) as any)?.sort_order ?? catA.sort_order : catA.sort_order;
      const topB = catB.parent_id ? (catById.get(catB.parent_id) as any)?.sort_order ?? catB.sort_order : catB.sort_order;
      if (topA !== topB) return topA - topB;
      if (catA.sort_order !== catB.sort_order) return catA.sort_order - catB.sort_order;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return (a[`name_${n}`] as string).localeCompare(b[`name_${n}`] as string);
    })
    .map((r) => {
      const { topSlug, subSlug } = resolveItemCat(r.category_id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cat = catById.get(r.category_id) as any;
      const parentCatId = cat?.parent_id ?? null;
      const itemGroups = addonGroups.filter((g) => g.menu_item_id === r.id);
      const catGroups  = addonGroups.filter(
        (g) => g.category_id === r.category_id || (parentCatId && g.category_id === parentCatId)
      );
      const resolved = (itemGroups.length > 0 ? itemGroups : catGroups).map((g) => ({
        id: g.id,
        label: g[`label_${n}`] as string,
        multi: g.multi,
        options: ((g.addon_options ?? []) as RawAddonOption[])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((o) => ({
            id: o.id,
            label: o[`label_${n}`] as string,
            price: o.price,
            image_url: (o.menu_items as { image_url: string | null; emoji: string } | null)?.image_url ?? null,
            emoji: (o.menu_items as { image_url: string | null; emoji: string } | null)?.emoji ?? null,
          })),
      }));

      const sugItemGroups = suggestedGroups.filter((g) => g.menu_item_id === r.id);
      const sugCatGroups  = suggestedGroups.filter(
        (g) => g.category_id === r.category_id || (parentCatId && g.category_id === parentCatId)
      );
      const resolvedSuggested = (sugItemGroups.length > 0 ? sugItemGroups : sugCatGroups)
        .flatMap((g) =>
          (g.suggested_items ?? [])
            .sort((a, b) => a.sort_order - b.sort_order)
            .filter((s) => s.menu_items && s.menu_item_id !== r.id)
            .map((s) => ({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              id: (s.menu_items as any).id as string,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              name: (s.menu_items as any)[`name_${n}`] as string,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              price: (s.menu_items as any).price as number,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              image_url: (s.menu_items as any).image_url as string | null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              emoji: (s.menu_items as any).emoji as string,
            }))
        )
        .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx);

      return {
        id: r.id,
        cat: topSlug,
        subcat: subSlug,
        name: r[`name_${n}`] as string,
        hook: r[`hook_${n}`] as string,
        desc: r[`desc_${n}`] as string,
        image_url: r.image_url,
        emoji: r.emoji,
        highlight: r.highlight as "green-fill" | "orange-fill" | null,
        price: r.price,
        spicy: r.spicy,
        sold_out: r.sold_out,
        addonGroups: resolved,
        suggestedItems: resolvedSuggested,
      };
    });

  return { categories, items };
}

export const getPublicMenu = unstable_cache(
  _getPublicMenu,
  ["public-menu"],
  { tags: ["menu"] }
);
