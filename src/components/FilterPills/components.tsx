import type { FilterPillsProps } from "./types";

export function FilterPills({ items, activeId, onSelect, navRef }: FilterPillsProps) {
  return (
    <nav ref={navRef} className="shrink-0 py-2.5 pl-4.5 bg-bg border-t-2 border-b-2 border-green flex gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map(({ id, label }) => {
        const isActive = id === activeId;
        return (
          <button
            key={id}
            type="button"
            data-cat={id}
            onClick={(e) => onSelect(id, e.currentTarget)}
            className={[
              "shrink-0 border-2 px-3 py-1.75 font-ui font-extrabold text-[9px] tracking-[0.16em] uppercase cursor-pointer",
              isActive
                ? "bg-green border-green text-bg"
                : "bg-transparent border-green text-green",
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
      <span className="shrink-0 w-4.5" aria-hidden />
    </nav>
  );
}
