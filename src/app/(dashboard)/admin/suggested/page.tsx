import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getCacheClient } from "@/lib/supabase/server";
import { PageHeader } from "../_components";

const getAdminSuggested = unstable_cache(
  async () => {
    const supabase = getCacheClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("suggested_groups")
      .select("id, label_en, sort_order, category_id, menu_item_id, suggested_items(count), categories(name_en), menu_items(name_en)")
      .order("sort_order", { ascending: true });
    if (error) throw new Error((error as { message: string }).message);
    return data ?? [];
  },
  ["admin-suggested-list"],
  { tags: ["menu"] }
);

export default async function SuggestedPage() {
  const data = await getAdminSuggested();

  type RawGroup = {
    id: string; label_en: string; sort_order: number;
    category_id: string | null; menu_item_id: string | null;
    suggested_items: { count: number }[];
    categories: { name_en: string } | null;
    menu_items: { name_en: string } | null;
  };

  const groups = ((data ?? []) as RawGroup[]).map((g) => ({
    id: g.id,
    label: g.label_en,
    sort_order: g.sort_order,
    scope: g.category_id ? "category" : "item",
    scopeName: g.category_id
      ? ((g.categories as { name_en: string } | null)?.name_en ?? "—")
      : ((g.menu_items as { name_en: string } | null)?.name_en ?? "—"),
    itemCount: (g.suggested_items as { count: number }[])?.[0]?.count ?? 0,
  }));

  const categoryGroups = groups.filter((g) => g.scope === "category");
  const itemGroups = groups.filter((g) => g.scope === "item");

  return (
    <>
      <PageHeader
        title="Önerilen"
        subtitle={`${groups.length} grup`}
        action={
          <Link
            href="/admin/suggested/new"
            className="bg-orange text-white px-4 py-2.5 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase"
          >
            + Yeni Grup
          </Link>
        }
      />

      {groups.length === 0 && (
        <p className="text-green/60 font-ui text-[13px]">
          Henüz öneri grubu yok.{" "}
          <Link href="/admin/suggested/new" className="underline text-orange">
            Oluştur
          </Link>{" "}
          ve ürün modalında &ldquo;Bunu da dene&rdquo; öğelerini göster.
        </p>
      )}

      {categoryGroups.length > 0 && (
        <section className="mb-8">
          <h2 className="font-bowlby text-[18px] text-green uppercase tracking-[-0.3px] mb-3">
            Kategori Önerileri
          </h2>
          <GroupTable groups={categoryGroups} />
        </section>
      )}

      {itemGroups.length > 0 && (
        <section>
          <h2 className="font-bowlby text-[18px] text-green uppercase tracking-[-0.3px] mb-3">
            Ürün Önerileri
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
  groups: { id: string; label: string; scopeName: string; itemCount: number }[];
}) {
  return (
    <div className="border-2 border-green overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b-2 border-green bg-green/5">
            <th className="px-4 py-2.5 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase text-green">Kapsam</th>
            <th className="px-4 py-2.5 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase text-green">Grup Etiketi</th>
            <th className="px-4 py-2.5 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase text-green">Ürünler</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} className="border-b border-green/20 hover:bg-green/5 transition-colors">
              <td className="px-4 py-3 font-ui text-[13px] text-green">{g.scopeName}</td>
              <td className="px-4 py-3 font-ui font-semibold text-[13px] text-green">{g.label}</td>
              <td className="px-4 py-3 font-ui text-[12px] text-green/70">{g.itemCount}</td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/suggested/${g.id}/edit`}
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
