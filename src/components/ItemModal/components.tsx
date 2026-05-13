"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import type { ItemModalProps, AddonOption } from "./types";

function HorizontalScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startX = 0, startY = 0, locked: boolean | null = null;
    const onStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      locked = null;
    };
    const onMove = (e: TouchEvent) => {
      if (locked === null) {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 6 || dy > 6) locked = dx > dy;
      }
      if (locked) e.preventDefault();
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMove); };
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLDivElement>(null);
  const scale = useRef(1);
  const lastScale = useRef(1);
  const origin = useRef({ x: 0, y: 0 });
  const translate = useRef({ x: 0, y: 0 });
  const lastTranslate = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef<number | null>(null);
  const lastTap = useRef(0);
  const dragStartY = useRef<number | null>(null);
  const dragY = useRef(0);

  const applyTransform = useCallback(() => {
    if (!imgRef.current) return;
    imgRef.current.style.transform = `translate(${translate.current.x}px, ${translate.current.y}px) scale(${scale.current})`;
  }, []);

  const resetTransform = useCallback(() => {
    scale.current = 1;
    translate.current = { x: 0, y: 0 };
    lastScale.current = 1;
    lastTranslate.current = { x: 0, y: 0 };
    applyTransform();
  }, [applyTransform]);

  function pinchDist(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function pinchMid(touches: React.TouchList) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      dragStartY.current = null;
      lastPinchDist.current = pinchDist(e.touches);
      origin.current = pinchMid(e.touches);
    } else if (e.touches.length === 1) {
      lastPinchDist.current = null;
      origin.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastTranslate.current = { ...translate.current };

      // double-tap to toggle zoom
      const now = Date.now();
      if (now - lastTap.current < 300) {
        if (scale.current > 1) {
          resetTransform();
        } else {
          scale.current = 2.5;
          translate.current = { x: 0, y: 0 };
          applyTransform();
        }
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;

      // only start drag-to-close when not zoomed
      if (scale.current <= 1) {
        dragStartY.current = e.touches[0].clientY;
        dragY.current = 0;
        if (wrapperRef.current) wrapperRef.current.style.transition = "none";
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && lastPinchDist.current !== null) {
      const dist = pinchDist(e.touches);
      const delta = dist / lastPinchDist.current;
      scale.current = Math.min(Math.max(lastScale.current * delta, 1), 5);
      applyTransform();
    } else if (e.touches.length === 1) {
      if (scale.current > 1) {
        const dx = e.touches[0].clientX - origin.current.x;
        const dy = e.touches[0].clientY - origin.current.y;
        translate.current = { x: lastTranslate.current.x + dx, y: lastTranslate.current.y + dy };
        applyTransform();
      } else if (dragStartY.current !== null) {
        const dy = e.touches[0].clientY - dragStartY.current;
        dragY.current = dy;
        if (wrapperRef.current) wrapperRef.current.style.transform = `translateY(${dy}px)`;
        if (backdropRef.current) backdropRef.current.style.opacity = String(Math.max(0, 1 - Math.abs(dy) / 300));
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      lastScale.current = scale.current;
      lastTranslate.current = { ...translate.current };
      if (scale.current <= 1) resetTransform();

      if (dragStartY.current !== null) {
        if (Math.abs(dragY.current) > 100) {
          // slide out in the direction of the drag and close
          const dir = dragY.current > 0 ? "100%" : "-100%";
          if (wrapperRef.current) {
            wrapperRef.current.style.transition = "transform 0.25s cubic-bezier(0.2,0.8,0.2,1)";
            wrapperRef.current.style.transform = `translateY(${dir})`;
          }
          setTimeout(onClose, 220);
        } else {
          // snap back
          if (wrapperRef.current) {
            wrapperRef.current.style.transition = "transform 0.25s cubic-bezier(0.2,0.8,0.2,1)";
            wrapperRef.current.style.transform = "translateY(0)";
          }
          if (backdropRef.current) backdropRef.current.style.opacity = "1";
        }
        dragStartY.current = null;
        dragY.current = 0;
      }
    }
    lastPinchDist.current = null;
  };

  return (
    <div ref={backdropRef} className="fixed inset-0 z-2000 bg-green/95 flex items-center justify-center">
      <div
        ref={wrapperRef}
        className="w-full h-full flex items-center justify-center"
        style={{ touchAction: "none" }}
      >
        <div
          ref={imgRef}
          className="w-full h-full flex items-center justify-center"
          style={{ transform: "translate(0,0) scale(1)", transformOrigin: "center" }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="max-w-full max-h-full object-contain select-none" draggable={false} />
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 bg-white/10 text-white font-bowlby text-[20px] grid place-items-center border-0 cursor-pointer"
      >
        ×
      </button>
    </div>
  );
}

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
  const topBg = item?.fill === "orange-fill" ? "#FF5138" : "#395A66";

  const [showStamp, setShowStamp] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [itemNote, setItemNote] = useState("");
  const [atBottom, setAtBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset selections, note, scroll state, and lightbox whenever a new item opens
  useEffect(() => {
    setSelected({});
    setItemNote("");
    setAtBottom(false);
    setLightbox(false);
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

  // Collect all revealed groups from currently selected options
  const revealedGroups = useMemo(() => {
    const result: { optionId: string; group: AddonOption["revealedGroups"][number] }[] = [];
    addonGroups.forEach((g) => {
      g.options.forEach((o) => {
        if (selected[o.id]) {
          (o.revealedGroups ?? []).forEach((rg) => result.push({ optionId: o.id, group: rg }));
        }
      });
    });
    return result;
  }, [addonGroups, selected]);

  const selectedExtras = useMemo<(AddonOption & { required?: boolean; groupLabel?: string })[]>(() => {
    const fromMain = addonGroups.flatMap((g) =>
      g.options.filter((o) => selected[o.id]).map((o) => ({ ...o, required: g.required, groupLabel: g.required ? g.label : undefined }))
    );
    const fromRevealed = revealedGroups.flatMap(({ group: g }) =>
      g.options.filter((o) => selected[o.id]).map((o) => ({ ...o, required: g.required, groupLabel: g.required ? g.label : undefined }))
    );
    return [...fromMain, ...fromRevealed];
  }, [addonGroups, revealedGroups, selected]);

  const extrasTotal = selectedExtras.reduce((s, o) => s + o.price, 0);

  const missingRequired = useMemo(() => {
    const fromMain = addonGroups.filter((g) => g.required && !g.options.some((o) => selected[o.id]));
    const fromRevealed = revealedGroups
      .filter(({ group: g }) => g.required && !g.options.some((o) => selected[o.id]))
      .map(({ group }) => group);
    return [...fromMain, ...fromRevealed];
  }, [addonGroups, revealedGroups, selected]);

  const toggleAddon = (groupIndex: number, option: AddonOption, multi: boolean, isRevealed = false, revealedGroupOptions?: AddonOption[]) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (isRevealed && revealedGroupOptions) {
        if (multi) {
          next[option.id] = !prev[option.id];
        } else {
          revealedGroupOptions.forEach((o) => { next[o.id] = false; });
          next[option.id] = !prev[option.id];
        }
        return next;
      }
      if (multi) {
        next[option.id] = !prev[option.id];
        // clear revealed group selections when deselecting
        if (!next[option.id]) {
          (option.revealedGroups ?? []).forEach((rg) => rg.options.forEach((ro) => { next[ro.id] = false; }));
        }
      } else {
        const groupOptionIds = addonGroups[groupIndex].options.map((o) => o.id);
        // clear revealed groups of previously selected option
        addonGroups[groupIndex].options.forEach((o) => {
          if (prev[o.id] && o.id !== option.id) {
            (o.revealedGroups ?? []).forEach((rg) => rg.options.forEach((ro) => { next[ro.id] = false; }));
          }
        });
        groupOptionIds.forEach((id) => { next[id] = false; });
        next[option.id] = !prev[option.id];
        if (!next[option.id]) {
          (option.revealedGroups ?? []).forEach((rg) => rg.options.forEach((ro) => { next[ro.id] = false; }));
        }
      }
      return next;
    });
  };

  const sheetRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    const scrolledDown = (scrollRef.current?.scrollTop ?? 0) > 0;
    const touchInHeader = headerRef.current?.contains(e.target as Node) ?? false;
    if (scrolledDown && !touchInHeader) {
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
    dragCurrentY.current = 0;
  };

  return (
    <>
    {lightbox && item?.image_url && <ImageLightbox src={item.image_url} onClose={() => setLightbox(false)} />}
    <div
      className={[
        "absolute inset-x-0 top-0 bottom-8 bg-[rgba(31,46,38,0.78)] items-end justify-center z-1000",
        isOpen ? "flex" : "hidden",
      ].join(" ")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      {item && (
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={item.name}
          className="w-full bg-bg flex flex-col relative max-h-[90dvh]"
          style={{
            animation: "slideUp 0.25s cubic-bezier(0.2,0.8,0.2,1)",
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div ref={headerRef} className="relative flex flex-col shrink-0 overflow-hidden" style={{ background: topBg }}>
            {/* drag handle */}
            <div className="flex justify-center items-center h-4">
              <div className={["w-10 h-[3px] rounded-full", item.fill === "orange-fill" ? "bg-green" : "bg-orange"].join(" ")} />
            </div>
            {item.image_url ? (
              <div className="relative w-full h-52 overflow-hidden cursor-zoom-in" onClick={() => setLightbox(true)}>
                {/* blurred thumbnail placeholder — already cached from the menu card */}
                <Image src={item.image_url} alt="" aria-hidden fill quality={90} className="object-cover scale-110 blur-sm" />
                {/* full-res image fades in on load */}
                <Image
                  src={item.image_url}
                  alt=""
                  width={390}
                  height={208}
                  quality={90}
                  priority
                  className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                  style={{ opacity: 0 }}
                  onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "1"; }}
                />
                <div className="absolute bottom-2 right-2 bg-black/30 rounded-full w-7 h-7 grid place-items-center pointer-events-none">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M9 1h4v4M9 5l4-4M5 13H1V9M5 9l-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
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
          {/* sticky name header — stays visible while scrolling */}
          <div className="shrink-0 px-4.5 pt-4 pb-1.5 border-b border-green/30">
            <div className="font-extrabold text-[9px] tracking-[0.28em] text-orange uppercase mb-1">
              {item.cat}{item.spicy ? ` · 🌶 ${spicyLabel}` : ""}
            </div>
            <div className="font-bowlby text-[28px] leading-[0.92] text-green uppercase tracking-[-0.8px]">
              {item.name}
            </div>
          </div>
          <div ref={scrollRef} className="px-4.5 pt-3.5 pb-4.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

            {/* Add-on / option groups */}
            {addonGroups.length > 0 && (
              <div className="flex flex-col gap-3 mb-3.5">
                {addonGroups.map((group, gi) => {
                  const isMissing = group.required && !group.options.some((o) => selected[o.id]);
                  return (
                  <div key={gi}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-extrabold text-[9px] tracking-[0.22em] text-green uppercase">
                        {group.label}
                      </span>
                      {group.required && (
                        <span className={["font-extrabold text-[8px] tracking-[0.18em] uppercase px-1.5 py-0.5", isMissing ? "bg-orange text-white" : "bg-green/20 text-green"].join(" ")}>
                          Zorunlu
                        </span>
                      )}
                    </div>
                    <HorizontalScroll className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {group.options.map((opt) => {
                        const active = !!selected[opt.id];
                        const hasMedia = !!(opt.image_url || opt.emoji);
                        return hasMedia ? (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleAddon(gi, opt, group.multi)}
                            className={["flex flex-col shrink-0 w-20 border-2 cursor-pointer transition-colors overflow-hidden", active ? "border-green" : "border-green/30"].join(" ")}
                          >
                            <div className="w-full h-16 flex items-center justify-center bg-bg-deep">
                              {opt.image_url ? (
                                <Image src={opt.image_url} alt="" width={80} height={64} quality={90} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[28px] leading-none">{opt.emoji}</span>
                              )}
                            </div>
                            <div className={["px-1 py-1.5 text-center flex-1", active ? "bg-green" : "bg-transparent"].join(" ")}>
                              <div className={["font-ui font-extrabold text-[9px] tracking-wide uppercase leading-tight", active ? "text-bg" : "text-green"].join(" ")}>{opt.label}</div>
                              {opt.price > 0 && <div className={["font-bowlby text-[11px] leading-tight mt-0.5", active ? "text-bg/80" : "text-orange"].join(" ")}>+{opt.price}₺</div>}
                            </div>
                          </button>
                        ) : (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleAddon(gi, opt, group.multi)}
                            className={["shrink-0 border-2 cursor-pointer transition-colors px-3 py-2 flex flex-col items-center justify-center gap-0.5", active ? "border-green bg-green" : "border-green/30 bg-transparent"].join(" ")}
                          >
                            <span className={["font-ui font-extrabold text-[10px] tracking-wide uppercase whitespace-nowrap", active ? "text-bg" : "text-green"].join(" ")}>{opt.label}</span>
                            {opt.price > 0 && <span className={["font-bowlby text-[11px]", active ? "text-bg/80" : "text-orange"].join(" ")}>+{opt.price}₺</span>}
                          </button>
                        );
                      })}
                    </HorizontalScroll>
                    {/* Revealed groups — shown per-option when selected */}
                    {group.options.filter((o) => selected[o.id] && (o.revealedGroups ?? []).length > 0).map((opt) =>
                      (opt.revealedGroups ?? []).map((rg) => {
                        const rgMissing = rg.required && !rg.options.some((ro) => selected[ro.id]);
                        return (
                          <div key={rg.id} className="mt-2 pl-3 border-l-2 border-orange/40">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-extrabold text-[9px] tracking-[0.22em] text-orange uppercase">{rg.label}</span>
                              {rg.required && (
                                <span className={["font-extrabold text-[8px] tracking-[0.18em] uppercase px-1.5 py-0.5", rgMissing ? "bg-orange text-white" : "bg-orange/20 text-orange"].join(" ")}>Zorunlu</span>
                              )}
                            </div>
                            <HorizontalScroll className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                              {rg.options.map((ro) => {
                                const roActive = !!selected[ro.id];
                                const roHasMedia = !!(ro.image_url || ro.emoji);
                                return roHasMedia ? (
                                  <button
                                    key={ro.id}
                                    type="button"
                                    onClick={() => toggleAddon(gi, ro, rg.multi, true, rg.options)}
                                    className={["flex flex-col shrink-0 w-20 border-2 cursor-pointer transition-colors overflow-hidden", roActive ? "border-green" : "border-green/30"].join(" ")}
                                  >
                                    <div className="w-full h-16 flex items-center justify-center bg-bg-deep">
                                      {ro.image_url ? <Image src={ro.image_url} alt="" width={80} height={64} quality={90} className="w-full h-full object-cover" /> : <span className="text-[28px] leading-none">{ro.emoji}</span>}
                                    </div>
                                    <div className={["px-1 py-1.5 text-center flex-1", roActive ? "bg-green" : "bg-transparent"].join(" ")}>
                                      <div className={["font-ui font-extrabold text-[9px] tracking-wide uppercase leading-tight", roActive ? "text-bg" : "text-green"].join(" ")}>{ro.label}</div>
                                      {ro.price > 0 && <div className={["font-bowlby text-[11px] leading-tight mt-0.5", roActive ? "text-bg/80" : "text-orange"].join(" ")}>+{ro.price}₺</div>}
                                    </div>
                                  </button>
                                ) : (
                                  <button
                                    key={ro.id}
                                    type="button"
                                    onClick={() => toggleAddon(gi, ro, rg.multi, true, rg.options)}
                                    className={["shrink-0 border-2 cursor-pointer transition-colors px-3 py-2 flex flex-col items-center justify-center gap-0.5", roActive ? "border-green bg-green" : "border-green/30 bg-transparent"].join(" ")}
                                  >
                                    <span className={["font-ui font-extrabold text-[10px] tracking-wide uppercase whitespace-nowrap", roActive ? "text-bg" : "text-green"].join(" ")}>{ro.label}</span>
                                    {ro.price > 0 && <span className={["font-bowlby text-[11px]", roActive ? "text-bg/80" : "text-orange"].join(" ")}>+{ro.price}₺</span>}
                                  </button>
                                );
                              })}
                            </HorizontalScroll>
                          </div>
                        );
                      })
                    )}
                  </div>
                  );
                })}
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
                <HorizontalScroll className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {suggestedItems.map((sug) => (
                    <button
                      key={sug.id}
                      type="button"
                      onClick={() => { onClose(); onSuggestedClick(sug); }}
                      className="flex flex-col shrink-0 w-20 border-2 border-green/30 cursor-pointer transition-colors overflow-hidden hover:border-green"
                    >
                      <div className="w-full h-16 flex items-center justify-center bg-bg-deep">
                        {sug.image_url ? (
                          <Image src={sug.image_url} alt="" width={80} height={64} quality={90} className="w-full h-full object-cover" />
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
                </HorizontalScroll>
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
            {missingRequired.length > 0 && (
              <p className="text-[10px] font-bold text-orange mb-2">
                Zorunlu: {missingRequired.map((g) => g.label).join(", ")}
              </p>
            )}
            <button
              type="button"
              onClick={() => onAdd(selectedExtras, itemNote.trim())}
              disabled={!!item.sold_out || missingRequired.length > 0}
              className="w-full bg-orange text-white border-0 py-3.5 font-bowlby text-[16px] tracking-[1.5px] uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {item.sold_out ? "SOLD OUT" : addToOrderLabel}
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
    </>
  );
}
