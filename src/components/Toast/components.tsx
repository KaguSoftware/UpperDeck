import type { ToastProps } from "./types";

export function Toast({ message, show }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[
        "fixed left-1/2 bottom-28 -translate-x-1/2 bg-green text-bg px-4 py-2.5 font-bowlby text-[11px] tracking-[1.5px] uppercase z-100000 transition-all duration-350 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-w-[90%] text-center pointer-events-none",
        show
          ? "translate-y-0 opacity-100 visible"
          : "translate-y-[140%] opacity-0 invisible",
      ].join(" ")}
    >
      {message}
    </div>
  );
}
