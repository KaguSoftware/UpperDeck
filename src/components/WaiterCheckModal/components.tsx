"use client";

import { useEffect } from "react";
import { Loader } from "@/components/Loader/components";

type WaiterCheckModalProps = {
  show: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  body: string;
  dismissLabel: string;
  callWaiterLabel: string;
  sendingLabel: string;
  /** Post-call copy: the waiter is coming, the order still isn't placed. */
  notPlacedLabel: string;
  onWayTitle: string;
  onWayBody: string;
  callAgainLabel: string;
  /** Pre-formatted "you can call again in M:SS", empty once the cooldown lapses. */
  cooldownLabel: string;
  /**
   * Sticky for the life of the order — NOT the call cooldown. Deriving this
   * from the cooldown made the screen flip back to "call a waiter" ten seconds
   * after the diner had already called one.
   */
  waiterCalled: boolean;
  submitting: boolean;
  onCallWaiter: () => void;
};

const HAZARD_ORANGE =
  "repeating-linear-gradient(45deg, #FF5138 0 14px, #243845 14px 28px)";
const HAZARD_GREEN =
  "repeating-linear-gradient(45deg, #395A66 0 14px, #243845 14px 28px)";

/** Moving barber-pole band top and bottom — frames the screen as "read me". */
function HazardBand({ called }: { called: boolean }) {
  return (
    <div
      aria-hidden
      className="h-3 w-full shrink-0"
      style={{
        backgroundImage: called ? HAZARD_GREEN : HAZARD_ORANGE,
        backgroundSize: "56px 56px",
        animation: "hazardScroll 1.1s linear infinite",
      }}
    />
  );
}

/**
 * Full-screen takeover covering the two beats after a diner confirms a basket.
 *
 * Before the call: nothing has been sent anywhere, so the screen has one job —
 * get them to ring the bell.
 *
 * After the call: a waiter has been pinged, but the order STILL is not placed;
 * the waiter places it at the table. The screen switches to explaining that
 * wait rather than asking for another call, with re-calling demoted to a quiet
 * "no one came yet?" escape hatch.
 */
export function WaiterCheckModal({
  show,
  onClose,
  eyebrow,
  title,
  body,
  dismissLabel,
  callWaiterLabel,
  sendingLabel,
  notPlacedLabel,
  onWayTitle,
  onWayBody,
  callAgainLabel,
  cooldownLabel,
  waiterCalled,
  submitting,
  onCallWaiter,
}: WaiterCheckModalProps) {
  useEffect(() => {
    if (!show) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [show, onClose]);

  // The takeover covers the cart drawer, which already scrolls underneath.
  useEffect(() => {
    if (!show) return;
    document.body.classList.add("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, [show]);

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={waiterCalled ? onWayTitle : title}
      className="waiter-check-motion fixed inset-0 z-[999999] flex flex-col"
      style={{ background: "#243845", animation: "fadeIn 0.22s ease" }}
    >
      <HazardBand called={waiterCalled} />

      <button
        type="button"
        onClick={onClose}
        aria-label={dismissLabel}
        className="absolute top-7 right-4 z-10 w-9 h-9 grid place-items-center bg-transparent border-2 border-bg/25 text-bg/60 font-bowlby text-[17px] leading-none cursor-pointer"
      >
        ×
      </button>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center gap-6 px-6 py-8 text-center">
        {/* Before: a bell demanding to be rung. After: a waiter walking over. */}
        <div className="relative grid place-items-center w-40 h-40 shrink-0">
          {[0, 0.8, 1.6].map((delay) => (
            <span
              key={delay}
              aria-hidden
              className={[
                "absolute w-28 h-28 rounded-full border-2",
                waiterCalled ? "border-green" : "border-orange",
              ].join(" ")}
              style={{
                animation: `bellRing ${waiterCalled ? "3.4s" : "2.4s"} ease-out ${delay}s infinite`,
              }}
            />
          ))}
          <span
            aria-hidden
            className="relative text-[86px] leading-none"
            style={{
              animation: waiterCalled
                ? "popIn 0.4s cubic-bezier(0.2,0.8,0.2,1)"
                : "bellSwing 2.6s ease-in-out infinite",
              transformOrigin: "50% 18%",
            }}
          >
            {waiterCalled ? "🚶" : "🛎️"}
          </span>
        </div>

        {/*
          Stays orange after the call on purpose: the single most misread thing
          here is thinking the order went in when only a waiter was summoned.
        */}
        <div
          className="inline-flex items-center gap-2 px-3.5 py-2 font-ui font-extrabold text-[10px] tracking-[0.24em] uppercase shrink-0 bg-orange text-white"
          style={{ animation: "popIn 0.35s cubic-bezier(0.2,0.8,0.2,1) both" }}
        >
          <span
            aria-hidden
            className="w-2 h-2 bg-white shrink-0"
            style={{ animation: "eyebrowBlink 1s steps(1, end) infinite" }}
          />
          {waiterCalled ? notPlacedLabel : eyebrow}
        </div>

        <h2
          className="font-bowlby uppercase text-bg leading-[0.98] tracking-[-0.5px] max-w-[15ch]"
          style={{ fontSize: "clamp(32px, 11vw, 52px)" }}
        >
          {waiterCalled ? onWayTitle : title}
        </h2>

        <p className="font-ui text-[15px] leading-[1.55] text-bg/75 max-w-sm">
          {waiterCalled ? onWayBody : body}
        </p>
      </div>

      <div className="shrink-0 px-5 pb-7 pt-2 flex flex-col gap-3">
        {waiterCalled ? (
          /* Quiet by design — the expected outcome is waiting, not calling. */
          cooldownLabel ? (
            <p className="w-full text-center font-ui text-[12px] tracking-[0.06em] text-bg/45 py-4">
              {cooldownLabel}
            </p>
          ) : (
            <button
              type="button"
              onClick={onCallWaiter}
              disabled={submitting}
              className="w-full bg-transparent border-2 border-bg/30 text-bg/80 font-ui font-extrabold text-[12px] tracking-[0.16em] uppercase py-3.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader size="xs" tone="onDark" />
                  <span>{sendingLabel}</span>
                </>
              ) : (
                callAgainLabel
              )}
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={onCallWaiter}
            disabled={submitting}
            className="w-full bg-orange text-white font-bowlby text-[22px] uppercase tracking-[-0.3px] py-5 border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-3"
            style={submitting ? undefined : { animation: "ctaGlow 1.5s ease-in-out infinite" }}
          >
            {submitting ? (
              <>
                <Loader size="xs" tone="onDark" />
                <span className="font-ui font-extrabold text-[13px] tracking-widest">
                  {sendingLabel}
                </span>
              </>
            ) : (
              <>
                <span aria-hidden className="text-[24px] leading-none">🛎️</span>
                {callWaiterLabel}
              </>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className={[
            "w-full bg-transparent border-0 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase py-2 cursor-pointer",
            waiterCalled ? "text-bg/70" : "text-bg/50",
          ].join(" ")}
        >
          {dismissLabel}
        </button>
      </div>

      <HazardBand called={waiterCalled} />
    </div>
  );
}
