"use client";

import { useState, useTransition } from "react";
import { callWaiter } from "@/lib/waiter/call";

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

  const open = () => setPhase("open");
  const close = () => { if (!isPending) setPhase("idle"); };

  const handle = (reason: "bill" | "waiter") => {
    setPhase("sending");
    startTransition(async () => {
      await callWaiter(tableNumber, reason);
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
        className={["absolute bottom-4 left-4 z-9999 w-12 h-12 bg-green text-bg border-0 grid place-items-center cursor-pointer shadow-lg transition-all duration-300", hidden ? "opacity-0 translate-y-4 pointer-events-none" : "opacity-100 translate-y-0"].join(" ")}
      >
        {/* bell icon */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 2C10 2 6 4.5 6 10V14H14V10C14 4.5 10 2 10 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M8 14C8 15.1 8.9 16 10 16C11.1 16 12 15.1 12 14" stroke="currentColor" strokeWidth="1.8"/>
          <line x1="10" y1="2" x2="10" y2="0.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
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
                    disabled={phase === "sending"}
                    className="w-full bg-orange text-white font-ui font-extrabold text-[13px] tracking-widest uppercase py-4 border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {phase === "sending" ? "…" : labelBill}
                  </button>

                  {/* call waiter */}
                  <button
                    type="button"
                    onClick={() => handle("waiter")}
                    disabled={phase === "sending"}
                    className="w-full border-2 border-green text-green font-ui font-extrabold text-[13px] tracking-widest uppercase py-4 bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green hover:text-bg transition-colors"
                  >
                    {phase === "sending" ? "…" : labelWaiter}
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
