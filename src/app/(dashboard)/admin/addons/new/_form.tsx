"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Field, Checkbox, Select, PrimaryButton, GhostButton } from "../../_components";
import { createGroup } from "../actions";

type Props = {
  categories: { id: string; name_en: string }[];
  items: { id: string; name_en: string }[];
};

export function NewAddonGroupForm({ categories, items }: Props) {
  const searchParams = useSearchParams();
  const preItemId = searchParams.get("item_id") ?? "";
  const preCategoryId = searchParams.get("category_id") ?? "";
  const defaultScope: "category" | "item" = preItemId ? "item" : "category";
  const [scope, setScope] = useState<"category" | "item">(defaultScope);

  return (
    <form
      action={createGroup}
      className="border-2 border-green bg-white p-6 grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl"
    >
      <input type="hidden" name="scope" value={scope} />

      <div className="md:col-span-2">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green mb-2">Scope</div>
        <div className="flex gap-6">
          {(["category", "item"] as const).map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="_scope_ui"
                value={s}
                checked={scope === s}
                onChange={() => setScope(s)}
                className="accent-orange w-4 h-4"
              />
              <span className="font-ui font-extrabold text-[11px] uppercase tracking-[0.18em] text-green">
                {s === "category" ? "Category" : "Menu Item"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {scope === "category" ? (
        <div className="md:col-span-2">
          <Select
            label="Category"
            name="category_id"
            defaultValue={preCategoryId || categories[0]?.id}
            options={categories.map((c) => ({ value: c.id, label: c.name_en }))}
          />
        </div>
      ) : (
        <div className="md:col-span-2">
          <Select
            label="Menu Item"
            name="menu_item_id"
            defaultValue={preItemId || items[0]?.id}
            options={items.map((i) => ({ value: i.id, label: i.name_en }))}
          />
        </div>
      )}

      <Field label="Label (EN)" name="label_en" required placeholder="e.g. Sides" />
      <Field label="Label (TR)" name="label_tr" required placeholder="e.g. Yanlar" />
      <Field label="Sort Order" name="sort_order" type="number" defaultValue={0} />

      <div className="flex items-center">
        <Checkbox label="Multi-select (allow several choices)" name="multi" defaultChecked={false} />
      </div>

      <div className="md:col-span-2 flex gap-3 pt-2 border-t-2 border-green/20">
        <PrimaryButton>Save &amp; Add Options</PrimaryButton>
        <GhostButton href="/admin/addons">Cancel</GhostButton>
      </div>
    </form>
  );
}
