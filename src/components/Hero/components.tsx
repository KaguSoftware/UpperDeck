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
  heroMode = "none",
  heroMediaUrl,
  heroMediaType,
  featuredItem,
  featuredLabel,
  featuredBadge,
  featuredDiscount,
  onFeaturedClick,
}: HeroProps) {

  if (heroMode === "media" && heroMediaUrl) {
    return (
      <div
        className={[
          "shrink-0 bg-bg overflow-hidden transition-all duration-500 ease-in-out px-0",
          collapsed ? "max-h-0" : "max-h-56",
        ].join(" ")}
      >
        <div className="relative w-full h-44 overflow-hidden">
          {heroMediaType === "video" ? (
            <video src={heroMediaUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroMediaUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>
      </div>
    );
  }

  if (heroMode === "featured" && featuredItem) {
    const marqueeLine = featuredLabel?.trim() || featuredItem.name;
    const tripled = [marqueeLine, marqueeLine, marqueeLine];
    const hasDiscount = featuredDiscount != null && featuredDiscount > 0 && featuredItem.price != null;
    const discountedPrice = hasDiscount
      ? Math.round(featuredItem.price! * (1 - featuredDiscount! / 100))
      : null;

    return (
      <div
        className={[
          "shrink-0 bg-bg overflow-hidden transition-all duration-500 ease-in-out flex flex-col",
          collapsed ? "max-h-0" : "max-h-72",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={onFeaturedClick}
          className="relative w-full h-44 shrink-0 overflow-hidden block cursor-pointer"
        >
          {featuredItem.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={featuredItem.image_url} alt={featuredItem.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-bg-deep flex items-center justify-center">
              <span className="text-[72px] leading-none">{featuredItem.emoji}</span>
            </div>
          )}

          {featuredBadge && (
            <div className="absolute bottom-1 right-1 bg-orange px-3 py-1.5">
              <span className="font-ui font-extrabold text-[9px] tracking-[0.22em] uppercase text-white">
                {featuredBadge}
              </span>
            </div>
          )}
        </button>

        <div className="h-8 bg-green-dark text-bg overflow-hidden whitespace-nowrap flex items-center border-t-2 border-green">
          <div className="inline-flex gap-8 pl-8 whitespace-nowrap font-ui font-extrabold text-[9px] tracking-[0.28em] uppercase animate-[tick_18s_linear_infinite] will-change-transform">
            {tripled.map((line, i) => (
              <span key={i} className="shrink-0 after:content-['_✦'] after:text-orange after:ml-8">
                {line}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // heroMode === "none" — default text banner
  return (
    <div
      className={[
        "shrink-0 bg-bg overflow-hidden transition-all duration-500 ease-in-out px-4.5",
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
