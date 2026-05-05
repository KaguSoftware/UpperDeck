import { OfflineFallback } from "./_offline-fallback";
import type { CartDrawerProps } from "./types";

export function CartDrawer({
    items,
    isOpen,
    onClose,
    onRemove,
    onIncrement,
    onDecrement,
    onTableChange,
    onNoteChange,
    onCheckout,
    onRetry,
    tableNumber,
    note,
    checkoutState,
    totalLabel,
    subtotalLabel,
    emptyLabel,
    tableLabel,
    tableFromQrLabel,
    notePlaceholder,
    sendLabel,
    tryAgainLabel,
    tableFromQr = false,
    simulateFailure = false,
    onSimulateFailureChange,
    topOffset = 0,
    orderCooldownSeconds = 0,
}: CartDrawerProps) {
    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const isPending = checkoutState.status === "pending";
    const isOffline = checkoutState.status === "offline";
    const isValidationError = checkoutState.status === "validation";
    const canSend = items.length > 0 && !isPending && orderCooldownSeconds === 0;

    return (
        <div
            className={[
                "fixed inset-x-0 bottom-0 bg-[rgba(31,46,38,0.78)] z-99999",
                isOpen ? "flex items-end justify-center" : "hidden",
            ].join(" ")}
            style={{ top: topOffset }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="w-full bg-bg border-t-4 border-green animate-[slideUp_0.25s_cubic-bezier(0.2,0.8,0.2,1)] max-h-full flex flex-col">
                {/* header */}
                <div className="flex items-center justify-between px-4.5 py-3 border-b-2 border-green shrink-0">
                    <span className="font-bowlby text-[20px] text-green uppercase tracking-[-0.5px]">
                        {totalLabel}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="bg-orange text-white border-0 w-8.5 h-8.5 font-bowlby text-[18px] cursor-pointer grid place-items-center"
                    >
                        ×
                    </button>
                </div>

                {/* table number — only shown when set via QR */}
                {tableNumber !== null && tableNumber > 0 && (
                    <div className="shrink-0 flex items-center gap-3 px-4.5 py-3 border-b border-green/20">
                        <label className="font-extrabold text-[9px] tracking-[0.28em] text-green uppercase whitespace-nowrap">
                            {tableLabel}
                        </label>
                        <div className="flex items-center gap-2">
                            <span className="font-bowlby text-[16px] text-orange">
                                {tableNumber}
                            </span>
                            <span className="font-ui text-[10px] bg-green text-bg px-1.5 py-0.5 uppercase tracking-widest">
                                {tableFromQrLabel}
                            </span>
                        </div>
                    </div>
                )}

                {/* validation error banner */}
                {isValidationError && (
                    <div className="shrink-0 px-4.5 py-2.5 bg-orange/10 border-b border-orange/30">
                        <p className="font-ui text-[12px] text-orange">
                            {checkoutState.message}
                        </p>
                    </div>
                )}

                {/* offline fallback — shown above list when network/server error */}
                {isOffline && (
                    <OfflineFallback
                        tableNumber={tableNumber}
                        items={items}
                        note={note}
                        onRetry={onRetry}
                        retryLabel={tryAgainLabel}
                    />
                )}

                {/* list */}
                <div className="flex-1 overflow-y-auto">
                    {items.length === 0 ? (
                        <p className="px-4.5 py-6 text-green/60 font-ui text-[13px]">
                            {emptyLabel}
                        </p>
                    ) : (
                        items.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between px-4.5 py-3 border-b border-green/20"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => onDecrement(item.id)}
                                            className="border-0 bg-transparent text-green/60 hover:text-orange cursor-pointer font-bowlby text-[18px] leading-none w-5 grid place-items-center"
                                        >
                                            −
                                        </button>
                                        <span className="font-bowlby text-[13px] bg-green text-bg w-6 h-6 grid place-items-center shrink-0">
                                            {item.qty}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onIncrement(item.id)}
                                            className="border-0 bg-transparent text-green/60 hover:text-orange cursor-pointer font-bowlby text-[18px] leading-none w-5 grid place-items-center"
                                        >
                                            +
                                        </button>
                                    </div>
                                    <div>
                                        <span className="font-ui font-semibold text-[13px] text-green">
                                            {item.name}
                                        </span>
                                        {item.extras && item.extras.length > 0 && (
                                            <div className="flex flex-col gap-0.5 mt-0.5">
                                                {item.extras.map((ex) => (
                                                    <span key={ex.id} className="font-ui text-[10px] text-green/60">
                                                        + {ex.label}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-bowlby text-[13px] text-orange">
                                        {(
                                            item.price * item.qty
                                        ).toLocaleString()}{" "}
                                        ₺
                                    </span>
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

                {/* note */}
                <div className="shrink-0 px-4.5 py-3 border-t border-green/20">
                    <div className="relative">
                        <textarea
                            value={note}
                            onChange={(e) =>
                                onNoteChange(e.target.value.slice(0, 200))
                            }
                            placeholder={notePlaceholder}
                            rows={2}
                            className="w-full font-ui text-[12px] text-green bg-transparent border border-green/30 focus:border-orange outline-none resize-none px-2.5 py-2 placeholder:text-green/40"
                        />
                        <span className="absolute bottom-2.5 right-2.5 font-ui text-[10px] text-green/30">
                            {note.length}/200
                        </span>
                    </div>
                </div>

                {/* subtotal + send */}
                {items.length > 0 && (
                    <div className="shrink-0 border-t-2 border-green">
                        <div className="flex items-center justify-between px-4.5 py-2.5">
                            <span className="font-extrabold text-[9px] tracking-[0.28em] text-green uppercase">
                                {subtotalLabel}
                            </span>
                            <span className="font-bowlby text-[24px] text-orange">
                                {total.toLocaleString()} ₺
                            </span>
                        </div>
                        <div className="px-4.5 pb-4">
                            <button
                                type="button"
                                onClick={onCheckout}
                                disabled={!canSend}
                                className="w-full bg-orange text-white font-ui font-extrabold text-[13px] tracking-widest uppercase py-3 border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isPending ? "…" : orderCooldownSeconds > 0 ? `${orderCooldownSeconds}s` : sendLabel}
                            </button>
                            {/* DEV ONLY — remove before showing to a real customer */}
                            {process.env.NODE_ENV === "development" &&
                                onSimulateFailureChange && (
                                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={simulateFailure}
                                            onChange={(e) =>
                                                onSimulateFailureChange(
                                                    e.target.checked
                                                )
                                            }
                                            className="w-3 h-3 accent-orange"
                                        />
                                        <span className="font-ui text-[10px] text-orange/70 tracking-widest uppercase">
                                            DEV: simulate failure
                                        </span>
                                    </label>
                                )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
