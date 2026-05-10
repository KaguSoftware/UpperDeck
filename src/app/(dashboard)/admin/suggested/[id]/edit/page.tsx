import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { Field, PrimaryButton, GhostButton, DangerButton, PageHeader } from "../../../_components";
import { updateGroup, deleteGroup, createItem, deleteItem } from "../../actions";
import { SuggestedItemForm } from "./_item-form";
import { ReorderButtons } from "./_reorder-buttons";


export default async function EditSuggestedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerClient();

  const [{ data: groupRaw, error }, { data: allItems }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("suggested_groups")
      .select("*, categories(name_en), menu_items(name_en), suggested_items(id, sort_order, menu_item_id, menu_items(name_en, image_url, emoji))")
      .eq("id", id)
      .single(),
    supabase.from("menu_items").select("id, name_en, image_url, emoji").order("name_en"),
  ]);

  if (error || !groupRaw) notFound();

  const group = groupRaw as {
    id: string;
    label_en: string;
    label_tr: string;
    sort_order: number;
    category_id: string | null;
    menu_item_id: string | null;
    categories: { name_en: string } | null;
    menu_items: { name_en: string } | null;
    suggested_items: {
      id: string;
      sort_order: number;
      menu_item_id: string;
      menu_items: { name_en: string; image_url: string | null; emoji: string } | null;
    }[];
  };

  const menuItems = (allItems ?? []) as { id: string; name_en: string; image_url: string | null; emoji: string }[];
  const scopeName = group.category_id
    ? ((group.categories as { name_en: string } | null)?.name_en ?? "—")
    : ((group.menu_items as { name_en: string } | null)?.name_en ?? "—");
  const scopeType = group.category_id ? "Category" : "Menu Item";
  const suggestions = (group.suggested_items ?? []).sort((a, b) => a.sort_order - b.sort_order);

  const updateGroupWithId = updateGroup.bind(null, id);
  const createItemForGroup = createItem.bind(null, id);

  return (
    <>
      <PageHeader
        title={group.label_en}
        subtitle={`${scopeType}: ${scopeName}`}
        action={<GhostButton href="/admin/suggested">← Tüm Önerilen</GhostButton>}
      />

      {/* Section 1 — Group settings */}
      <section className="mb-10">
        <h2 className="font-bowlby text-[16px] text-green uppercase tracking-[-0.3px] mb-3">Grup Ayarları</h2>
        <form
          action={updateGroupWithId}
          className="border-2 border-green bg-white p-6 grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl"
        >
          <input type="hidden" name="scope" value={group.category_id ? "category" : "item"} />
          {group.category_id && <input type="hidden" name="category_id" value={group.category_id} />}
          {group.menu_item_id && <input type="hidden" name="menu_item_id" value={group.menu_item_id} />}

          <Field label="Etiket (İNG)" name="label_en" required defaultValue={group.label_en} />
          <Field label="Etiket (TR)" name="label_tr" required defaultValue={group.label_tr} />
          <Field label="Sıralama" name="sort_order" type="number" defaultValue={group.sort_order} />

          <div className="md:col-span-2 flex gap-3 pt-2 border-t-2 border-green/20">
            <PrimaryButton>Değişiklikleri Kaydet</PrimaryButton>
          </div>
        </form>

        <form action={deleteGroup} className="mt-4">
          <input type="hidden" name="id" value={id} />
          <DangerButton>Grubu ve Tüm Ürünleri Sil</DangerButton>
        </form>
      </section>

      {/* Section 2 — Suggested items */}
      <section>
        <h2 className="font-bowlby text-[16px] text-green uppercase tracking-[-0.3px] mb-3">
          Önerilen Ürünler <span className="text-green/50 text-[13px] font-ui font-normal normal-case tracking-normal">({suggestions.length})</span>
        </h2>

        {/* Add new item */}
        <div className="border-2 border-green/40 border-dashed p-4 mb-6">
          <p className="font-ui font-extrabold text-[10px] tracking-[0.22em] uppercase text-green/60 mb-3">Ürün Ekle</p>
          <SuggestedItemForm
            groupId={id}
            menuItems={menuItems}
            defaultSortOrder={suggestions.length}
            createAction={createItemForGroup}
          />
        </div>

        {/* Existing items */}
        {suggestions.length > 0 && (
          <div className="border-2 border-green overflow-hidden">
            {suggestions.map((sug, i) => (
              <div key={sug.id} className={["p-4", i > 0 ? "border-t border-green/20" : ""].join(" ")}>
                <div className="flex items-center gap-2">
                  <ReorderButtons itemId={sug.id} groupId={id} isFirst={i === 0} isLast={i === suggestions.length - 1} />

                  <div className="w-10 h-10 bg-bg-deep flex items-center justify-center overflow-hidden shrink-0">
                    {sug.menu_items?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sug.menu_items.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[20px]">{sug.menu_items?.emoji}</span>
                    )}
                  </div>

                  <span className="flex-1 font-ui font-semibold text-[13px] text-green">
                    {sug.menu_items?.name_en ?? "—"}
                  </span>

                  <form action={deleteItem} className="shrink-0">
                    <input type="hidden" name="id" value={sug.id} />
                    <input type="hidden" name="group_id" value={id} />
                    <DangerButton>✕</DangerButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
