import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../_components";
import { MenuList } from "./_list";

export const dynamic = "force-dynamic";

type SortKey = "name" | "category";

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort } = await searchParams;
  const sortKey: SortKey = sort === "name" ? "name" : "category";

  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name_en, price, image_url, spicy, is_available, sold_out, sort_order, category_id, categories(name_en)")
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  if (error) throw new Error(error.message);

  const raw = data ?? [];
  const items = [...raw]
    .sort((a, b) => {
      if (sortKey === "name") return a.name_en.localeCompare(b.name_en);
      const ca = (a.categories as { name_en: string } | null)?.name_en ?? "";
      const cb = (b.categories as { name_en: string } | null)?.name_en ?? "";
      return ca.localeCompare(cb) || a.name_en.localeCompare(b.name_en);
    })
    .map((item) => ({
      id: item.id,
      name_en: item.name_en,
      price: item.price,
      image_url: item.image_url,
      spicy: item.spicy,
      is_available: item.is_available,
      sold_out: item.sold_out,
      sort_order: item.sort_order,
      category_name: (item.categories as { name_en: string } | null)?.name_en ?? "—",
    }));

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "category", label: "Kategori" },
    { key: "name", label: "Alfabetik" },
  ];

  return (
    <>
      <PageHeader
        title="Menü"
        subtitle={`${items.length} ürün`}
        action={
          <Link
            href="/admin/menu/new"
            className="bg-orange text-white px-4 py-2.5 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase"
          >
            + Yeni Ürün
          </Link>
        }
      />
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green/60">Sırala:</span>
        {sortOptions.map(({ key, label }) => (
          <Link
            key={key}
            href={key === "category" ? "/admin/menu" : `/admin/menu?sort=${key}`}
            className={[
              "px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] border-2",
              sortKey === key
                ? "bg-green text-bg border-green"
                : "bg-transparent text-green border-green/30 hover:border-green",
            ].join(" ")}
          >
            {label}
          </Link>
        ))}
      </div>
      <MenuList key={sortKey} initial={items} />
    </>
  );
}
