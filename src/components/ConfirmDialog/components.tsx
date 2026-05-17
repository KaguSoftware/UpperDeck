"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100000 bg-black/50 grid place-items-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="w-full max-w-md bg-bg border-2 border-green p-6 flex flex-col gap-4">
        <h2 id="confirm-title" className="font-bowlby text-[22px] uppercase text-green leading-none tracking-[-0.3px]">
          {title}
        </h2>
        {body && (
          <p className="font-ui text-[13px] text-green/80">
            {body}
          </p>
        )}
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="border-2 border-green text-green bg-transparent px-4 py-2 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={[
              "border-0 text-white px-4 py-2 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase cursor-pointer",
              destructive ? "bg-orange" : "bg-green",
            ].join(" ")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
