import type { HeroProps } from "./types";
import { OPEN_HOURS } from "./constants";

export function Hero({ collapsed, itemCount }: HeroProps) {
  return (
    <div
      className={[
        "shrink-0 px-4.5 bg-bg overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        collapsed ? "max-h-0 pt-0 pb-0" : "max-h-60 pt-3.5 pb-2",
      ].join(" ")}
    >
      <h1
        className={[
          "font-bowlby text-[46px] leading-[0.86] text-green tracking-[-1.5px] uppercase transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          collapsed ? "opacity-0" : "opacity-100",
        ].join(" ")}
      >
        Burgers,
        <br />
        <span className="text-orange">waffles</span> &amp;
        <br />
        <span className="[-webkit-text-stroke:2px_#395748] text-transparent">whatever</span>
        <br />
        else.
      </h1>
      <div
        className={[
          "text-[9px] font-bold tracking-[0.28em] text-green uppercase flex justify-between transition-all duration-250 ease",
          collapsed ? "opacity-0 mt-0" : "opacity-100 mt-2",
        ].join(" ")}
      >
        <span>{OPEN_HOURS}</span>
        <span>
          <b className="text-orange">{itemCount}</b> items
        </span>
      </div>
    </div>
  );
}
