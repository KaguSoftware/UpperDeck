"use client";

import { useRef, useState, useEffect } from "react";
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

  const [showStamp, setShowStamp] = useState(false);
  useEffect(() => {
    if (!item?.sold_out) { setShowStamp(false); return; }
    setShowStamp(false);
    const t = setTimeout(() => setShowStamp(true), 300);
    return () => clearTimeout(t);
  }, [item?.id, item?.sold_out]);

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
          className="w-full bg-bg flex flex-col relative"
          style={{
            animation: showStamp
              ? "slideUp 0.25s cubic-bezier(0.2,0.8,0.2,1), screenShake 0.45s ease-out 0.3s"
              : "slideUp 0.25s cubic-bezier(0.2,0.8,0.2,1)",
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
                {/* red flash on impact */}
                <div
                  className="absolute inset-0 bg-[#CC2222]"
                  style={{ animation: "redFlash 0.3s ease-out both" }}
                />
                {/* shockwave ring 1 */}
                <div
                  className="absolute border-[#CC2222] rounded-full"
                  style={{
                    width: 140, height: 70,
                    animation: "shockwave 0.5s cubic-bezier(0.1,0.8,0.2,1) both",
                  }}
                />
                {/* shockwave ring 2 — delayed */}
                <div
                  className="absolute border-orange rounded-full"
                  style={{
                    width: 140, height: 70,
                    animation: "shockwave2 0.65s cubic-bezier(0.1,0.8,0.2,1) 0.06s both",
                  }}
                />
                {/* shockwave ring 3 — most delayed */}
                <div
                  className="absolute border-[#CC2222] rounded-full"
                  style={{
                    width: 140, height: 70,
                    animation: "shockwave3 0.8s cubic-bezier(0.1,0.8,0.2,1) 0.12s both",
                  }}
                />
                {/* sparks — 8 directions */}
                {[
                  "translate(-70px, -50px) scale(0)",
                  "translate(70px, -50px) scale(0)",
                  "translate(-80px, 0px) scale(0)",
                  "translate(80px, 0px) scale(0)",
                  "translate(-50px, 50px) scale(0)",
                  "translate(50px, 50px) scale(0)",
                  "translate(0px, -65px) scale(0)",
                  "translate(0px, 65px) scale(0)",
                  "translate(-95px, -25px) scale(0)",
                  "translate(95px, -25px) scale(0)",
                  "translate(-95px, 25px) scale(0)",
                  "translate(95px, 25px) scale(0)",
                ].map((end, i) => (
                  <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: i % 3 === 0 ? 6 : i % 3 === 1 ? 4 : 8,
                      height: i % 3 === 0 ? 6 : i % 3 === 1 ? 4 : 8,
                      background: i % 2 === 0 ? "#CC2222" : "#ff6a00",
                      ["--spark-end" as string]: end,
                      animation: `sparkFly 0.5s cubic-bezier(0.1,0.9,0.2,1) ${0.02 * i}s both`,
                    }}
                  />
                ))}
                {/* stamp */}
                <div style={{ animation: "stampSlam 0.4s cubic-bezier(0.15,0.8,0.2,1) both" }}>
                  <div
                    style={{
                      border: "5px solid #CC2222",
                      padding: "5px",
                      animation: "fireGlow 0.5s ease-in-out 0.4s infinite",
                    }}
                  >
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
                          textShadow: "0 0 8px rgba(204,34,34,0.8), 0 0 20px rgba(227,93,7,0.6)",
                          animation: "flicker 0.4s ease-in-out 0.4s infinite",
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
