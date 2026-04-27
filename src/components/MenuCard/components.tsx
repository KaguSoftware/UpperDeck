import type { MenuCardProps } from "./types";
import { BLOB_BG_BY_FILL } from "./constants";

const NAME_SIZE: Record<string, string> = {
  "size-s": "text-[11px]",
  "size-m": "text-[13px]",
  "size-l": "text-[16px]",
};

export function MenuCard({ card, index, onOpen }: MenuCardProps) {
  const blobBg = BLOB_BG_BY_FILL[card.fill];

  const isGreen = card.fill === "green-fill";
  const isOrange = card.fill === "orange-fill";

  const cardBase =
    "w-full h-full text-ink p-2 border-2 border-green cursor-pointer flex flex-col transition-transform duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-transform active:scale-[1.04] active:rotate-0";
  const cardFill = isGreen
    ? "bg-green border-green"
    : isOrange
    ? "bg-orange border-orange"
    : "bg-white";

  const nameColor = isGreen
    ? "text-bg"
    : isOrange
    ? "text-white"
    : "text-green";

  const descColor = isGreen
    ? "text-bg opacity-85"
    : isOrange
    ? "text-white opacity-95"
    : "text-green opacity-[0.82]";

  return (
    <div
      className="absolute"
      style={{
        left: card.x,
        top: card.y,
        width: card.w,
        height: card.h,
        transform: `rotate(${card.rot}deg)`,
        zIndex: index,
      }}
    >

      <button
        type="button"
        className={[cardBase, cardFill, card.spicy ? "spicy" : ""].filter(Boolean).join(" ")}
        style={{ position: "relative" }}
        onClick={() => onOpen(card)}
      >
        <div className="w-full aspect-square grid place-items-center relative overflow-hidden mb-1.5">
          <div className="absolute inset-[6%]" style={{ background: blobBg }} />
          {card.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.image_url}
              alt=""
              className="relative w-full h-full object-cover"
            />
          ) : (
            <span className="relative text-[40px] leading-none">{card.emoji}</span>
          )}
        </div>
        <div
          className={[
            "font-bowlby uppercase leading-[0.92] tracking-[-0.3px] mb-1",
            nameColor,
            NAME_SIZE[card.sz],
          ].join(" ")}
        >
          {card.name}
        </div>
        <div className="flex justify-between items-end mt-auto gap-1">
          <span className={["text-[7px] tracking-[0.06em] font-semibold lowercase", descColor].join(" ")}>
            {card.hook}
          </span>
          <span
            className={[
              "font-ui font-extrabold text-[9px] text-orange whitespace-nowrap",
              isOrange ? "bg-white text-orange px-1 py-px" : "",
            ].join(" ")}
          >
            {card.price} ₺
          </span>
        </div>
        {card.spicy && (
          <span className={["absolute -top-3 -right-3 w-9 h-9 rounded-full grid place-items-center text-[18px] leading-none shadow-md", isGreen ? "bg-orange" : "bg-green"].join(" ")}>
            🌶
          </span>
        )}
      </button>
    </div>
  );
}
