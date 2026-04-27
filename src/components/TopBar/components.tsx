import Image from "next/image";
import type { TopBarProps } from "./types";

export function TopBar({
  cartCount,
  onCartClick,
  onTopClick,
  brandMain,
  brandAccent,
  brandSub,
  orderLabel,
}: TopBarProps) {
  return (
    <div className="shrink-0 px-4.5 pt-2 pb-2.5 flex items-center justify-between gap-2.5 bg-bg border-b-2 border-green">
      <button type="button" onClick={onTopClick} className="flex items-center gap-2.5 cursor-pointer border-0 bg-transparent p-0">
        <div className="w-[54px] h-[54px] bg-white rounded-full grid place-items-center overflow-hidden shrink-0">
          <Image src="/upperdeck-logo.png" alt="Upperdeck" width={54} height={54} priority />
        </div>
        <div>
          <div className="font-bowlby text-[18px] leading-[0.9] text-green tracking-[-0.5px] uppercase">
            {brandMain}
            <span className="text-orange">{brandAccent}</span>
          </div>
          <div className="text-[8px] tracking-[0.28em] font-bold text-green opacity-80 uppercase mt-0.5">
            {brandSub}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onCartClick}
        className="bg-orange text-white border-0 px-2.75 py-2.25 flex items-center gap-2 font-ui font-extrabold text-[9px] tracking-[0.2em] uppercase cursor-pointer"
      >
        <span>{orderLabel}</span>
        <span className="bg-white text-orange min-w-5 h-5 px-1.25 grid place-items-center font-bowlby text-[11px]">
          {cartCount}
        </span>
      </button>
    </div>
  );
}
