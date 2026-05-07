"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { callWaiter } from "@/lib/waiter/call";

const COOLDOWN_MS = 60_000;

type WaiterButtonProps = {
  tableNumber: number;
  labelBill: string;
  labelWaiter: string;
  labelTitle: string;
  labelCancel: string;
  hidden?: boolean;
};

type Phase = "idle" | "open" | "sending" | "done";

export function WaiterButton({ tableNumber, labelBill, labelWaiter, labelTitle, labelCancel, hidden }: WaiterButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [isPending, startTransition] = useTransition();
  const [secondsLeft, setSecondsLeft] = useState(0);
  const cooldownUntil = useRef(0);

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

  const open = () => setPhase("open");
  const close = () => { if (!isPending) setPhase("idle"); };

  const handle = (reason: "bill" | "waiter") => {
    if (secondsLeft > 0) return;
    setPhase("sending");
    startTransition(async () => {
      await callWaiter(tableNumber, reason);
      cooldownUntil.current = Date.now() + COOLDOWN_MS;
      setSecondsLeft(60);
      setPhase("done");
      setTimeout(() => setPhase("idle"), 2500);
    });
  };

  return (
    <>
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
            {secondsLeft}s
          </span>
        )}
      </button>

      {/* backdrop + popup */}
      {phase !== "idle" && (
        <div
          className="absolute inset-0 z-99999 bg-[rgba(31,46,38,0.72)] flex items-end justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="w-full bg-bg border-t-4 border-green animate-[slideUp_0.25s_cubic-bezier(0.2,0.8,0.2,1)] pb-safe">

            {phase === "done" ? (
              <div className="px-6 py-10 text-center">
                <div className="font-bowlby text-[32px] text-green leading-none mb-2">✓</div>
                <div className="font-ui font-extrabold text-[13px] tracking-[0.18em] uppercase text-green">
                  {labelWaiter} notified
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-4.5 py-3 border-b-2 border-green">
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

                <div className="flex flex-col gap-3 px-4.5 py-5">
                  {/* bill */}
                  <button
                    type="button"
                    onClick={() => handle("bill")}
                    disabled={phase === "sending" || secondsLeft > 0}
                    className="w-full bg-orange text-white font-ui font-extrabold text-[13px] tracking-widest uppercase py-4 border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {phase === "sending" ? "…" : secondsLeft > 0 ? `${secondsLeft}s` : labelBill}
                  </button>

                  {/* call waiter */}
                  <button
                    type="button"
                    onClick={() => handle("waiter")}
                    disabled={phase === "sending" || secondsLeft > 0}
                    className="w-full border-2 border-green text-green font-ui font-extrabold text-[13px] tracking-widest uppercase py-4 bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green hover:text-bg transition-colors"
                  >
                    {phase === "sending" ? "…" : secondsLeft > 0 ? `${secondsLeft}s` : labelWaiter}
                  </button>

                  <button
                    type="button"
                    onClick={close}
                    disabled={phase === "sending"}
                    className="w-full text-green/50 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase py-2 border-0 bg-transparent cursor-pointer"
                  >
                    {labelCancel}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
