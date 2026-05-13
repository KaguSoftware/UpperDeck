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

type Props =
  | {
      opt: Opt;
      groupId: string;
      menuItems: MenuItem[];
      updateAction: (formData: FormData) => Promise<void>;
      createRevealedGroupAction: (formData: FormData) => Promise<void>;
      createAction?: never;
      defaultSortOrder?: never;
    }
  | {
      opt?: never;
      groupId: string;
      menuItems: MenuItem[];
      createAction: (formData: FormData) => Promise<void>;
      createRevealedGroupAction?: never;
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

export function AddonOptionForm({ opt, groupId, menuItems, updateAction, createRevealedGroupAction, createAction, defaultSortOrder = 0 }: Props) {
  const isEdit = !!opt;
  const [pickedId, setPickedId] = useState(opt?.menu_item_id ?? "");
  const [labelEn, setLabelEn] = useState(opt?.label_en ?? "");
  const [labelTr, setLabelTr] = useState(opt?.label_tr ?? "");
  const [price, setPrice] = useState<number>(opt?.price ?? 0);
  const [sortOrder, setSortOrder] = useState(isEdit ? opt!.sort_order : defaultSortOrder);
  const [showNewSubGroup, setShowNewSubGroup] = useState(false);

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
  }

  const action = isEdit ? updateAction! : wrappedCreate;

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3">
        {isEdit && <input type="hidden" name="group_id" value={groupId} />}
        <input type="hidden" name="menu_item_id" value={pickedId} />
        <input type="hidden" name="sort_order" value={sortOrder} />

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
      </form>

      {/* Sub-group creation — only available on existing options */}
      {isEdit && createRevealedGroupAction && (
        <div className="mt-1">
          {!showNewSubGroup ? (
            <button
              type="button"
              onClick={() => setShowNewSubGroup(true)}
              className="font-ui font-extrabold text-[9px] tracking-[0.22em] uppercase text-orange/80 hover:text-orange transition-colors"
            >
              + Özel alt grup ekle
            </button>
          ) : (
            <div className="border-l-2 border-orange/40 pl-3 mt-2">
              <p className="font-ui font-extrabold text-[9px] tracking-[0.22em] uppercase text-orange/70 mb-2">
                Yeni alt grup — yalnızca bu seçeneğe özel
              </p>
              <form
                action={async (fd) => {
                  await createRevealedGroupAction(fd);
                  setShowNewSubGroup(false);
                }}
                className="flex flex-col gap-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">Etiket (İNG)</span>
                    <input name="label_en" required className="border-2 border-green bg-bg px-3 py-2 font-ui text-[13px] text-ink focus:outline-none focus:bg-white" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">Etiket (TR)</span>
                    <input name="label_tr" required className="border-2 border-green bg-bg px-3 py-2 font-ui text-[13px] text-ink focus:outline-none focus:bg-white" />
                  </label>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="multi" className="accent-orange w-4 h-4" />
                    <span className="font-ui font-extrabold text-[10px] uppercase tracking-[0.18em] text-green">Çoklu seçim</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="required" className="accent-orange w-4 h-4" />
                    <span className="font-ui font-extrabold text-[10px] uppercase tracking-[0.18em] text-green">Zorunlu</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <PrimaryButton>Grubu Oluştur</PrimaryButton>
                  <button
                    type="button"
                    onClick={() => setShowNewSubGroup(false)}
                    className="font-ui font-extrabold text-[10px] uppercase tracking-[0.18em] text-green/50 hover:text-green transition-colors"
                  >
                    İptal
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
