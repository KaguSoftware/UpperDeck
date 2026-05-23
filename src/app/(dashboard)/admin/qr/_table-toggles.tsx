"use client";

import { useTransition } from "react";
import { setTableWaiterDisabled } from "./actions";
import { Loader } from "@/components/Loader/components";

export function TableWaiterToggle({
  tableNumber,
  disabled,
}: {
  tableNumber: string;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(() => setTableWaiterDisabled(tableNumber, !disabled));
  }

  return (
    <div className="relative">
      {isPending && (
        <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
          <Loader size="xs" />
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        title={disabled ? "Zil devre dışı — etkinleştirmek için tıkla" : "Zil etkin — devre dışı bırakmak için tıkla"}
        className={[
          "w-full flex items-center justify-center gap-1.5 px-2 py-1 font-ui font-extrabold text-[8px] tracking-[0.18em] uppercase transition-colors border",
          disabled
            ? "bg-orange/10 border-orange text-orange"
            : "bg-green/10 border-green/40 text-green/60 hover:border-green hover:text-green",
          isPending ? "cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        {disabled ? "🔕 Zil Kapalı" : "🔔 Zil Açık"}
      </button>
    </div>
  );
}
