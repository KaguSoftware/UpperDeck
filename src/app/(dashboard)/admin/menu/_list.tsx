"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deleteItem, toggleAvailability, toggleSoldOut } from "./actions";

type Item = {
  id: string;
  name_en: string;
  price: number;
  image_url: string | null;
  spicy: boolean;
  is_available: boolean;
  sold_out: boolean;
  sort_order: number | null;
  category_name: string;
};

export function MenuList({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleToggle(id: string, current: boolean) {
    const next = !current;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_available: next } : i)));
    startTransition(async () => {
      await toggleAvailability(id, next);
    });
  }

  function handleToggleSoldOut(id: string, current: boolean) {
    const next = !current;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, sold_out: next } : i)));
    startTransition(async () => {
      await toggleSoldOut(id, next);
    });
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    // Optimistically remove after a brief flash so user sees feedback
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setDeletingId(null);
    }, 200);

    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      await deleteItem(fd);
    });
  }

  return (
    <div className="border-2 border-green bg-white overflow-x-auto">
      <div className="min-w-xl">
        <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_6rem_5rem_8rem] gap-3 px-4 py-3 border-b-2 border-green bg-bg-deep text-[13px] font-extrabold uppercase tracking-[0.18em] text-green">
          <div></div>
          <div>Name</div>
          <div>Category</div>
          <div className="text-right">Price</div>
          <div className="text-center">Sold Out</div>
          <div></div>
        </div>
        {items.map((item) => (
          <div
            key={item.id}
            className={[
              "grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_6rem_5rem_8rem] gap-3 items-center px-4 py-3 border-b border-green/20 last:border-b-0 transition-all duration-200",
              deletingId === item.id ? "opacity-0 scale-95" : "opacity-100",
            ].join(" ")}
          >
            <div className="w-10 h-10 bg-bg-deep border border-green/20 overflow-hidden flex items-center justify-center shrink-0">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-green/20 text-[18px]">🍽</span>
              )}
            </div>
            <div>
              <div className="font-bowlby text-[20px] uppercase text-green leading-none">{item.name_en}</div>
              {item.spicy && (
                <div className="mt-1">
                  <span className="inline-block bg-orange text-white text-[8px] font-extrabold px-1.5 py-0.5 uppercase tracking-[0.15em]">
                    Spicy
                  </span>
                </div>
              )}
            </div>
            <div className="font-bowlby text-[20px] uppercase text-green/80 leading-none">{item.category_name}</div>
            <div className="text-right font-ui font-extrabold text-[16px] text-orange">
              {Number(item.price).toFixed(0)} ₺
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => handleToggleSoldOut(item.id, item.sold_out)}
                style={{
                  position: "relative",
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: item.sold_out ? "#CC2222" : "#ccc",
                  transition: "background-color 0.2s",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: item.sold_out ? 19 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    backgroundColor: "white",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <Link
                href={`/admin/menu/${item.id}/edit`}
                className="border-2 border-green text-green bg-transparent px-4 py-2 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                className="bg-green-dark text-bg border-0 px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase cursor-pointer"
              >
                Del
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="px-4 py-10 text-center text-[12px] text-green/60 font-semibold uppercase tracking-[0.18em]">
            No menu items yet
          </div>
        )}
      </div>
    </div>
  );
}
