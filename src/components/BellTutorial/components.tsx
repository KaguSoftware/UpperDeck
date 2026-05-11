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

  // Bell sits at bottom-left of viewport: center ~ (40px, vh - 40px), size 48x48.
  return (
    <div
      onClick={handleDismiss}
      className="fixed inset-0 z-99997 cursor-pointer overflow-hidden"
      style={{
        background:
          "radial-gradient(circle 64px at 40px calc(100% - 40px), transparent 36px, rgba(31,46,38,0.6) 60px, rgba(31,46,38,0.94) 160px)",
        animation: closing
          ? `fadeOut ${FADE_OUT_MS}ms ease forwards`
          : "fadeIn 0.3s ease",
      }}
      aria-modal="true"
      role="dialog"
    >
      {/* close (×) — top right (away from bell) */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
        className="absolute top-4 right-4 bg-orange text-white border-0 w-10 h-10 font-bowlby text-[28px] leading-none cursor-pointer grid place-items-center shadow-lg z-99999"
        aria-label="Dismiss"
      >
        ×
      </button>

      {/* centred headline — anchored to top so arrow has room below */}
      <div className="absolute top-[22%] inset-x-0 flex flex-col items-center px-8 pointer-events-none z-99998">
        <p
          className="font-bowlby text-orange text-[20px] leading-none tracking-tight mb-3 uppercase"
          style={{ textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}
        >
          {eyebrow}
        </p>
        <p
          className="font-bowlby text-bg text-[30px] leading-[1.15] text-center"
          style={{ textShadow: "0 1px 10px rgba(0,0,0,0.6)" }}
        >
          {title}
        </p>
      </div>

      {/*
        Squiggly arrow: fixed-size SVG positioned absolutely so its coordinates
        map 1:1 to pixels. Top-left of SVG at (32px, 45% of viewport height).
        Bottom-right of SVG ends just above the bell at (40px from left, ~80px above bell).
      */}
      <svg
        className="absolute pointer-events-none z-99998"
        style={{
          left: "32px",
          top: "45%",
          width: "120px",
          height: "calc(55% - 110px)",
          overflow: "visible",
        }}
        viewBox="0 0 120 400"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g style={{ animation: "tutorialFloat 1.8s ease-in-out infinite", transformOrigin: "center" }}>
          {/* path from top-center (~60,10) curving down-left to bottom-left (~10,380), tip points to bell */}
          <path
            d="M 70 10 C 90 80, 30 120, 60 200 S 90 300, 18 380"
            stroke="#e35d07"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
            pathLength={100}
            strokeDasharray="100"
            style={{ animation: "arrowDraw 0.9s ease-out both" }}
          />
          {/* arrowhead at tip (18,380), pointing down-left toward (0, 400) */}
          <path
            d="M 18 380 L 28 368 M 18 380 L 30 380"
            stroke="#e35d07"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
            style={{ animation: "fadeIn 0.3s ease 0.85s both" }}
          />
        </g>
      </svg>

      {/* pulsing ring around the real bell position (mirrors WaiterButton: bottom-4 left-4 w-12 h-12 = 16px,16px,48x48) */}
      <div
        className="absolute pointer-events-none z-99998"
        style={{ left: "16px", bottom: "16px", width: "48px", height: "48px" }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 rounded-full border-2 border-orange"
          style={{ animation: "tutorialPulse 1.4s ease-in-out infinite" }}
        />
        <div className="absolute inset-0 grid place-items-center text-orange">
          <Bell size={22} strokeWidth={2} />
        </div>
      </div>

      {/* dismiss hint — bottom right, away from bell */}
      <p
        className="absolute bottom-6 right-4 font-ui text-[10px] uppercase tracking-[0.22em] text-bg/60 pointer-events-none z-99998"
      >
        {dismissHint}
      </p>
    </div>
  );
}
