import type { FilterPillsProps } from "./types";
import { ALL_CATEGORY } from "./constants";

export function FilterPills({ categories, active, onSelect }: FilterPillsProps) {
  return (
    <nav className="shrink-0 py-2.5 pl-4.5 bg-bg border-t-2 border-b-2 border-green flex gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {categories.map((cat, i) => {
        const isActive = cat === active;
        const isAccent = i === 0 && cat === ALL_CATEGORY;
        return (
          <button
            key={cat}
            type="button"
            data-cat={cat}
            onClick={(e) => onSelect(cat, e.currentTarget)}
            className={[
              "shrink-0 border-2 px-3 py-1.75 font-ui font-extrabold text-[9px] tracking-[0.16em] uppercase cursor-pointer",
              isAccent && isActive
                ? "bg-orange border-orange text-white"
                : isActive
                ? "bg-green border-green text-bg"
                : "bg-transparent border-green text-green",
            ].join(" ")}
          >
            {cat}
          </button>
        );
      })}
      <span className="shrink-0 w-4.5" aria-hidden />
    </nav>
  );
}
