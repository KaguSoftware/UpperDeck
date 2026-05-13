"use client";

import { useState } from "react";
import { PrimaryButton } from "../../../_components";

type MenuItem = { id: string; name_en: string; image_url: string | null; emoji: string; price: number };

type Opt = {
  id: string;
  label_en: string;
  label_tr: string;
  price: number;
  sort_order: number;
  menu_item_id: string | null;
};

type AddonGroup = { id: string; label_en: string };

type Props =
  | {
      opt: Opt;
      groupId: string;
      menuItems: MenuItem[];
      allGroups: AddonGroup[];
      assignedRevealGroupIds: string[];
      updateAction: (formData: FormData) => Promise<void>;
      createAction?: never;
      defaultSortOrder?: never;
    }
  | {
      opt?: never;
      groupId: string;
      menuItems: MenuItem[];
      allGroups: AddonGroup[];
      assignedRevealGroupIds: string[];
      createAction: (formData: FormData) => Promise<void>;
      updateAction?: never;
      defaultSortOrder?: number;
    };

function FieldRaw({ label, name, value, onChange, type = "text", required, min, step }: {
  label: string; name: string; value: string | number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; required?: boolean; min?: string; step?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">{label}</span>
      <input
        name={name} type={type} required={required} min={min} step={step}
        value={value} onChange={onChange}
        className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
      />
    </label>
  );
}

export function AddonOptionForm({ opt, groupId, menuItems, allGroups, assignedRevealGroupIds, updateAction, createAction, defaultSortOrder = 0 }: Props) {
  const isEdit = !!opt;
  const [pickedId, setPickedId] = useState(opt?.menu_item_id ?? "");
  const [labelEn, setLabelEn] = useState(opt?.label_en ?? "");
  const [labelTr, setLabelTr] = useState(opt?.label_tr ?? "");
  const [price, setPrice] = useState<number>(opt?.price ?? 0);
  const [sortOrder, setSortOrder] = useState(isEdit ? opt!.sort_order : defaultSortOrder);
  const [revealIds, setRevealIds] = useState<Set<string>>(new Set(assignedRevealGroupIds));

  const toggleReveal = (gid: string) => {
    setRevealIds((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  };

  const picked = menuItems.find((m) => m.id === pickedId) ?? null;

  function handlePick(id: string) {
    setPickedId(id);
    if (!id) return;
    const item = menuItems.find((m) => m.id === id);
    if (!item) return;
    setLabelEn(item.name_en);
    setLabelTr(item.name_en);
    setPrice(item.price);
  }

  async function wrappedCreate(formData: FormData) {
    await createAction!(formData);
    setPickedId("");
    setLabelEn("");
    setLabelTr("");
    setPrice(0);
    setSortOrder((s) => s + 1);
    setRevealIds(new Set());
  }

  const action = isEdit ? updateAction! : wrappedCreate;

  return (
    <form action={action} className="flex flex-col gap-3">
      {isEdit && <input type="hidden" name="group_id" value={groupId} />}
      <input type="hidden" name="menu_item_id" value={pickedId} />
      <input type="hidden" name="sort_order" value={sortOrder} />
      {Array.from(revealIds).map((gid) => (
        <input key={gid} type="hidden" name="reveal_group_ids[]" value={gid} />
      ))}

      {/* picker row — only shown in create mode */}
      {!isEdit && (
        <div className="flex flex-col gap-1">
          <span className="font-ui font-extrabold text-[9px] tracking-[0.22em] uppercase text-green/60">
            Menü Ürününden Seç (etiket ve fiyatı otomatik doldurur)
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
              value={pickedId}
              onChange={(e) => handlePick(e.target.value)}
              className="flex-1 h-10 border-2 border-green/40 bg-white font-ui text-[12px] text-green px-2 focus:border-orange outline-none"
            >
              <option value="">— manuel giriş —</option>
              {menuItems.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.emoji} {m.name_en} ({m.price}₺)
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* fields row */}
      <div className="grid grid-cols-[1fr_1fr_100px_auto] gap-3 items-end">
        <FieldRaw label="Etiket (İNG)" name="label_en" required value={labelEn} onChange={(e) => setLabelEn(e.target.value)} />
        <FieldRaw label="Etiket (TR)" name="label_tr" required value={labelTr} onChange={(e) => setLabelTr(e.target.value)} />
        <FieldRaw label="Fiyat (₺)" name="price" type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} min="0" step="1" />
        <div className="flex items-end">
          <PrimaryButton>{isEdit ? "Kaydet" : "+ Ekle"}</PrimaryButton>
        </div>
      </div>

      {/* Reveal groups — shown when this option is selected */}
      {allGroups.length > 0 && (
        <div>
          <span className="font-ui font-extrabold text-[9px] tracking-[0.22em] uppercase text-green/60">
            Bu seçenek seçilince gösterilecek gruplar
          </span>
          <div className="mt-1.5 border border-green/20 divide-y divide-green/10 max-h-36 overflow-y-auto">
            {allGroups.map((g) => (
              <label key={g.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-bg-deep transition-colors">
                <input
                  type="checkbox"
                  checked={revealIds.has(g.id)}
                  onChange={() => toggleReveal(g.id)}
                  className="accent-orange w-3.5 h-3.5 shrink-0"
                />
                <span className="font-ui text-[11px] text-green">{g.label_en}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
