"use client";

import { useEffect, useState } from "react";

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
      {/* centred headline */}
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
        Arrow: fixed-size SVG. left edge at 0, top at 50% of viewport.
        The SVG height fills from 50% down to the bell (bell center ~= vh - 40px).
        We use height: calc(50% - 40px) so the bottom of the SVG lands exactly at bell center.
        viewBox 0 0 80 400 — we draw the path in this space, tip at (8, 390).
      */}
      <svg
        className="absolute pointer-events-none z-99998"
        style={{
          left: "0px",
          top: "50%",
          width: "80px",
          height: "calc(50% - 88px)",
        }}
        viewBox="0 0 80 400"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g style={{ animation: "tutorialFloat 1.8s ease-in-out infinite", transformOrigin: "40px 200px" }}>
          <path
            d="M 60 10 C 75 80, 20 140, 55 210 S 75 310, 18 385"
            stroke="#e35d07"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
            pathLength={100}
            strokeDasharray="100"
            style={{ animation: "arrowDraw 0.9s ease-out both" }}
          />
          {/* arrowhead pointing down-left */}
          <path
            d="M 18 385 L 28 372 M 18 385 L 32 384"
            stroke="#e35d07"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
            style={{ animation: "fadeIn 0.3s ease 0.85s both" }}
          />
        </g>
      </svg>

      {/* dismiss hint — bottom right */}
      <p className="absolute bottom-6 right-4 font-ui text-[10px] uppercase tracking-[0.22em] text-bg/60 pointer-events-none z-99998">
        {dismissHint}
      </p>
    </div>
  );
}
