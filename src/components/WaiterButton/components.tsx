"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";
import { callWaiter } from "@/lib/waiter/call";

function WaiterSheet({ heroCollapsed, onClose, isPending, children }: {
  heroCollapsed: boolean;
  onClose: () => void;
  isPending: boolean;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY = useRef(0);
  const startY = useRef(0);
  const [translateY, setTranslateY] = useState(0);

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
    } else {
      setTranslateY(0);
    }
  }

  return (
    <div
      className={`${heroCollapsed ? "absolute" : "fixed"} inset-0 z-99999 bg-[rgba(31,46,38,0.72)] flex items-end justify-center`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={sheetRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="w-full bg-bg border-t-4 border-green flex flex-col min-h-[340px] touch-none"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: translateY === 0 ? "transform 0.25s cubic-bezier(0.2,0.8,0.2,1)" : "none",
          animation: translateY === 0 ? "slideUp 0.25s cubic-bezier(0.2,0.8,0.2,1)" : "none",
        }}
      >
        {/* drag handle */}
        <div className="flex justify-center items-center w-full bg-green py-2.5 shrink-0">
          <div className="w-10 h-0.75 rounded-full bg-orange" />
        </div>
        {children}
      </div>
    </div>
  );
}

function BellArrows({ scrollParent, dismissed, onDismiss }: { scrollParent: React.RefObject<HTMLElement | null>; dismissed: boolean; onDismiss: () => void }) {
  useEffect(() => {
    const el = scrollParent.current;
    if (!el) return;
    function onScroll() {
      if (el!.scrollTop > 10) onDismiss();
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollParent, onDismiss]);

  // Auto-dismiss after 4 seconds
  useEffect(() => {
    if (dismissed) return;
    const t = setTimeout(onDismiss, 4_000);
    return () => clearTimeout(t);
  }, [dismissed, onDismiss]);

  const visible = !dismissed;

  return (
    <>
      {/* full-page green overlay */}
      <div
        className="fixed inset-0 pointer-events-none transition-opacity duration-500 z-99998"
        style={{ backgroundColor: "rgba(57,87,72,0.35)", opacity: visible ? 1 : 0 }}
        aria-hidden="true"
      />
      {/* bouncing arrows */}
      <div
        className="absolute bottom-20 flex flex-col items-center gap-1 pointer-events-none transition-opacity duration-500 z-99999"
        style={{ left: "8px", opacity: visible ? 1 : 0 }}
        aria-hidden="true"
      >
        {[0, 160, 320].map((delay) => (
          <svg
            key={delay}
            width="64"
            height="42"
            viewBox="0 0 36 24"
            fill="none"
            className="text-orange"
            style={{
              animation: `arrowBounce 0.8s ease-in-out ${delay}ms infinite`,
            }}
          >
            <path d="M2 2L18 20L34 2" stroke="currentColor" strokeWidth="4" strokeLinecap="square" strokeLinejoin="miter" />
          </svg>
        ))}
      </div>
    </>
  );
}

const COOLDOWNS_MS = [60_000, 300_000, 600_000];

function cooldownLabel(secs: number): string {
  if (secs <= 0) return "";
  if (secs < 60) return `0:${String(secs).padStart(2, "0")}`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type WaiterButtonProps = {
  tableNumber: number;
  labelBill: string;
  labelWaiter: string;
  labelTitle: string;
  labelCancel: string;
  labelNotified: string;
  hidden?: boolean;
  scrollRef?: React.RefObject<HTMLElement | null>;
  heroCollapsed?: boolean;
  onBeforeOpen?: () => boolean;
};

type Phase = "idle" | "open" | "sending" | "done";

export function WaiterButton({ tableNumber, labelBill, labelWaiter, labelTitle, labelCancel, labelNotified, hidden, scrollRef, heroCollapsed, onBeforeOpen }: WaiterButtonProps) {
  const storageKey = `waiter_t${tableNumber}`;

  const [phase, setPhase] = useState<Phase>("idle");
  const [isPending, startTransition] = useTransition();
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [arrowsDismissed, setArrowsDismissed] = useState(false);
  const cooldownUntil = useRef(0);
  const callCount = useRef(0);

  // Restore persisted cooldown on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const { until, count } = JSON.parse(raw) as { until: number; count: number };
      const remaining = Math.ceil((until - Date.now()) / 1000);
      cooldownUntil.current = until;
      callCount.current = count;
      if (remaining > 0) setSecondsLeft(remaining);
    } catch { /* ignore corrupt data */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      const remaining = Math.ceil((cooldownUntil.current - Date.now()) / 1000);
      if (remaining <= 0) {
        setSecondsLeft(0);
        clearInterval(id);
      } else {
        setSecondsLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const handleDismiss = useCallback(() => setArrowsDismissed(true), []);
  const open = () => {
    if (onBeforeOpen && !onBeforeOpen()) return;
    setPhase("open");
    setArrowsDismissed(true);
  };
  const close = () => { if (!isPending) setPhase("idle"); };

  const handle = (reason: "bill" | "waiter") => {
    if (secondsLeft > 0) return;
    setPhase("sending");
    startTransition(async () => {
      await callWaiter(tableNumber, reason);
      const idleSinceCooldown = cooldownUntil.current > 0 ? Date.now() - cooldownUntil.current : 0;
      if (idleSinceCooldown > 2 * 60_000) callCount.current = 0;
      const cooldownMs = COOLDOWNS_MS[Math.min(callCount.current, COOLDOWNS_MS.length - 1)];
      callCount.current += 1;
      cooldownUntil.current = Date.now() + cooldownMs;
      try { localStorage.setItem(storageKey, JSON.stringify({ until: cooldownUntil.current, count: callCount.current })); } catch { /* ignore */ }
      setSecondsLeft(Math.ceil(cooldownMs / 1000));
      setPhase("done");
      setTimeout(() => setPhase("idle"), 2500);
    });
  };

  return (
    <>
      {/* scroll-away arrows */}
      {scrollRef && tableNumber > 0 && <BellArrows scrollParent={scrollRef} dismissed={arrowsDismissed || !!hidden || phase !== "idle"} onDismiss={handleDismiss} />}

      {/* floating button */}
      <button
        type="button"
        onClick={open}
        aria-label="Call waiter"
        className={["absolute bottom-4 left-4 z-9999 w-12 h-12 bg-green text-bg border-0 grid place-items-center cursor-pointer shadow-lg transition-all duration-300", hidden ? "opacity-0 translate-y-4 pointer-events-none" : "opacity-100 translate-y-0", secondsLeft > 0 ? "opacity-60" : ""].join(" ")}
      >
        <Bell size={20} strokeWidth={1.8} />
        {secondsLeft > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-orange text-white font-ui font-extrabold text-[9px] leading-none px-1 py-0.5 rounded-full">
            {cooldownLabel(secondsLeft)}
          </span>
        )}
      </button>

      {/* backdrop + popup */}
      {phase !== "idle" && (
        <WaiterSheet heroCollapsed={!!heroCollapsed} onClose={close} isPending={phase === "sending"}>
          {phase === "done" ? (
            <div className="px-6 py-10 text-center">
              <div className="font-bowlby text-[32px] text-green leading-none mb-2">✓</div>
              <div className="font-ui font-extrabold text-[13px] tracking-[0.18em] uppercase text-green">
                {labelNotified}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4.5 py-3 border-b-2 border-green shrink-0">
                <span className="font-bowlby text-[20px] text-green uppercase tracking-[-0.5px]">
                  {labelTitle}
                </span>
                <button
                  type="button"
                  onClick={close}
                  disabled={phase === "sending"}
                  className="bg-orange text-white border-0 w-8.5 h-8.5 font-bowlby text-[18px] cursor-pointer grid place-items-center disabled:opacity-40"
                >
                  ×
                </button>
              </div>

              <div className="flex flex-col gap-4 px-4.5 py-6 flex-1 justify-center">
                <button
                  type="button"
                  onClick={() => handle("bill")}
                  disabled={phase === "sending" || secondsLeft > 0}
                  className="w-full bg-orange text-white font-ui font-extrabold text-[15px] tracking-widest uppercase py-5 border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {phase === "sending" ? "…" : secondsLeft > 0 ? cooldownLabel(secondsLeft) : labelBill}
                </button>

                <button
                  type="button"
                  onClick={() => handle("waiter")}
                  disabled={phase === "sending" || secondsLeft > 0}
                  className="w-full border-2 border-green text-green font-ui font-extrabold text-[15px] tracking-widest uppercase py-5 bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green hover:text-bg transition-colors"
                >
                  {phase === "sending" ? "…" : secondsLeft > 0 ? cooldownLabel(secondsLeft) : labelWaiter}
                </button>
              </div>
            </>
          )}
        </WaiterSheet>
      )}
    </>
  );
}
