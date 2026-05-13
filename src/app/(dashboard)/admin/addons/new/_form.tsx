"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Field, Checkbox, Select, PrimaryButton, GhostButton } from "../../_components";
import { createGroup } from "../actions";

type Props = {
  categories: { id: string; name_en: string }[];
  items: { id: string; name_en: string }[];
  defaultSortOrder: number;
};

export function NewAddonGroupForm({ categories, items, defaultSortOrder }: Props) {
  const searchParams = useSearchParams();
  const preItemId = searchParams.get("item_id") ?? "";
  const preCategoryId = searchParams.get("category_id") ?? "";
  const defaultScope: "category" | "item" = preItemId ? "item" : "category";
  const [scope, setScope] = useState<"category" | "item">(defaultScope);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(
    preItemId ? new Set([preItemId]) : new Set()
  );

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <form
      action={createGroup}
      className="border-2 border-green bg-white p-6 grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl"
    >
      <input type="hidden" name="scope" value={scope} />
      {/* submit selected item ids */}
      {Array.from(selectedItems).map((id) => (
        <input key={id} type="hidden" name="menu_item_ids[]" value={id} />
      ))}

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
                {s === "category" ? "Kategori" : "Menü Ürünleri"}
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
          <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green mb-2">
            Menü Ürünleri <span className="text-green/50 font-normal normal-case tracking-normal">({selectedItems.size} seçildi)</span>
          </div>
          <div className="border-2 border-green/30 max-h-48 overflow-y-auto divide-y divide-green/10">
            {items.map((item) => (
              <label key={item.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-bg-deep transition-colors">
                <input
                  type="checkbox"
                  checked={selectedItems.has(item.id)}
                  onChange={() => toggleItem(item.id)}
                  className="accent-orange w-4 h-4 shrink-0"
                />
                <span className="font-ui text-[12px] text-green">{item.name_en}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <Field label="Etiket (İNG)" name="label_en" required placeholder="örn. Yanlar" />
      <Field label="Etiket (TR)" name="label_tr" required placeholder="örn. Yanlar" />
      <Field label="Sıralama" name="sort_order" type="number" defaultValue={defaultSortOrder} />

      <div className="flex flex-col gap-3 justify-center">
        <Checkbox label="Çoklu seçim" name="multi" defaultChecked={false} />
        <Checkbox label="Zorunlu seçim" name="required" defaultChecked={false} />
      </div>

      <div className="md:col-span-2 flex gap-3 pt-2 border-t-2 border-green/20">
        <PrimaryButton>Kaydet ve Seçenek Ekle</PrimaryButton>
        <GhostButton href="/admin/addons">İptal</GhostButton>
      </div>
    </form>
  );
}
