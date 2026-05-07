"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { locales } from "@/i18n/config";
import type { Locale } from "@/i18n/config";

const labels: Record<Locale, string> = { en: "EN", tr: "TR" };

export function LocaleSwitcher({ current }: { current: Locale }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function hrefFor(locale: Locale) {
    // Replace /en or /tr segment at the start of the path
    const newPath = pathname.replace(/^\/(en|tr)(\/|$)/, `/${locale}$2`);
    const qs = searchParams.toString();
    return qs ? `${newPath}?${qs}` : newPath;
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 border-0 bg-transparent cursor-pointer p-1 text-green hover:text-orange transition-colors"
        aria-label="Change language"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className="font-ui font-extrabold text-[9px] tracking-[0.18em] uppercase">{labels[current]}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
          <path d="M4 5.5L0.5 2h7z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-bg border-2 border-green z-999999 min-w-18">
          {locales.map((locale) => (
            <a
              key={locale}
              href={hrefFor(locale)}
              onClick={() => setOpen(false)}
              className={[
                "flex items-center gap-1.5 px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase transition-colors whitespace-nowrap",
                locale === current
                  ? "text-orange bg-green/5 cursor-default"
                  : "text-green hover:bg-green hover:text-bg cursor-pointer",
              ].join(" ")}
            >
              <span>{locale === "en" ? "🇬🇧" : "🇹🇷"}</span>
              <span>{locale === "en" ? "EN" : "TR"}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
