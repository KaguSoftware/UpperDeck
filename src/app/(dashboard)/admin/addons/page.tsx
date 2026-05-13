import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getCacheClient } from "@/lib/supabase/server";
import { PageHeader } from "../_components";

const getAdminAddons = unstable_cache(
  async () => {
    const supabase = getCacheClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("addon_groups")
      .select("id, label_en, multi, sort_order, category_id, addon_options!addon_group_id(count), categories(name_en), addon_group_items(menu_items(name_en))")
      .order("sort_order", { ascending: true });
    if (error) throw new Error((error as { message: string }).message);
    return data ?? [];
  },
  ["admin-addons-list"],
  { tags: ["menu"] }
);

export default async function AddonsPage() {
  const data = await getAdminAddons();

  type RawGroup = {
    id: string; label_en: string; multi: boolean; sort_order: number;
    category_id: string | null;
    addon_options: { count: number }[];
    categories: { name_en: string } | null;
    addon_group_items: { menu_items: { name_en: string } | null }[];
  };

  const groups = ((data ?? []) as RawGroup[]).map((g) => {
    const itemNames = (g.addon_group_items ?? [])
      .map((gi) => gi.menu_items?.name_en)
      .filter(Boolean)
      .join(", ");
    return {
      id: g.id,
      label: g.label_en,
      multi: g.multi,
      sort_order: g.sort_order,
      scope: g.category_id ? "category" : "item",
      scopeName: g.category_id
        ? ((g.categories as { name_en: string } | null)?.name_en ?? "—")
        : (itemNames || "—"),
      optionCount: (g.addon_options as { count: number }[])?.[0]?.count ?? 0,
    };
  });

  const categoryGroups = groups.filter((g) => g.scope === "category");
  const itemGroups = groups.filter((g) => g.scope === "item");

  return (
    <>
      <PageHeader
        title="Ekstralar"
        subtitle={`${groups.length} grup`}
        action={
          <Link
            href="/admin/addons/new"
            className="bg-orange text-white px-4 py-2.5 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase"
          >
            + Yeni Grup
          </Link>
        }
      />

      {groups.length === 0 && (
        <p className="text-green/60 font-ui text-[13px]">
          Henüz ekstra grubu yok.{" "}
          <Link href="/admin/addons/new" className="underline text-orange">
            Oluştur
          </Link>{" "}
          ve ürün modalında ekstraları göster.
        </p>
      )}

      {categoryGroups.length > 0 && (
        <section className="mb-8">
          <h2 className="font-bowlby text-[18px] text-green uppercase tracking-[-0.3px] mb-3">
            Kategori Ekstraları
          </h2>
          <GroupTable groups={categoryGroups} />
        </section>
      )}

      {itemGroups.length > 0 && (
        <section>
          <h2 className="font-bowlby text-[18px] text-green uppercase tracking-[-0.3px] mb-3">
            Ürün Ekstraları
          </h2>
          <GroupTable groups={itemGroups} />
        </section>
      )}
    </>
  );
}

function GroupTable({
  groups,
}: {
  groups: { id: string; label: string; multi: boolean; scopeName: string; optionCount: number }[];
}) {
  return (
    <div className="border-2 border-green overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b-2 border-green bg-green/5">
            <th className="px-4 py-2.5 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase text-green">Kapsam</th>
            <th className="px-4 py-2.5 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase text-green">Grup Etiketi</th>
            <th className="px-4 py-2.5 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase text-green">Tür</th>
            <th className="px-4 py-2.5 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase text-green">Seçenekler</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} className="border-b border-green/20 hover:bg-green/5 transition-colors">
              <td className="px-4 py-3 font-ui text-[13px] text-green">{g.scopeName}</td>
              <td className="px-4 py-3 font-ui font-semibold text-[13px] text-green">{g.label}</td>
              <td className="px-4 py-3 font-ui text-[12px] text-green/70">
                {g.multi ? "Çoklu" : "Tekli"}
              </td>
              <td className="px-4 py-3 font-ui text-[12px] text-green/70">{g.optionCount}</td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/addons/${g.id}/edit`}
                  className="font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase text-orange hover:underline"
                >
                  Düzenle
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
