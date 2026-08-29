import { BrandImage } from "@/components/BrandImage/components";
import type { FilterPillsProps } from "./types";

export function FilterPills({ items, activeId, onSelect, navRef, compact, lockedIds = [] }: FilterPillsProps) {
  return (
    <div className="relative shrink-0" style={{ overflowAnchor: "none" }}>
    <nav ref={navRef} className="py-2 pl-2.5 bg-bg border-t-2 border-b-2 border-green flex gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map(({ id, label, image_url, emoji }) => {
        const isActive = id === activeId;
        const isLocked = lockedIds.includes(id);
        return (
          <button
            key={id}
            type="button"
            data-cat={id}
            aria-current={isActive ? "true" : undefined}
            onClick={(e) => onSelect(id, e.currentTarget)}
            className={[
              "shrink-0 border-2 flex flex-col items-center gap-0 font-ui font-extrabold text-[9px] tracking-[0.16em] uppercase cursor-pointer overflow-hidden transition-all duration-300",
              isActive
                ? "bg-green border-green text-bg"
                : "bg-transparent border-green text-green",
              isLocked ? "opacity-45 grayscale" : "",
            ].join(" ")}
          >
            {/* thumbnail — collapses to 0 height when compact */}
            <div
              className="relative w-24 overflow-hidden flex items-center justify-center bg-bg-deep transition-all duration-300"
              style={{ height: compact ? 0 : 56 }}
            >
              {image_url ? (
                <BrandImage
                  src={image_url}
                  alt={label}
                  width={96}
                  height={56}
                  className="w-full h-full object-cover"
                  loaderSize="xs"
                  fallback={<span className="text-[20px] leading-none">{emoji ?? "🍽"}</span>}
                />
              ) : (
                <span className="text-[20px] leading-none">{emoji ?? "🍽"}</span>
              )}
            </div>
            <span className="w-24 px-2 py-1 text-center leading-[1.4] wrap-break-word flex-1 flex items-center justify-center">
              {isLocked && <span className="mr-1" aria-hidden>🔒</span>}
              {label}
            </span>
          </button>
        );
      })}
      <span className="shrink-0 w-2.5" aria-hidden />
    </nav>
    {/* right-edge fade to hint at horizontal overflow */}
    <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none" style={{ background: "linear-gradient(to right, transparent, #F6F6F6)" }} aria-hidden />
    </div>
  );
}
