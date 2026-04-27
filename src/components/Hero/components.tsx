import type { HeroProps } from "./types";

export function Hero({
  collapsed,
  itemCount,
  headline1,
  headline2,
  headline3,
  headline4,
  openHours,
  itemsLabel,
}: HeroProps) {
  return (
    <div
      className={[
        "shrink-0 px-4.5 bg-bg overflow-hidden transition-all duration-500 ease-in-out",
        collapsed ? "max-h-0 pt-0 pb-0" : "max-h-50 pt-3.5 pb-2",
      ].join(" ")}
    >
      <h1 className="font-bowlby text-[46px] leading-[0.86] text-green tracking-[-1.5px] uppercase">
        {headline1}
        <br />
        <span className="text-orange">{headline2}</span> &amp;
        <br />
        <span className="[-webkit-text-stroke:2px_#395748] text-transparent">{headline3}</span>
        <br />
        {headline4}
      </h1>
      <div className="mt-2 text-[9px] font-bold tracking-[0.28em] text-green uppercase flex justify-between">
        <span>{openHours}</span>
        <span>
          <b className="text-orange">{itemCount}</b> {itemsLabel}
        </span>
      </div>
    </div>
  );
}
