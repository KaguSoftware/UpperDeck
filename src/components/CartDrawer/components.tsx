import type { CartDrawerProps } from "./types";

export function CartDrawer({ items, isOpen, onClose, onRemove, totalLabel, emptyLabel }: CartDrawerProps) {
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <div
      className={[
        "absolute inset-x-0 top-0 bottom-0 bg-[rgba(31,46,38,0.78)] z-99999",
        isOpen ? "flex items-end justify-center" : "hidden",
      ].join(" ")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full bg-bg border-t-4 border-green animate-[slideUp_0.25s_cubic-bezier(0.2,0.8,0.2,1)] max-h-[70%] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-4.5 py-3 border-b-2 border-green shrink-0">
          <span className="font-bowlby text-[20px] text-green uppercase tracking-[-0.5px]">Your Order</span>
          <button
            type="button"
            onClick={onClose}
            className="bg-orange text-white border-0 w-[34px] h-[34px] font-bowlby text-[18px] cursor-pointer grid place-items-center"
          >
            ×
          </button>
        </div>

        {/* list */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4.5 py-6 text-green/60 font-ui text-[13px]">{emptyLabel}</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4.5 py-3 border-b border-green/20">
                <div className="flex items-center gap-3">
                  <span className="font-bowlby text-[13px] bg-green text-bg w-6 h-6 grid place-items-center shrink-0">
                    {item.qty}
                  </span>
                  <span className="font-ui font-semibold text-[13px] text-green">{item.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bowlby text-[13px] text-orange">{(item.price * item.qty).toLocaleString()} ₺</span>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="text-green/40 hover:text-orange border-0 bg-transparent cursor-pointer font-bowlby text-[16px] leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* total */}
        {items.length > 0 && (
          <div className="shrink-0 flex items-center justify-between px-4.5 py-3.5 border-t-2 border-green">
            <span className="font-extrabold text-[9px] tracking-[0.28em] text-green uppercase">{totalLabel}</span>
            <span className="font-bowlby text-[24px] text-orange">{total.toLocaleString()} ₺</span>
          </div>
        )}
      </div>
    </div>
  );
}
