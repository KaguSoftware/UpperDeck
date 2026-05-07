import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { Field, Checkbox, PrimaryButton, GhostButton, DangerButton, PageHeader } from "../../../_components";
import { updateGroup, deleteGroup, createOption, updateOption, deleteOption } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditAddonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: groupRaw, error } = await (supabase as any)
    .from("addon_groups")
    .select("*, categories(name_en), menu_items(name_en), addon_options(id, label_en, label_tr, price, sort_order)")
    .eq("id", id)
    .single();

  if (error || !groupRaw) notFound();

  const group = groupRaw as {
    id: string;
    label_en: string;
    label_tr: string;
    multi: boolean;
    sort_order: number;
    category_id: string | null;
    menu_item_id: string | null;
    categories: { name_en: string } | null;
    menu_items: { name_en: string } | null;
    addon_options: { id: string; label_en: string; label_tr: string; price: number; sort_order: number }[];
  };

  const scopeName = group.category_id
    ? ((group.categories as { name_en: string } | null)?.name_en ?? "—")
    : ((group.menu_items as { name_en: string } | null)?.name_en ?? "—");
  const scopeType = group.category_id ? "Category" : "Menu Item";

  const options = ((group.addon_options as { id: string; label_en: string; label_tr: string; price: number; sort_order: number }[]) ?? [])
    .sort((a, b) => a.sort_order - b.sort_order);

  const updateGroupWithId = updateGroup.bind(null, id);
  const createOptionForGroup = createOption.bind(null, id);

  return (
    <>
      <PageHeader
        title={group.label_en}
        subtitle={`${scopeType}: ${scopeName}`}
        action={
          <GhostButton href="/admin/addons">← All Add-Ons</GhostButton>
        }
      />

      {/* Section 1 — Group settings */}
      <section className="mb-10">
        <h2 className="font-bowlby text-[16px] text-green uppercase tracking-[-0.3px] mb-3">Group Settings</h2>
        <form
          action={updateGroupWithId}
          className="border-2 border-green bg-white p-6 grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl"
        >
          {/* Keep scope hidden so parseGroup works */}
          <input type="hidden" name="scope" value={group.category_id ? "category" : "item"} />
          {group.category_id && <input type="hidden" name="category_id" value={group.category_id} />}
          {group.menu_item_id && <input type="hidden" name="menu_item_id" value={group.menu_item_id} />}

          <Field label="Label (EN)" name="label_en" required defaultValue={group.label_en} />
          <Field label="Label (TR)" name="label_tr" required defaultValue={group.label_tr} />
          <Field label="Sort Order" name="sort_order" type="number" defaultValue={group.sort_order} />

          <div className="flex items-center">
            <Checkbox label="Multi-select" name="multi" defaultChecked={group.multi} />
          </div>

          <div className="md:col-span-2 flex gap-3 pt-2 border-t-2 border-green/20">
            <PrimaryButton>Save Changes</PrimaryButton>
          </div>
        </form>

        {/* Delete group */}
        <form action={deleteGroup} className="mt-4">
          <input type="hidden" name="id" value={id} />
          <DangerButton>Delete Group &amp; All Options</DangerButton>
        </form>
      </section>

      {/* Section 2 — Options */}
      <section>
        <h2 className="font-bowlby text-[16px] text-green uppercase tracking-[-0.3px] mb-3">
          Options <span className="text-green/50 text-[13px] font-ui font-normal normal-case tracking-normal">({options.length})</span>
        </h2>

        {options.length > 0 && (
          <div className="border-2 border-green mb-6 overflow-hidden">
            {options.map((opt, i) => {
              const updateThisOption = updateOption.bind(null, opt.id, id);
              return (
                <div
                  key={opt.id}
                  className={["p-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_80px_80px_auto] gap-3 items-end", i > 0 ? "border-t border-green/20" : ""].join(" ")}
                >
                  <form action={updateThisOption} className="contents">
                    <Field label="Label (EN)" name="label_en" defaultValue={opt.label_en} required />
                    <Field label="Label (TR)" name="label_tr" defaultValue={opt.label_tr} required />
                    <Field label="Price (₺)" name="price" type="number" defaultValue={opt.price} min="0" step="1" />
                    <Field label="Order" name="sort_order" type="number" defaultValue={opt.sort_order} />
                    <div className="flex items-end">
                      <PrimaryButton>Save</PrimaryButton>
                    </div>
                  </form>
                  <form action={deleteOption} className="md:col-start-6 flex items-end">
                    <input type="hidden" name="id" value={opt.id} />
                    <input type="hidden" name="group_id" value={id} />
                    <DangerButton>✕</DangerButton>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        {/* Add new option */}
        <div className="border-2 border-green/40 border-dashed p-4">
          <p className="font-ui font-extrabold text-[10px] tracking-[0.22em] uppercase text-green/60 mb-3">Add Option</p>
          <form
            action={createOptionForGroup}
            className="grid grid-cols-1 md:grid-cols-[1fr_1fr_80px_80px_auto] gap-3 items-end"
          >
            <Field label="Label (EN)" name="label_en" required placeholder="e.g. Fries" />
            <Field label="Label (TR)" name="label_tr" required placeholder="e.g. Patates" />
            <Field label="Price (₺)" name="price" type="number" defaultValue={0} min="0" step="1" />
            <Field label="Order" name="sort_order" type="number" defaultValue={options.length} />
            <div className="flex items-end">
              <PrimaryButton>+ Add</PrimaryButton>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
