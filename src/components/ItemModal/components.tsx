"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import type { ItemModalProps, AddonOption } from "./types";

export function ItemModal({
  item,
  onClose,
  onAdd,
  onSuggestedClick,
  spicyLabel,
  priceLabel,
  addToOrderLabel,
  specialInstructionsLabel,
  specialInstructionsPlaceholder,
  addonGroups = [],
  suggestedItems = [],
  alsoTryLabel = "Also try this",
}: ItemModalProps) {
  const isOpen = item !== null;
  const topBg = item?.fill === "orange-fill" ? "#e35d07" : "#395748";

  const [showStamp, setShowStamp] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [itemNote, setItemNote] = useState("");
  const [atBottom, setAtBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset selections, note, and scroll state whenever a new item opens
  useEffect(() => {
    setSelected({});
    setItemNote("");
    setAtBottom(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [item?.id]);

  // Track whether the scrollable content is fully scrolled to the bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function check() {
      setAtBottom(el!.scrollHeight - el!.scrollTop <= el!.clientHeight + 4);
    }
    check();
    el.addEventListener("scroll", check, { passive: true });
    return () => el.removeEventListener("scroll", check);
  }, [item?.id]);

  useEffect(() => {
    if (!item?.sold_out) { setShowStamp(false); return; }
    setShowStamp(false);
    const t = setTimeout(() => setShowStamp(true), 300);
    return () => clearTimeout(t);
  }, [item?.id, item?.sold_out]);

  const selectedExtras = useMemo<AddonOption[]>(() => {
    return addonGroups.flatMap((g) =>
      g.options.filter((o) => selected[o.id])
    );
  }, [addonGroups, selected]);

  const extrasTotal = selectedExtras.reduce((s, o) => s + o.price, 0);

  const toggleAddon = (groupIndex: number, option: AddonOption, multi: boolean) => {
    setSelected((prev) => {
      if (multi) {
        return { ...prev, [option.id]: !prev[option.id] };
      }
      // single-select: deselect all options in this group first
      const groupOptionIds = addonGroups[groupIndex].options.map((o) => o.id);
      const next = { ...prev };
      groupOptionIds.forEach((id) => { next[id] = false; });
      next[option.id] = !prev[option.id];
      return next;
    });
  };

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    if ((scrollRef.current?.scrollTop ?? 0) > 0) {
      dragStartY.current = null;
      return;
    }
    dragStartY.current = e.touches[0].clientY;
    dragCurrentY.current = 0;
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta < 0) return;
    dragCurrentY.current = delta;
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${delta}px)`;
  };

  const onTouchEnd = () => {
    if (dragStartY.current === null) return;
    dragStartY.current = null;
    if (dragCurrentY.current > 80) {
      onClose();
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = "transform 0.25s cubic-bezier(0.2,0.8,0.2,1)";
        sheetRef.current.style.transform = "translateY(0)";
      }
    }
    dragCurrentY.current = 0;
  };

  return (
    <div
      className={[
        "absolute inset-x-0 top-0 bottom-8 bg-[rgba(31,46,38,0.78)] items-end justify-center z-[1000]",
        isOpen ? "flex" : "hidden",
      ].join(" ")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {item && (
        <div
          ref={sheetRef}
          className="w-full bg-bg flex flex-col relative max-h-[90dvh]"
          style={{
            animation: "slideUp 0.25s cubic-bezier(0.2,0.8,0.2,1)",
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="relative flex flex-col shrink-0 overflow-hidden" style={{ background: topBg }}>
            {/* drag handle */}
            <div className="flex justify-center items-center h-4">
              <div className={["w-10 h-[3px] rounded-full", item.fill === "orange-fill" ? "bg-green" : "bg-orange"].join(" ")} />
            </div>
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt="" className="w-full h-52 object-cover" />
            ) : (
              <span className="text-[96px] leading-none p-4.5 text-center">{item.emoji}</span>
            )}
            {showStamp && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div style={{ animation: "stampSlam 0.4s cubic-bezier(0.15,0.8,0.2,1) both" }}>
                  <div style={{ border: "5px solid #CC2222", padding: "5px" }}>
                    <div style={{ border: "2.5px solid #CC2222", padding: "8px 18px" }}>
                      <span
                        style={{
                          color: "#CC2222",
                          fontFamily: "var(--font-bowlby, Impact, sans-serif)",
                          fontSize: "36px",
                          fontWeight: 900,
                          letterSpacing: "0.2em",
                          textTransform: "uppercase",
                          lineHeight: 1,
                          display: "block",
                        }}
                      >
                        SOLD OUT
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={["absolute top-2 right-2 border-0 w-[34px] h-[34px] font-bowlby text-[18px] cursor-pointer z-5 grid place-items-center", item.fill === "orange-fill" ? "bg-green text-white" : "bg-orange text-white"].join(" ")}
          >
            ×
          </button>
          <div ref={scrollRef} className="px-4.5 pt-4 pb-4.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="font-extrabold text-[9px] tracking-[0.28em] text-orange uppercase mb-1.5">
              {item.cat}{item.spicy ? ` · 🌶 ${spicyLabel}` : ""}
            </div>
            <div className="font-bowlby text-[30px] leading-[0.92] text-green uppercase tracking-[-0.8px] mb-2.5">
              {item.name}
            </div>
            {item.hook && (
              <div className="font-bold text-[11px] tracking-[0.18em] text-green uppercase opacity-85 mb-2">
                {item.hook}
              </div>
            )}
            {item.desc && (
              <div className="text-[12px] leading-relaxed text-green/80 mb-3.5">
                {item.desc}
              </div>
            )}

            {/* Add-on groups */}
            {addonGroups.length > 0 && (
              <div className="flex flex-col gap-3 mb-3.5">
                {addonGroups.map((group, gi) => (
                  <div key={gi}>
                    <div className="font-extrabold text-[9px] tracking-[0.22em] text-green uppercase mb-2">
                      {group.label}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {group.options.map((opt) => {
                        const active = !!selected[opt.id];
                        const hasMedia = !!(opt.image_url || opt.emoji);
                        return hasMedia ? (
                          /* image / emoji card */
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleAddon(gi, opt, group.multi)}
                            className={[
                              "flex flex-col shrink-0 w-20 border-2 cursor-pointer transition-colors overflow-hidden",
                              active ? "border-green" : "border-green/30",
                            ].join(" ")}
                          >
                            <div className="w-full h-16 flex items-center justify-center bg-bg-deep">
                              {opt.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={opt.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[28px] leading-none">{opt.emoji}</span>
                              )}
                            </div>
                            <div className={["px-1 py-1.5 text-center flex-1", active ? "bg-green" : "bg-transparent"].join(" ")}>
                              <div className={["font-ui font-extrabold text-[9px] tracking-wide uppercase leading-tight", active ? "text-bg" : "text-green"].join(" ")}>
                                {opt.label}
                              </div>
                              {opt.price > 0 && (
                                <div className={["font-bowlby text-[11px] leading-tight mt-0.5", active ? "text-bg/80" : "text-orange"].join(" ")}>
                                  +{opt.price}₺
                                </div>
                              )}
                            </div>
                          </button>
                        ) : (
                          /* text pill — no media linked */
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleAddon(gi, opt, group.multi)}
                            className={[
                              "shrink-0 border-2 cursor-pointer transition-colors px-3 py-2 flex flex-col items-center justify-center gap-0.5",
                              active ? "border-green bg-green" : "border-green/30 bg-transparent",
                            ].join(" ")}
                          >
                            <span className={["font-ui font-extrabold text-[10px] tracking-wide uppercase whitespace-nowrap", active ? "text-bg" : "text-green"].join(" ")}>
                              {opt.label}
                            </span>
                            {opt.price > 0 && (
                              <span className={["font-bowlby text-[11px]", active ? "text-bg/80" : "text-orange"].join(" ")}>
                                +{opt.price}₺
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Special instructions */}
            <div className="mb-3.5">
              <div className="font-extrabold text-[9px] tracking-[0.22em] text-green uppercase mb-1.5">
                {specialInstructionsLabel}
              </div>
              <textarea
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value.slice(0, 120))}
                placeholder={specialInstructionsPlaceholder}
                rows={2}
                className="w-full font-ui text-[12px] text-green bg-transparent border border-green/30 focus:border-orange outline-none resize-none px-2.5 py-2 placeholder:text-green/40"
              />
            </div>

            {/* Suggested items — "Also try this" */}
            {suggestedItems.length > 0 && (
              <div className="mb-3.5">
                <div className="font-extrabold text-[9px] tracking-[0.22em] text-green uppercase mb-2">
                  {alsoTryLabel}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {suggestedItems.map((sug) => (
                    <button
                      key={sug.id}
                      type="button"
                      onClick={() => { onClose(); onSuggestedClick(sug); }}
                      className="flex flex-col shrink-0 w-20 border-2 border-green/30 cursor-pointer transition-colors overflow-hidden hover:border-green"
                    >
                      <div className="w-full h-16 flex items-center justify-center bg-bg-deep">
                        {sug.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={sug.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[28px] leading-none">{sug.emoji}</span>
                        )}
                      </div>
                      <div className="px-1 py-1.5 text-center flex-1">
                        <div className="font-ui font-extrabold text-[9px] tracking-wide uppercase leading-tight text-green">
                          {sug.name}
                        </div>
                        <div className="font-bowlby text-[11px] leading-tight mt-0.5 text-orange">
                          {sug.price}₺
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center py-2.5 border-t-2 border-b-2 border-green mb-3.5">
              <span className="font-extrabold text-[9px] tracking-[0.28em] text-green uppercase">{priceLabel}</span>
              {item.discountPct ? (
                <div className="flex items-baseline gap-2">
                  <span className="font-ui font-extrabold text-[14px] text-green/40 line-through">{item.price} ₺</span>
                  <span className="font-bowlby text-[24px] text-orange">{Math.round(item.price * (1 - item.discountPct / 100)) + extrasTotal} ₺</span>
                </div>
              ) : (
                <span className="font-bowlby text-[24px] text-orange">{item.price + extrasTotal} ₺</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onAdd(selectedExtras, itemNote.trim())}
              className="w-full bg-orange text-white border-0 py-3.5 font-bowlby text-[16px] tracking-[1.5px] uppercase cursor-pointer"
            >
              {addToOrderLabel}
            </button>
          </div>

          {/* Scroll-down hint */}
          <div
            className="absolute bottom-0 left-0 right-0 flex justify-center pb-2 pt-6 pointer-events-none transition-opacity duration-300"
            style={{
              opacity: atBottom ? 0 : 1,
              background: "linear-gradient(to bottom, transparent, rgba(242,238,229,0.92))",
            }}
          >
            <svg
              width="20" height="20" viewBox="0 0 20 20" fill="none"
              className="text-green animate-bounce"
            >
              <path d="M3 6L10 14L17 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter"/>
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
