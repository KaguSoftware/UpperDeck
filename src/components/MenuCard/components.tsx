import type { MenuCardProps } from "./types";

export function MenuCard({ card, onOpen, subcategory }: MenuCardProps) {
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
        <button
            type="button"
            data-item={card.id}
            className={[
                "w-full flex items-stretch gap-0 border-2 border-green cursor-pointer text-left transition-transform duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-transform active:scale-[1.02]",
                cardFill,
            ].join(" ")}
            style={insetShadow ? { boxShadow: insetShadow } : undefined}
            onClick={() => onOpen(card)}
        >
            {/* square image/emoji thumbnail */}
            <div className={`shrink-0 w-16 h-16 grid place-items-center overflow-hidden bg-bg-deep${subcategory ? " border-l-2 border-green" : ""}`}>
                {card.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={card.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <span className="text-[28px] leading-none">
                        {card.emoji}
                    </span>
                )}
            </div>

            {/* text */}
            <div
                className={[
                    "flex-1 h-16 flex flex-col justify-center px-3 py-2 min-w-0 overflow-hidden border-l-2",
                    isGreen || isOrange
                        ? "border-green/30"
                        : "border-transparent",
                ].join(" ")}
            >
                <div
                    className={[
                        "font-bowlby text-[13px] uppercase leading-[0.92] tracking-[-0.3px] shrink-0",
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
                            "text-[10px] tracking-[0.03em] font-normal mt-0.5 leading-[1.35] overflow-hidden line-clamp-2",
                            descColor,
                        ].join(" ")}
                    >
                        {card.desc}
                    </div>
                )}
            </div>

            {/* price */}
            <div className="shrink-0 flex items-center pr-3.5">
                <span className="font-ui font-extrabold text-[13px] whitespace-nowrap text-orange">
                    {card.price} ₺
                </span>
            </div>
        </button>
    );
}
