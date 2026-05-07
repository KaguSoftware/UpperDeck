"use client";

import { useState } from "react";
import { PrimaryButton } from "../../../_components";

type MenuItem = { id: string; name_en: string; image_url: string | null; emoji: string };

type Props = {
  groupId: string;
  menuItems: MenuItem[];
  defaultSortOrder?: number;
  createAction: (formData: FormData) => Promise<void>;
};

export function SuggestedItemForm({ groupId, menuItems, defaultSortOrder = 0, createAction }: Props) {
  const [pickedId, setPickedId] = useState("");
  const [sortOrder, setSortOrder] = useState(defaultSortOrder);

  const picked = menuItems.find((m) => m.id === pickedId) ?? null;

  async function wrapped(formData: FormData) {
    await createAction(formData);
    setPickedId("");
    setSortOrder((s) => s + 1);
  }

  return (
    <form action={wrapped} className="flex flex-col gap-3">
      <input type="hidden" name="sort_order" value={sortOrder} />

      <div className="flex flex-col gap-1">
        <span className="font-ui font-extrabold text-[9px] tracking-[0.22em] uppercase text-green/60">
          Menü Ürünü Seç
        </span>
        <div className="flex gap-2 items-center">
          {picked && (
            <div className="w-10 h-10 shrink-0 bg-bg-deep flex items-center justify-center overflow-hidden border border-green/20">
              {picked.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={picked.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[16px]">{picked.emoji}</span>
              )}
            </div>
          )}
          <select
            name="menu_item_id"
            required
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
            className="flex-1 h-10 border-2 border-green/40 bg-white font-ui text-[12px] text-green px-2 focus:border-orange outline-none"
          >
            <option value="">— ürün seç —</option>
            {menuItems.map((m) => (
              <option key={m.id} value={m.id}>
                {m.emoji} {m.name_en}
              </option>
            ))}
          </select>
          <div className="flex items-end">
            <PrimaryButton>+ Ekle</PrimaryButton>
          </div>
        </div>
      </div>
    </form>
  );
}
