"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Field, Select, PrimaryButton, GhostButton } from "../../_components";
import { createGroup } from "../actions";

type Props = {
  categories: { id: string; name_en: string }[];
  items: { id: string; name_en: string }[];
  defaultSortOrder: number;
};

export function NewSuggestedGroupForm({ categories, items, defaultSortOrder }: Props) {
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
        <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green mb-2">Kapsam</div>
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
                {s === "category" ? "Kategori" : "Menü Ürünü"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {scope === "category" ? (
        <div className="md:col-span-2">
          <Select
            label="Kategori"
            name="category_id"
            defaultValue={preCategoryId || categories[0]?.id}
            options={categories.map((c) => ({ value: c.id, label: c.name_en }))}
          />
        </div>
      ) : (
        <div className="md:col-span-2">
          <Select
            label="Menü Ürünü"
            name="menu_item_id"
            defaultValue={preItemId || items[0]?.id}
            options={items.map((i) => ({ value: i.id, label: i.name_en }))}
          />
        </div>
      )}

      <Field label="Etiket (İNG)" name="label_en" required placeholder="örn. Bunu da dene" />
      <Field label="Etiket (TR)" name="label_tr" required placeholder="örn. Bunu da dene" />
      <Field label="Sıralama" name="sort_order" type="number" defaultValue={defaultSortOrder} />

      <div className="md:col-span-2 flex gap-3 pt-2 border-t-2 border-green/20">
        <PrimaryButton>Kaydet ve Ürün Ekle</PrimaryButton>
        <GhostButton href="/admin/suggested">İptal</GhostButton>
      </div>
    </form>
  );
}
