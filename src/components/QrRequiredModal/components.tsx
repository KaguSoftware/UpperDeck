"use client";

import { useState, useRef } from "react";

type QrRequiredModalProps = {
  show: boolean;
  onClose: () => void;
  title: string;
  body: string;
};

function QrIllustration() {
  // 17×17 explicit bitmap (0=light, 1=dark).
  // Three 7×7 finder patterns at TL, TR, BL corners + data region in remaining space.
  // prettier-ignore
  const MAP = [
    [1,1,1,1,1,1,1, 0, 1,0,1,0,1, 0, 1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1, 0, 0,1,0,1,0, 0, 1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1, 0, 1,0,0,0,1, 0, 1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1, 0, 0,1,1,0,0, 0, 1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1, 0, 1,0,1,1,0, 0, 1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1, 0, 0,0,1,0,1, 0, 1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1, 0, 1,1,0,0,1, 0, 1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0, 0, 0,1,0,1,0, 0, 0,0,0,0,0,0,0],
    [1,0,1,1,0,1,1, 0, 1,0,1,0,1, 0, 1,1,0,1,0,1,1],
    [0,1,0,0,1,0,0, 0, 0,1,1,0,0, 0, 0,0,1,0,1,0,0],
    [1,1,0,1,0,1,0, 0, 1,0,0,1,1, 0, 0,1,1,0,0,1,0],
    [0,0,1,0,1,0,1, 0, 0,1,0,0,1, 0, 1,0,0,1,0,0,1],
    [1,0,0,1,1,0,1, 0, 1,0,1,1,0, 0, 1,1,0,0,1,1,0],
    [0,0,0,0,0,0,0, 0, 0,1,0,1,0, 0, 0,1,0,1,0,1,0],
    [1,1,1,1,1,1,1, 0, 1,0,1,0,1, 0, 1,0,1,0,1,0,1],
    [1,0,0,0,0,0,1, 0, 0,1,0,0,0, 0, 0,1,0,1,0,0,1],
    [1,0,1,1,1,0,1, 0, 1,0,1,1,0, 0, 1,0,1,0,1,1,0],
    [1,0,1,1,1,0,1, 0, 0,1,0,1,1, 0, 0,1,0,0,0,1,0],
    [1,0,1,1,1,0,1, 0, 1,0,1,0,1, 0, 1,0,1,1,0,0,1],
    [1,0,0,0,0,0,1, 0, 0,1,0,1,0, 0, 0,1,0,0,1,0,1],
    [1,1,1,1,1,1,1, 0, 1,0,1,0,1, 0, 0,0,1,1,0,1,0],
  ];

  const CELL = 4;
  const SIZE = MAP[0].length;

  return (
    <svg
      width={SIZE * CELL}
      height={SIZE * CELL}
      viewBox={`0 0 ${SIZE * CELL} ${SIZE * CELL}`}
      xmlns="http://www.w3.org/2000/svg"
      className="opacity-85"
    >
      {MAP.map((row, r) =>
        row.map((val, c) =>
          val ? (
            <rect
              key={`${r}-${c}`}
              x={c * CELL}
              y={r * CELL}
              width={CELL}
              height={CELL}
              fill="var(--color-green, #395748)"
            />
          ) : null
        )
      )}
    </svg>
  );
}

export function QrRequiredModal({ show, onClose, title, body }: QrRequiredModalProps) {
  const [translateY, setTranslateY] = useState(0);
  const dragY = useRef(0);
  const startY = useRef(0);

  function onPointerDown(e: React.PointerEvent) {
    startY.current = e.clientY;
    dragY.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const delta = Math.max(0, e.clientY - startY.current);
    dragY.current = delta;
    setTranslateY(delta);
  }

  function onPointerUp(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (dragY.current > 80) {
      onClose();
      setTranslateY(0);
    } else {
      setTranslateY(0);
    }
  }

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[999999] bg-[rgba(31,46,38,0.85)] flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="w-full bg-bg border-t-4 border-green touch-none"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: translateY === 0 ? "transform 0.25s cubic-bezier(0.2,0.8,0.2,1)" : "none",
          animation: translateY === 0 ? "slideUp 0.25s cubic-bezier(0.2,0.8,0.2,1)" : "none",
        }}
      >
        {/* drag handle */}
        <div className="flex justify-center items-center w-full bg-green py-2.5 shrink-0 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-0.75 rounded-full bg-orange" />
        </div>

        {/* header */}
        <div className="flex items-center justify-between px-4.5 py-3 border-b-2 border-green shrink-0">
          <span className="font-bowlby text-[20px] text-green uppercase tracking-[-0.5px]">
            {title}
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

        {/* body */}
        <div className="flex flex-col items-center gap-6 px-6 py-10 text-center">
          <QrIllustration />
          <p className="font-ui text-[14px] text-green/80 leading-relaxed max-w-xs">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
