"use client";

import { useState } from "react";

type Props = {
  allItems: { id: string; name_en: string }[];
  assignedItemIds: string[];
};

export function EditGroupItemsForm({ allItems, assignedItemIds }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedItemIds));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name="menu_item_ids[]" value={id} />
      ))}
      <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green mb-2">
        Menü Ürünleri <span className="text-green/50 font-normal normal-case tracking-normal">({selected.size} seçildi)</span>
      </div>
      <div className="border-2 border-green/30 max-h-48 overflow-y-auto divide-y divide-green/10">
        {allItems.map((item) => (
          <label key={item.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-bg-deep transition-colors">
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={() => toggle(item.id)}
              className="accent-orange w-4 h-4 shrink-0"
            />
            <span className="font-ui text-[12px] text-green">{item.name_en}</span>
          </label>
        ))}
      </div>
    </>
  );
}
