"use client";

import { useRef } from "react";
import type { ItemModalProps } from "./types";

export function ItemModal({
  item,
  onClose,
  onAdd,
  spicyLabel,
  priceLabel,
  addToOrderLabel,
}: ItemModalProps) {
  const isOpen = item !== null;
  const topBg = item?.fill === "orange-fill" ? "#e35d07" : "#395748";

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
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
          className="w-full bg-bg animate-[slideUp_0.25s_cubic-bezier(0.2,0.8,0.2,1)] flex flex-col relative"
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
            {item.sold_out && (
              <div
                key={item.id + "-stamp"}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                {/* shockwave ring */}
                <div
                  className="absolute rounded-full border-2 border-[#CC2222]"
                  style={{
                    width: 120,
                    height: 60,
                    animation: "shockwave 0.45s cubic-bezier(0.2,0.8,0.2,1) 0.3s both",
                  }}
                />
                {/* stamp */}
                <div
                  style={{
                    animation: "stampSlam 0.35s cubic-bezier(0.2,0.8,0.2,1) both",
                  }}
                >
                  <div
                    style={{
                      border: "4px solid #CC2222",
                      padding: "4px",
                      animation: "fireGlow 0.6s ease-in-out 0.35s infinite",
                    }}
                  >
                    <div style={{ border: "2px solid #CC2222", padding: "6px 14px" }}>
                      <span
                        style={{
                          color: "#CC2222",
                          fontFamily: "var(--font-bowlby, Impact, sans-serif)",
                          fontSize: "28px",
                          fontWeight: 900,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          lineHeight: 1,
                          display: "block",
                          animation: "flicker 0.5s ease-in-out 0.35s infinite",
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
          <div className="px-4.5 pt-4 pb-4.5">
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
            <div className="flex justify-between items-center py-2.5 border-t-2 border-b-2 border-green mb-3.5">
              <span className="font-extrabold text-[9px] tracking-[0.28em] text-green uppercase">{priceLabel}</span>
              {item.discountPct ? (
                <div className="flex items-baseline gap-2">
                  <span className="font-ui font-extrabold text-[14px] text-green/40 line-through">{item.price} ₺</span>
                  <span className="font-bowlby text-[24px] text-orange">{Math.round(item.price * (1 - item.discountPct / 100))} ₺</span>
                </div>
              ) : (
                <span className="font-bowlby text-[24px] text-orange">{item.price} ₺</span>
              )}
            </div>
            <button
              type="button"
              onClick={onAdd}
              className="w-full bg-orange text-white border-0 py-3.5 font-bowlby text-[16px] tracking-[1.5px] uppercase cursor-pointer"
            >
              {addToOrderLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
