import type { TickerProps } from "./types";

export function Ticker({ tags }: TickerProps) {
  const tripled = [...tags, ...tags, ...tags];

  return (
    <div className="shrink-0 h-8 bg-green-dark text-bg overflow-hidden whitespace-nowrap z-999 flex items-center border-t-2 border-orange relative">
      <div
        className="inline-flex gap-6 pl-6 whitespace-nowrap font-ui font-extrabold text-[9px] tracking-[0.28em] uppercase animate-[tick_22s_linear_infinite] will-change-transform"
      >
        {tripled.map((tag, i) => (
          <span key={i} className="shrink-0 after:content-['_✱'] after:text-orange after:ml-6">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
