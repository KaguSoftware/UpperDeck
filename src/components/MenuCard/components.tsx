import { BrandImage } from "@/components/BrandImage/components";
import type { MenuCardProps } from "./types";

function preloadModalImage(url: string | null) {
  if (!url) return;
  const src = `/_next/image?url=${encodeURIComponent(url)}&w=384&q=80`;
  const img = new window.Image();
  img.src = src;
}

export function MenuCard({ card, onOpen }: MenuCardProps) {
    const isGreen = card.fill === "green-fill";
    const isOrange = card.fill === "orange-fill";

    const cardFill = isOrange ? "bg-orange/10" : isGreen ? "bg-green/10" : "bg-white";
    const insetShadow = isGreen
        ? "inset 0 0 0 4px rgba(57,87,72,0.25)"
        : isOrange
        ? "inset 0 0 0 4px rgba(227,93,7,0.2)"
        : undefined;

    const nameColor = "text-green";
    const descColor = "text-green opacity-[0.72]";

    return (
        <>
        <button
            type="button"
            data-item={card.id}
            className={[
                "w-full flex items-stretch gap-0 border border-green cursor-pointer text-left transition-transform duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-transform active:scale-[1.02]",
                cardFill,
            ].join(" ")}
            style={insetShadow ? { boxShadow: insetShadow } : undefined}
            onTouchStart={() => preloadModalImage(card.image_url)}
            onMouseEnter={() => preloadModalImage(card.image_url)}
            onClick={() => onOpen(card)}
        >
            {/* square image/emoji thumbnail */}
            <div className="relative shrink-0 w-32 h-32 grid place-items-center overflow-hidden bg-bg-deep">
                {card.image_url ? (
                    <BrandImage
                        src={card.image_url}
                        alt={card.name}
                        width={128}
                        height={128}
                        className="w-full h-full object-cover"
                        loaderSize="sm"
                        fallback={
                            <span className="text-[28px] leading-none">
                                {card.emoji}
                            </span>
                        }
                    />
                ) : (
                    <span className="text-[28px] leading-none">
                        {card.emoji}
                    </span>
                )}
                {card.sold_out && (
                    <div
                        aria-label="Sold out"
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        style={{ transform: "rotate(-15deg)" }}
                    >
                        <div
                            style={{
                                border: "3px solid #CC2222",
                                padding: "3px",
                                opacity: 0.88,
                                mixBlendMode: "multiply",
                            }}
                        >
                            <div
                                style={{
                                    border: "1.5px solid #CC2222",
                                    padding: "4px 10px",
                                }}
                            >
                                <span
                                    style={{
                                        color: "#CC2222",
                                        fontFamily: "var(--font-bowlby, Impact, sans-serif)",
                                        fontSize: "18px",
                                        fontWeight: 900,
                                        letterSpacing: "0.18em",
                                        textTransform: "uppercase",
                                        lineHeight: 1,
                                        display: "block",
                                        textShadow: "0 0 4px rgba(255,255,255,0.95), 0 0 6px rgba(255,255,255,0.7)",
                                    }}
                                >
                                    SOLD OUT
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* text */}
            <div
                className={[
                    "flex-1 h-32 flex flex-col justify-center px-3 py-2 min-w-0 overflow-hidden",
                    "",
                ].join(" ")}
            >
                <div
                    className={[
                        "font-bowlby text-[17px] uppercase leading-[0.92] tracking-[-0.3px] shrink-0",
                        nameColor,
                    ].join(" ")}
                >
                    {card.name}
                    {card.spicy && (
                        <span
                            className={[
                                "ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px]",
                                isGreen ? "bg-orange" : "bg-green",
                            ].join(" ")}
                        >
                            🌶
                        </span>
                    )}
                </div>
                {card.desc && (
                    <div
                        className={[
                            "text-[13px] tracking-[0.03em] font-normal mt-0.5 leading-[1.35] overflow-hidden line-clamp-2",
                            descColor,
                        ].join(" ")}
                    >
                        {card.desc}
                    </div>
                )}
            </div>

            {/* price */}
            <div className="shrink-0 flex flex-col items-end justify-center pr-3.5 gap-0.5">
                {card.discountPct ? (
                    <>
                        <span className="font-ui font-extrabold text-[11px] whitespace-nowrap text-green/50 line-through leading-none">
                            {card.price} ₺
                        </span>
                        <span className="font-ui font-extrabold text-[13px] whitespace-nowrap text-orange leading-none">
                            {Math.round(card.price * (1 - card.discountPct / 100))} ₺
                        </span>
                        <span className="font-ui font-extrabold text-[9px] tracking-[0.12em] uppercase text-orange/70 leading-none">
                            -{card.discountPct}%
                        </span>
                    </>
                ) : (
                    <span className="font-ui font-extrabold text-[13px] whitespace-nowrap text-orange">
                        {card.price} ₺
                    </span>
                )}
            </div>
        </button>
        </>
    );
}
