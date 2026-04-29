"use client";

import type { CartItem } from "./types";

type OfflineFallbackProps = {
  tableNumber: number | null;
  items: CartItem[];
  note: string;
  onRetry: () => void;
  retryLabel: string;
};

export function OfflineFallback({ tableNumber, items, note, onRetry, retryLabel }: OfflineFallbackProps) {
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <div className="border-2 border-orange mx-4.5 my-3 p-4 flex flex-col gap-3">
      <p className="font-extrabold text-[9px] tracking-[0.28em] text-orange uppercase">
        Show this to a member of staff
      </p>

      {tableNumber !== null && (
        <div className="flex items-baseline gap-2">
          <span className="font-extrabold text-[9px] tracking-[0.28em] text-green uppercase">Table</span>
          <span className="font-bowlby text-[36px] text-orange leading-none">{tableNumber}</span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bowlby text-[12px] bg-green text-bg w-5 h-5 grid place-items-center shrink-0">
                {item.qty}
              </span>
              <span className="font-ui font-semibold text-[13px] text-green">{item.name}</span>
            </div>
            <span className="font-bowlby text-[13px] text-orange shrink-0">
              {(item.price * item.qty).toLocaleString()} ₺
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-green/20 pt-2">
        <span className="font-extrabold text-[9px] tracking-[0.28em] text-green uppercase">Total</span>
        <span className="font-bowlby text-[20px] text-orange">{total.toLocaleString()} ₺</span>
      </div>

      {note.trim() !== "" && (
        <p className="font-ui text-[12px] text-green border-t border-green/20 pt-2">{note}</p>
      )}

      <button
        type="button"
        onClick={onRetry}
        className="mt-1 w-full border-2 border-orange text-orange font-ui font-extrabold text-[12px] tracking-[0.1em] uppercase py-2 bg-transparent cursor-pointer"
      >
        {retryLabel}
      </button>
    </div>
  );
}
