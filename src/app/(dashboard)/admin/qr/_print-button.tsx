"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="font-ui text-[11px] uppercase tracking-[0.18em] border-2 border-green text-green px-4 py-2 hover:bg-green hover:text-bg transition-colors"
    >
      Yazdır
    </button>
  );
}
