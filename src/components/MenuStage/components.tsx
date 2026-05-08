"use client";

import { useMemo, useState } from "react";
import { imgUrl } from "@/lib/img";
import { MenuCard } from "@/components/MenuCard/components";
import type { Fill } from "@/components/MenuCard/types";
import type { MenuItem, MenuStageProps } from "./types";

export function MenuStage({ onOpen, stageRef, categories, items, itemLabel, featuredItemId, featuredDiscount }: MenuStageProps) {
  const sections = useMemo(() => {
    return categories.map(({ slug, name, emoji, image_url, subcategories }) => {
      const catItems = items.filter((m) => m.cat === slug);
      const enrich = (item: MenuItem) => ({
        ...item,
        fill: (item.highlight ?? "") as Fill,
        sz: "size-m" as const,
        rot: 0, w: 0, h: 0, x: 0, y: 0,
        discountPct: (featuredItemId && item.id === featuredItemId && featuredDiscount) ? featuredDiscount : null,
      });

      // If there are subcategories, group items by subcat
      let groups: { subName: string | null; cards: ReturnType<typeof enrich>[] }[];
      if (subcategories.length > 0) {
        groups = subcategories
          .map((sub) => ({
            subName: sub.name,
            cards: catItems.filter((m) => m.subcat === sub.slug).map(enrich),
          }))
          .filter((g) => g.cards.length > 0);
        // Items with no subcat (shouldn't happen but safety net)
        const ungrouped = catItems.filter((m) => !m.subcat).map(enrich);
        if (ungrouped.length > 0) groups.push({ subName: null, cards: ungrouped });
      } else {
        groups = [{ subName: null, cards: catItems.map(enrich) }];
      }

      return { slug, name, emoji, image_url, catItems, groups };
    });
  }, [categories, items]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((s) => [s.slug, false]))
  );

  // Sub-group collapse: keyed as `${catSlug}__${gi}`, default collapsed when subcategories exist
  const [subCollapsed, setSubCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const s of sections) {
      s.groups.forEach((g, gi) => {
        if (g.subName) init[`${s.slug}__${gi}`] = true;
      });
    }
    return init;
  });

  return (
    <div className="relative w-full" ref={stageRef}>
      {sections.map(({ slug, name, emoji, image_url, catItems, groups }, secIdx) => {
        const isCollapsed = collapsed[slug] ?? false;
        return (
          <div key={slug}>
            {/* header — always visible, tap to toggle */}
            <div
              data-cat={slug}
              className={[
                "border-green bg-bg",
                secIdx === 0 ? "mt-0 border-t-0" : "mt-2 border-t-2",
              ].join(" ")}
            >
              <button
                type="button"
                className="w-full flex flex-col cursor-pointer text-left"
                onClick={() => setCollapsed((prev) => ({ ...prev, [slug]: !isCollapsed }))}
              >
                {/* category image — full width, 2-card height (160px) */}
                <div className="w-full h-28 overflow-hidden bg-bg-deep flex items-center justify-center">
                  {image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgUrl(image_url, 400) ?? ""} alt="" width={400} height={112} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[40px] leading-none">{emoji ?? "🍽"}</span>
                  )}
                </div>
                {/* name + count row */}
                <div className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 border-b-2 border-green">
                  <span className="font-bowlby text-[22px] leading-[0.9] text-green uppercase tracking-[-0.5px]">
                    {name}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-ui font-extrabold text-[9px] tracking-[0.28em] text-orange uppercase">
                      {itemLabel(catItems.length)}
                    </span>
                    <span className={["text-green font-bowlby text-[14px] transition-transform duration-300", isCollapsed ? "rotate-0" : "rotate-180"].join(" ")}>
                      ▾
                    </span>
                  </div>
                </div>
              </button>
            </div>

            {/* collapsible body — CSS grid trick for smooth animation */}
            <div
              className="grid transition-[grid-template-rows] duration-350 ease-in-out"
              style={{ gridTemplateRows: isCollapsed ? "0fr" : "1fr" }}
            >
              <div className="overflow-hidden">
                <div className="flex flex-col">
                  {groups.map((group, gi) => {
                    const subKey = `${slug}__${gi}`;
                    const isSubCollapsed = subCollapsed[subKey] ?? false;
                    const hasSubName = !!group.subName;
                    return (
                      <div key={gi}>
                        {hasSubName ? (
                          <>
                            {/* subcategory header — tappable to collapse its items */}
                            <button
                              type="button"
                              className="w-full flex items-center justify-between px-3.5 py-2 bg-bg-deep border-b-2 border-t-4 border-green/20 cursor-pointer"
                              onClick={() => setSubCollapsed((prev) => ({ ...prev, [subKey]: !isSubCollapsed }))}
                            >
                              <span className="font-ui font-extrabold text-[13px] tracking-[0.12em] uppercase text-green/70">
                                {group.subName}
                              </span>
                              <span className={["text-green/60 font-bowlby text-[12px] transition-transform duration-300", isSubCollapsed ? "rotate-0" : "rotate-180"].join(" ")}>
                                ▾
                              </span>
                            </button>
                            {/* subcategory items */}
                            <div
                              className="grid transition-[grid-template-rows] duration-300 ease-in-out border-l-4 border-green/20"
                              style={{ gridTemplateRows: isSubCollapsed ? "0fr" : "1fr" }}
                            >
                              <div className="overflow-hidden">
                                <div className="p-4">
                                {group.cards.map((card, i) => (
                                  <MenuCard key={`${slug}-${gi}-${i}`} card={card} index={i} onOpen={onOpen} />
                                ))}
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          group.cards.map((card, i) => (
                            <MenuCard key={`${slug}-${gi}-${i}`} card={card} index={i} onOpen={onOpen} />
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
