"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

const AUTO_DISMISS_MS = 6_000;
const FADE_OUT_MS = 200;

type Props = {
  onDismiss: () => void;
  eyebrow: string;
  title: string;
  dismissHint: string;
};

export function BellTutorial({ onDismiss, eyebrow, title, dismissHint }: Props) {
  const [closing, setClosing] = useState(false);

  const handleDismiss = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onDismiss, FADE_OUT_MS);
  };

  useEffect(() => {
    const t = setTimeout(handleDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onClick={handleDismiss}
      className="fixed inset-0 z-[99997] cursor-pointer"
      style={{
        background:
          "radial-gradient(circle 56px at 40px calc(100% - 40px), transparent 44px, rgba(31,46,38,0.55) 56px, rgba(31,46,38,0.92) 140px)",
        animation: closing
          ? `fadeOut ${FADE_OUT_MS}ms ease forwards`
          : "fadeIn 0.3s ease",
      }}
      aria-modal="true"
      role="dialog"
    >
      {/* close (×) — top left */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
        className="absolute top-4 left-4 bg-orange text-white border-0 w-10 h-10 font-bowlby text-[32px] leading-none cursor-pointer grid place-items-center shadow-lg z-[99998]"
        aria-label="Dismiss"
      >
        ×
      </button>

      {/* centred headline */}
      <div className="absolute inset-x-0 top-[28%] flex flex-col items-center justify-center pointer-events-none px-8 z-[99998]">
        <p
          className="font-bowlby text-orange text-[22px] leading-none tracking-tight mb-3"
          style={{ textShadow: "0 1px 8px rgba(0,0,0,0.55)" }}
        >
          {eyebrow}
        </p>
        <p
          className="font-bowlby text-bg text-[28px] leading-snug text-center"
          style={{ textShadow: "0 1px 8px rgba(0,0,0,0.55)" }}
        >
          {title}
        </p>
      </div>

      {/* squiggly arrow — drawn-in then gently floats */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-[99998]"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g style={{ animation: "tutorialFloat 1.8s ease-in-out infinite", transformOrigin: "center" }}>
          <path
            d="M50,46 C42,56 62,64 44,72 C30,78 50,86 8,94"
            stroke="#e35d07"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="220"
            style={{ animation: "arrowDraw 0.9s ease-out both" }}
          />
          <path
            d="M8,94 L14,86 M8,94 L16,95"
            stroke="#e35d07"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
            style={{ animation: "fadeIn 0.3s ease 0.85s both" }}
          />
        </g>
      </svg>

      {/* pulsing ring around the bell's real position (mirrors WaiterButton: bottom-4 left-4 w-12 h-12) */}
      <div
        className="absolute bottom-4 left-4 w-12 h-12 pointer-events-none z-[99998]"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 border-2 border-orange"
          style={{ animation: "tutorialPulse 1.4s ease-in-out infinite" }}
        />
        <div className="absolute inset-0 grid place-items-center text-orange">
          <Bell size={20} strokeWidth={1.8} />
        </div>
      </div>

      {/* dismiss hint */}
      <p
        className="absolute bottom-6 inset-x-0 text-center font-ui text-[11px] uppercase tracking-[0.22em] text-bg/60 pointer-events-none z-[99998]"
        style={{ paddingLeft: "80px" }}
      >
        {dismissHint}
      </p>
    </div>
  );
}
