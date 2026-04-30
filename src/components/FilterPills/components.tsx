import type { FilterPillsProps } from "./types";

export function FilterPills({ items, activeId, onSelect, navRef, compact }: FilterPillsProps) {
  return (
    <nav ref={navRef} className="shrink-0 py-2 pl-2.5 bg-bg border-t-2 border-b-2 border-green flex gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map(({ id, label, image_url, emoji }) => {
        const isActive = id === activeId;
        return (
          <button
            key={id}
            type="button"
            data-cat={id}
            onClick={(e) => onSelect(id, e.currentTarget)}
            className={[
              "shrink-0 border-2 flex flex-col items-center gap-0 font-ui font-extrabold text-[9px] tracking-[0.16em] uppercase cursor-pointer overflow-hidden transition-all duration-300",
              isActive
                ? "bg-green border-green text-bg"
                : "bg-transparent border-green text-green",
            ].join(" ")}
          >
            {/* thumbnail — collapses to 0 height when compact */}
            <div
              className="w-24 overflow-hidden flex items-center justify-center bg-bg-deep transition-all duration-300"
              style={{ height: compact ? 0 : 56 }}
            >
              {image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[20px] leading-none">{emoji ?? "🍽"}</span>
              )}
            </div>
            <span className="w-24 px-2 py-1 text-center leading-[1.4] wrap-break-word flex-1 flex items-center justify-center">{label}</span>
          </button>
        );
      })}
      <span className="shrink-0 w-2.5" aria-hidden />
    </nav>
  );
}
