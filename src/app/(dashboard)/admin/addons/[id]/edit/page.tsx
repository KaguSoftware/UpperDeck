import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { Field, Checkbox, PrimaryButton, GhostButton, DangerButton, PageHeader } from "../../../_components";
import { updateGroup, deleteGroup, createOption, updateOption, deleteOption, createRevealedGroup } from "../../actions";
import { AddonOptionForm } from "./_option-form";
import { ReorderButtons } from "./_reorder-buttons";
import { EditGroupItemsForm } from "./_edit-items-form";

type SubOption = {
  id: string; label_en: string; label_tr: string; price: number;
  sort_order: number; menu_item_id: string | null;
  menu_items: { name_en: string; image_url: string | null; emoji: string } | null;
};

type SubGroup = {
  id: string; label_en: string; label_tr: string; multi: boolean; required: boolean;
  addon_options: SubOption[];
};

export default async function EditAddonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerClient();

  const [{ data: groupRaw, error }, { data: allItems }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("addon_groups")
      .select("*, categories(name_en), addon_options!addon_group_id(id, label_en, label_tr, price, sort_order, menu_item_id, menu_items(name_en, image_url, emoji))")
      .eq("id", id)
      .single(),
    supabase.from("menu_items").select("id, name_en, image_url, emoji, price").order("name_en"),
  ]);

  const assignedResult = await (supabase as any).from("addon_group_items").select("menu_item_id").eq("addon_group_id", id);
  const assignedRaw = assignedResult.error ? [] : assignedResult.data;

  if (error || !groupRaw) notFound();

  const group = groupRaw as {
    id: string; label_en: string; label_tr: string; multi: boolean; required: boolean;
    sort_order: number; category_id: string | null;
    categories: { name_en: string } | null;
    addon_options: SubOption[];
  };

  const menuItems = (allItems ?? []) as { id: string; name_en: string; image_url: string | null; emoji: string; price: number }[];
  const assignedItemIds = ((assignedRaw ?? []) as { menu_item_id: string }[]).map((r) => r.menu_item_id);

  const options = (group.addon_options ?? []).sort((a, b) => a.sort_order - b.sort_order);

  const optionIds = options.map((o) => o.id);

  // Fetch revealed sub-groups for inline display, and all available sub-groups for the checklist
  const [revealsRes, allSubGroupsRes, allGroupItemsRes] = await Promise.all([
    // Current reveal assignments with full sub-group data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    optionIds.length > 0 ? (supabase as any)
      .from("addon_option_reveals")
      .select("addon_option_id, sort_order, addon_groups(id, label_en, label_tr, multi, required, addon_options!addon_group_id(id, label_en, label_tr, price, sort_order, menu_item_id, menu_items(name_en, image_url, emoji)))")
      .in("addon_option_id", optionIds)
      .order("sort_order") : Promise.resolve({ data: [] }),
    // All groups with no category (potential sub-groups)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("addon_groups").select("id, label_en").is("category_id", null).neq("id", id).order("label_en"),
    // Groups that have item assignments (to exclude them — they're regular item groups not sub-groups)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("addon_group_items").select("addon_group_id"),
  ]);

  const subGroupsByOption = new Map<string, SubGroup[]>();
  ((revealsRes.data ?? []) as { addon_option_id: string; addon_groups: SubGroup }[]).forEach((r) => {
    const existing = subGroupsByOption.get(r.addon_option_id) ?? [];
    existing.push(r.addon_groups);
    subGroupsByOption.set(r.addon_option_id, existing);
  });

  // Current reveal ids per option (for pre-checking the checklist)
  const revealIdsByOption = new Map<string, string[]>();
  ((revealsRes.data ?? []) as { addon_option_id: string; addon_groups: { id: string } }[]).forEach((r) => {
    const existing = revealIdsByOption.get(r.addon_option_id) ?? [];
    existing.push(r.addon_groups.id);
    revealIdsByOption.set(r.addon_option_id, existing);
  });

  // Sub-groups = no category_id AND no addon_group_items entries
  const groupsWithItems = new Set(((allGroupItemsRes.data ?? []) as { addon_group_id: string }[]).map((r) => r.addon_group_id));
  const availableSubGroups = ((allSubGroupsRes.data ?? []) as { id: string; label_en: string }[])
    .filter((g) => !groupsWithItems.has(g.id));

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

          {isItemScope && (
            <div className="md:col-span-2">
              <EditGroupItemsForm allItems={menuItems} assignedItemIds={assignedItemIds} />
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

        {/* Add new option */}
        <div className="border-2 border-green/40 border-dashed p-4 mb-6">
          <p className="font-ui font-extrabold text-[10px] tracking-[0.22em] uppercase text-green/60 mb-3">Seçenek Ekle</p>
          <AddonOptionForm
            groupId={id}
            menuItems={menuItems}
            defaultSortOrder={options.length}
            createAction={createOptionForGroup}
          />
        </div>

        {/* Existing options */}
        {options.length > 0 && (
          <div className="border-2 border-green overflow-hidden">
            {options.map((opt, i) => {
              const updateThisOption = updateOption.bind(null, opt.id, id);
              const createRevealedGroupForOption = createRevealedGroup.bind(null, opt.id);
              const subGroups = subGroupsByOption.get(opt.id) ?? [];
              return (
                <div key={opt.id} className={["p-4", i > 0 ? "border-t border-green/20" : ""].join(" ")}>
                  <div className="flex items-start gap-2">
                    <ReorderButtons optId={opt.id} groupId={id} isFirst={i === 0} isLast={i === options.length - 1} />

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
                        createRevealedGroupAction={createRevealedGroupForOption}
                        availableSubGroups={availableSubGroups}
                        assignedRevealIds={revealIdsByOption.get(opt.id) ?? []}
                      />

                      {/* Inline sub-groups */}
                      {subGroups.map((sg) => {
                        const sgOptions = (sg.addon_options ?? []).sort((a, b) => a.sort_order - b.sort_order);
                        const createOptionForSubGroup = createOption.bind(null, sg.id);
                        return (
                          <div key={sg.id} className="mt-4 pl-3 border-l-2 border-orange/50">
                            {/* Sub-group header */}
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <span className="font-bowlby text-[13px] text-orange uppercase tracking-[-0.3px]">{sg.label_en}</span>
                                <span className="ml-2 font-ui text-[10px] text-orange/60 uppercase tracking-[0.15em]">
                                  {sg.multi ? "Çoklu" : "Tekli"}{sg.required ? " · Zorunlu" : ""}
                                </span>
                              </div>
                            </div>

                            {/* Add option to sub-group */}
                            <div className="border border-orange/30 border-dashed p-3 mb-3">
                              <p className="font-ui font-extrabold text-[9px] tracking-[0.22em] uppercase text-orange/60 mb-2">Seçenek Ekle</p>
                              <AddonOptionForm
                                groupId={sg.id}
                                menuItems={menuItems}
                                defaultSortOrder={sgOptions.length}
                                createAction={createOptionForSubGroup}
                              />
                            </div>

                            {/* Existing sub-group options */}
                            {sgOptions.length > 0 && (
                              <div className="border border-orange/30 overflow-hidden">
                                {sgOptions.map((sopt, si) => {
                                  const updateSubOpt = updateOption.bind(null, sopt.id, sg.id);
                                  return (
                                    <div key={sopt.id} className={["p-3 flex items-start gap-2", si > 0 ? "border-t border-orange/20" : ""].join(" ")}>
                                      <ReorderButtons optId={sopt.id} groupId={sg.id} isFirst={si === 0} isLast={si === sgOptions.length - 1} />
                                      <div className="flex-1 min-w-0">
                                        {sopt.menu_items && (
                                          <div className="flex items-center gap-2 mb-2">
                                            <div className="w-8 h-8 bg-bg-deep flex items-center justify-center overflow-hidden shrink-0">
                                              {sopt.menu_items.image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={sopt.menu_items.image_url} alt="" className="w-full h-full object-cover" />
                                              ) : (
                                                <span className="text-[14px]">{sopt.menu_items.emoji}</span>
                                              )}
                                            </div>
                                            <span className="font-ui text-[11px] text-green/60">{sopt.menu_items.name_en}</span>
                                          </div>
                                        )}
                                        <AddonOptionForm
                                          opt={sopt}
                                          groupId={sg.id}
                                          menuItems={menuItems}
                                          updateAction={updateSubOpt}
                                        />
                                      </div>
                                      <form action={deleteOption} className="pt-5 shrink-0">
                                        <input type="hidden" name="id" value={sopt.id} />
                                        <input type="hidden" name="group_id" value={sg.id} />
                                        <DangerButton>✕</DangerButton>
                                      </form>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* delete option */}
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
