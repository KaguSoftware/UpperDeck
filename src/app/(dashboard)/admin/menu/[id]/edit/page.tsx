import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../_components";
import { MenuItemForm } from "../../_form";
import { updateItem } from "../../actions";
import { buildCategoryOptions } from "../../_category-options";

export const dynamic = "force-dynamic";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerClient();

  const [itemRes, catRes, addonsRes] = await Promise.all([
    supabase.from("menu_items").select("*").eq("id", id).single(),
    supabase.from("categories").select("id, name_en, parent_id").order("sort_order"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("addon_groups").select("id, label_en, multi, addon_options(count)").eq("menu_item_id", id).order("sort_order"),
  ]);

  if (itemRes.error || !itemRes.data) notFound();

  const categories = buildCategoryOptions(catRes.data ?? []);
  const update = updateItem.bind(null, id);
  type RawAddonGroup = { id: string; label_en: string; multi: boolean; addon_options: { count: number }[] };
  const addonGroups = ((addonsRes.data ?? []) as RawAddonGroup[]).map((g) => ({
    id: g.id,
    label: g.label_en,
    multi: g.multi,
    optionCount: g.addon_options?.[0]?.count ?? 0,
  }));

  return (
    <>
      <PageHeader title="Ürünü Düzenle" subtitle={itemRes.data.name_en} />
      <MenuItemForm action={update} categories={categories} initial={itemRes.data} />

      {/* Add-Ons panel */}
      <div className="mt-8 max-w-3xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bowlby text-[18px] text-green uppercase tracking-[-0.3px]">Ürün Ekstraları</h2>
          <Link
            href={`/admin/addons/new?item_id=${id}`}
            className="bg-orange text-white px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.22em] uppercase"
          >
            + Grup Ekle
          </Link>
        </div>
        {addonGroups.length === 0 ? (
          <p className="text-green/60 font-ui text-[12px] border-2 border-dashed border-green/30 p-4">
            Ürüne özel ekstra grubu yok. Buradaki gruplar bu ürün için kategori düzeyindeki grupların önüne geçer.{" "}
            <Link href={`/admin/addons/new?item_id=${id}`} className="underline text-orange">Ekle</Link>.
          </p>
        ) : (
          <div className="border-2 border-green overflow-hidden">
            {addonGroups.map((g) => (
              <div key={g.id} className="flex items-center justify-between px-4 py-3 border-b border-green/20 last:border-0">
                <div>
                  <span className="font-ui font-semibold text-[13px] text-green">{g.label}</span>
                  <span className="ml-3 font-ui text-[11px] text-green/50">{g.multi ? "Çoklu" : "Tekli"} · {g.optionCount} seçenek</span>
                </div>
                <Link href={`/admin/addons/${g.id}/edit`} className="font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase text-orange hover:underline">
                  Düzenle
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
