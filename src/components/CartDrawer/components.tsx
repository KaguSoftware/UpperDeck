"use client";

import { useRef } from "react";
import { CouponSection } from "./CouponSection";
import { Loader } from "@/components/Loader/components";
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
    tableNumber,
    note,
    totalLabel,
    subtotalLabel,
    emptyLabel,
    tableLabel,
    tableFromQrLabel,
    notePlaceholder,
    callWaiterLabel,
    callWaiterSendingLabel,
    callWaiterHeadedLabel,
    onCallWaiter,
    waiterCooldownSeconds,
    waiterCooldownLabel,
    submitting = false,
    tableFromQr = false,
    topOffset = 0,
    coupon,
}: CartDrawerProps) {
    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const waiterCalled = waiterCooldownSeconds > 0;

    const dragY = useRef(0);
    const startY = useRef<number | null>(null);
    const sheetRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    function onTouchStart(e: React.TouchEvent) {
        const scrolledDown = (scrollRef.current?.scrollTop ?? 0) > 0;
        const touchInHeader = headerRef.current?.contains(e.target as Node) ?? false;
        if (scrolledDown && !touchInHeader) {
            startY.current = null;
            return;
        }
        startY.current = e.touches[0].clientY;
        dragY.current = 0;
        if (sheetRef.current) sheetRef.current.style.transition = "none";
    }
    function onTouchMove(e: React.TouchEvent) {
        if (startY.current === null) return;
        const delta = Math.max(0, e.touches[0].clientY - startY.current);
        dragY.current = delta;
        if (sheetRef.current) sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
    function onTouchEnd() {
        if (startY.current === null) return;
        startY.current = null;
        if (dragY.current > 80) {
            if (sheetRef.current) {
                sheetRef.current.style.transition = "transform 0.25s cubic-bezier(0.2,0.8,0.2,1)";
                sheetRef.current.style.transform = "";
            }
            onClose();
        } else {
            if (sheetRef.current) {
                sheetRef.current.style.transition = "transform 0.25s cubic-bezier(0.2,0.8,0.2,1)";
                sheetRef.current.style.transform = "translateY(0)";
            }
        }
        dragY.current = 0;
    }

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
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        >
            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label={totalLabel}
                className="relative w-full bg-bg border-t-4 border-green animate-[slideUp_0.25s_cubic-bezier(0.2,0.8,0.2,1)] max-h-full flex flex-col"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {/* drag handle + header — always draggable */}
                <div ref={headerRef}>
                    <div className="flex justify-center items-center w-full bg-green py-2.5 shrink-0 cursor-grab active:cursor-grabbing">
                        <div className="w-10 h-0.75 rounded-full bg-orange" />
                    </div>
                    {/* header */}
                    <div className="flex items-center justify-between px-4.5 py-3 border-b-2 border-green shrink-0">
                    <span className="font-bowlby text-[20px] text-green uppercase tracking-[-0.5px]">
                        {totalLabel}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="bg-orange text-white border-0 w-8.5 h-8.5 font-bowlby text-[18px] cursor-pointer grid place-items-center"
                    >
                        ×
                    </button>
                </div>
                </div>{/* /headerRef */}

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

                {/* list + note — all in one scrollable area */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto">
                    {items.length === 0 ? (
                        <p className="px-4.5 py-6 text-green/60 font-ui text-[13px]">
                            {emptyLabel}
                        </p>
                    ) : (
                        items.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center gap-2 px-4.5 py-3 border-b border-green/20"
                            >
                                {/* name + extras + note */}
                                <div className="flex-1 min-w-0">
                                    <span className="font-ui font-semibold text-[13px] text-green wrap-break-word">
                                        {item.name}
                                    </span>
                                    {item.extras && item.extras.length > 0 && (
                                        <div className="flex flex-col gap-0.5 mt-0.5">
                                            {item.extras.map((ex) => (
                                                <span key={ex.id} className="font-ui text-[10px] text-green/60">
                                                    {ex.required ? `${ex.groupLabel}: ${ex.label}` : `+ ${ex.label}`}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {item.itemNote && (
                                        <span className="font-ui text-[10px] text-orange/80 italic mt-0.5 block">
                                            {item.itemNote}
                                        </span>
                                    )}
                                </div>
                                {/* qty controls + price + remove */}
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => onDecrement(item.id)}
                                        aria-label="Decrease quantity"
                                        className="border-0 bg-transparent text-green/60 hover:text-orange cursor-pointer font-bowlby text-[18px] leading-none w-8 h-8 grid place-items-center"
                                    >
                                        −
                                    </button>
                                    <span className="font-bowlby text-[13px] bg-green text-bg w-6 h-6 grid place-items-center shrink-0">
                                        {item.qty}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onIncrement(item.id)}
                                        aria-label="Increase quantity"
                                        className="border-0 bg-transparent text-green/60 hover:text-orange cursor-pointer font-bowlby text-[18px] leading-none w-8 h-8 grid place-items-center"
                                    >
                                        +
                                    </button>
                                    <span className="font-bowlby text-[18px] text-orange ml-1 w-8 text-right shrink-0">
                                        {(item.price * item.qty).toLocaleString()} ₺
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onRemove(item.id)}
                                        aria-label="Remove item"
                                        className="text-green/40 hover:text-orange border-0 bg-transparent cursor-pointer font-bowlby text-[16px] leading-none w-8 h-8 grid place-items-center"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                        ))
                    )}

                    {/* note — inside scroll, after the items */}
                    <div className="px-4.5 py-3 border-t border-green/20">
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
                </div>

                {submitting && (
                    <div className="absolute inset-0 bg-bg/80 z-10 grid place-items-center pointer-events-none">
                        <Loader size="md" label={callWaiterSendingLabel} />
                    </div>
                )}

                {/* subtotal + call waiter */}
                {items.length > 0 && (
                    <div className="shrink-0 border-t-2 border-green">
                        <div className="flex items-center justify-between px-4.5 py-1">
                            <span className="font-extrabold text-[9px] tracking-[0.28em] text-green uppercase">
                                {subtotalLabel}
                            </span>
                            <span className="font-bowlby text-[24px] text-orange">
                                {total.toLocaleString()} ₺
                            </span>
                        </div>
                        <CouponSection {...coupon} />
                        <div className="px-4.5 pb-4 flex flex-col gap-2">
                            {waiterCalled ? (
                                <div className="w-full bg-green text-bg font-ui font-extrabold text-[13px] tracking-widest uppercase py-3 text-center">
                                    {callWaiterHeadedLabel}
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={onCallWaiter}
                                    disabled={items.length === 0 || submitting}
                                    className="w-full bg-orange text-white font-ui font-extrabold text-[13px] tracking-widest uppercase py-3 border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader size="xs" tone="onDark" />
                                            <span>{callWaiterSendingLabel}</span>
                                        </>
                                    ) : (
                                        callWaiterLabel
                                    )}
                                </button>
                            )}
                            {waiterCalled && (
                                <p className="text-center font-ui text-[11px] text-green/60">
                                    {waiterCooldownLabel}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
