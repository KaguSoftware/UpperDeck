import "server-only";
import { getServerClient } from "@/lib/supabase/server";

export type PublicCategory = { slug: string; name: string };
export type PublicMenuItem = {
  cat: string;
  name: string;
  hook: string;
  desc: string;
  image_url: string | null;
  emoji: string;
  highlight: "green-fill" | "orange-fill" | null;
  price: number;
  spicy: boolean;
};

export async function getPublicMenu(locale: "en" | "tr"): Promise<{
  categories: PublicCategory[];
  items: PublicMenuItem[];
}> {
  const supabase = await getServerClient();

  const { data: cats, error: catsError } = await supabase
    .from("categories")
    .select("id, slug, name_en, name_tr, sort_order")
    .order("sort_order", { ascending: true });

  if (catsError) {
    throw new Error(`Failed to fetch categories: ${catsError.message}`);
  }

  const { data: rows, error: itemsError } = await supabase
    .from("menu_items")
    .select(
      "category_id, name_en, name_tr, hook_en, hook_tr, desc_en, desc_tr, emoji, highlight, image_url, price, spicy, sort_order"
    )
    .eq("is_available", true)
    .order("sort_order", { ascending: true });

  if (itemsError) {
    throw new Error(`Failed to fetch menu items: ${itemsError.message}`);
  }

  const catById = new Map(
    cats.map((c) => [c.id, { slug: c.slug, sort_order: c.sort_order }])
  );

  const categories: PublicCategory[] = cats.map((c) => ({
    slug: c.slug,
    name: locale === "tr" ? c.name_tr : c.name_en,
  }));

  const items: PublicMenuItem[] = rows
    .filter((r) => catById.has(r.category_id))
    .sort((a, b) => {
      const catA = catById.get(a.category_id)!;
      const catB = catById.get(b.category_id)!;
      if (catA.sort_order !== catB.sort_order)
        return catA.sort_order - catB.sort_order;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name_en.localeCompare(b.name_en);
    })
    .map((r) => ({
      cat: catById.get(r.category_id)!.slug,
      name: locale === "tr" ? r.name_tr : r.name_en,
      hook: locale === "tr" ? r.hook_tr : r.hook_en,
      desc: locale === "tr" ? r.desc_tr : r.desc_en,
      image_url: r.image_url,
      emoji: r.emoji,
      highlight: r.highlight as "green-fill" | "orange-fill" | null,
      price: r.price,
      spicy: r.spicy,
    }));

  return { categories, items };
}
