import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { Field, Checkbox, PrimaryButton, GhostButton, DangerButton, PageHeader } from "../../../_components";
import { updateGroup, deleteGroup, createOption, updateOption, deleteOption } from "../../actions";
import { AddonOptionForm } from "./_option-form";
import { ReorderButtons } from "./_reorder-buttons";
import { EditGroupItemsForm } from "./_edit-items-form";


export default async function EditAddonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerClient();

  const [{ data: groupRaw, error }, { data: allItems }, { data: assignedRaw }, { data: allGroupsRaw }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("addon_groups")
      .select("*, categories(name_en), addon_options(id, label_en, label_tr, price, sort_order, menu_item_id, menu_items(name_en, image_url, emoji))")
      .eq("id", id)
      .single(),
    supabase.from("menu_items").select("id, name_en, image_url, emoji, price").order("name_en"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("addon_group_items").select("menu_item_id").eq("addon_group_id", id),
    // All addon groups available as reveal targets (excluding this group)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("addon_groups").select("id, label_en").neq("id", id).order("label_en"),
  ]);

  if (error || !groupRaw) notFound();

  const group = groupRaw as {
    id: string;
    label_en: string;
    label_tr: string;
    multi: boolean;
    required: boolean;
    sort_order: number;
    category_id: string | null;
    categories: { name_en: string } | null;
    addon_options: {
      id: string;
      label_en: string;
      label_tr: string;
      price: number;
      sort_order: number;
      menu_item_id: string | null;
      menu_items: { name_en: string; image_url: string | null; emoji: string } | null;
    }[];
  };

  const menuItems = (allItems ?? []) as { id: string; name_en: string; image_url: string | null; emoji: string; price: number }[];
  const assignedItemIds = ((assignedRaw ?? []) as { menu_item_id: string }[]).map((r) => r.menu_item_id);
  const allGroups = (allGroupsRaw ?? []) as { id: string; label_en: string }[];

  const options = ((group.addon_options ?? []) as {
    id: string; label_en: string; label_tr: string; price: number; sort_order: number;
    menu_item_id: string | null;
    menu_items: { name_en: string; image_url: string | null; emoji: string } | null;
  }[]).sort((a, b) => a.sort_order - b.sort_order);

  // Fetch existing reveal assignments for all options in this group
  const optionIds = options.map((o) => o.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: revealsRaw } = optionIds.length > 0 ? await (supabase as any)
    .from("addon_option_reveals")
    .select("addon_option_id, addon_group_id")
    .in("addon_option_id", optionIds) : { data: [] };

  const revealsByOption = new Map<string, string[]>();
  ((revealsRaw ?? []) as { addon_option_id: string; addon_group_id: string }[]).forEach((r) => {
    const existing = revealsByOption.get(r.addon_option_id) ?? [];
    existing.push(r.addon_group_id);
    revealsByOption.set(r.addon_option_id, existing);
  });

  const isItemScope = !group.category_id;
  const scopeLabel = group.category_id
    ? `Kategori: ${(group.categories as { name_en: string } | null)?.name_en ?? "—"}`
    : `${assignedItemIds.length} Menü Ürünü`;

  const updateGroupWithId = updateGroup.bind(null, id);
  const createOptionForGroup = createOption.bind(null, id);

  return (
    <>
      <PageHeader
        title={group.label_en}
        subtitle={scopeLabel}
        action={<GhostButton href="/admin/addons">← Tüm Ekstralar</GhostButton>}
      />

      {/* Section 1 — Group settings */}
      <section className="mb-10">
        <h2 className="font-bowlby text-[16px] text-green uppercase tracking-[-0.3px] mb-3">Grup Ayarları</h2>
        <form
          action={updateGroupWithId}
          className="border-2 border-green bg-white p-6 grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl"
        >
          <input type="hidden" name="scope" value={isItemScope ? "item" : "category"} />
          {group.category_id && <input type="hidden" name="category_id" value={group.category_id} />}

          <Field label="Etiket (İNG)" name="label_en" required defaultValue={group.label_en} />
          <Field label="Etiket (TR)" name="label_tr" required defaultValue={group.label_tr} />
          <Field label="Sıralama" name="sort_order" type="number" defaultValue={group.sort_order} />

          <div className="flex flex-col gap-3 justify-center">
            <Checkbox label="Çoklu seçim" name="multi" defaultChecked={group.multi} />
            <Checkbox label="Zorunlu seçim" name="required" defaultChecked={group.required ?? false} />
          </div>

          {/* Item assignments for item-scoped groups */}
          {isItemScope && (
            <div className="md:col-span-2">
              <EditGroupItemsForm
                allItems={menuItems}
                assignedItemIds={assignedItemIds}
              />
            </div>
          )}

          <div className="md:col-span-2 flex gap-3 pt-2 border-t-2 border-green/20">
            <PrimaryButton>Değişiklikleri Kaydet</PrimaryButton>
          </div>
        </form>

        <form action={deleteGroup} className="mt-4">
          <input type="hidden" name="id" value={id} />
          <DangerButton>Grubu ve Tüm Seçenekleri Sil</DangerButton>
        </form>
      </section>

      {/* Section 2 — Options */}
      <section>
        <h2 className="font-bowlby text-[16px] text-green uppercase tracking-[-0.3px] mb-3">
          Seçenekler <span className="text-green/50 text-[13px] font-ui font-normal normal-case tracking-normal">({options.length})</span>
        </h2>

        {/* Add new option — always at top */}
        <div className="border-2 border-green/40 border-dashed p-4 mb-6">
          <p className="font-ui font-extrabold text-[10px] tracking-[0.22em] uppercase text-green/60 mb-3">Seçenek Ekle</p>
          <AddonOptionForm
            groupId={id}
            menuItems={menuItems}
            defaultSortOrder={options.length}
            createAction={createOptionForGroup}
            allGroups={allGroups}
            assignedRevealGroupIds={[]}
          />
        </div>

        {/* Existing options */}
        {options.length > 0 && (
          <div className="border-2 border-green overflow-hidden">
            {options.map((opt, i) => {
              const updateThisOption = updateOption.bind(null, opt.id, id);
              const isFirst = i === 0;
              const isLast = i === options.length - 1;
              return (
                <div key={opt.id} className={["p-4", i > 0 ? "border-t border-green/20" : ""].join(" ")}>
                  <div className="flex items-start gap-2">
                    <ReorderButtons optId={opt.id} groupId={id} isFirst={isFirst} isLast={isLast} />

                    {/* linked item preview + form */}
                    <div className="flex-1 min-w-0">
                      {opt.menu_items && (
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-10 h-10 bg-bg-deep flex items-center justify-center overflow-hidden shrink-0">
                            {opt.menu_items.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={opt.menu_items.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[20px]">{opt.menu_items.emoji}</span>
                            )}
                          </div>
                          <span className="font-ui font-semibold text-[12px] text-green/70">{opt.menu_items.name_en}</span>
                        </div>
                      )}
                      <AddonOptionForm
                        opt={opt}
                        groupId={id}
                        menuItems={menuItems}
                        updateAction={updateThisOption}
                        allGroups={allGroups}
                        assignedRevealGroupIds={revealsByOption.get(opt.id) ?? []}
                      />
                    </div>

                    {/* delete */}
                    <form action={deleteOption} className="pt-5 shrink-0">
                      <input type="hidden" name="id" value={opt.id} />
                      <input type="hidden" name="group_id" value={id} />
                      <DangerButton>✕</DangerButton>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
