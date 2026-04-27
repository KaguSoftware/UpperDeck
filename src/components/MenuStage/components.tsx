import { useMemo } from "react";
import { mulberry32, hashStr } from "@/lib/rng";
import { MenuCard } from "@/components/MenuCard/components";
import type { PlacedCard, Size, Fill } from "@/components/MenuCard/types";
import type { MenuItem, MenuStageProps, LayoutResult } from "./types";
import { SIZE_PX, MIN_GAP, MAX_GAP, SIDE_MARGIN, ROTATION_RANGE, Y_JITTER } from "./constants";

function pickSize(rand: () => number): Size {
  const r = rand();
  if (r < 0.25) return "size-l";
  if (r < 0.7) return "size-m";
  return "size-s";
}

function pickFill(rand: () => number): Fill {
  const r = rand();
  if (r < 0.12) return "green-fill";
  if (r < 0.22) return "orange-fill";
  return "";
}

function layoutSection(items: MenuItem[], seed: number, stageW: number): LayoutResult {
  const rand = mulberry32(seed);
  const usableW = stageW - SIDE_MARGIN * 2;

  const rows: (MenuItem & { sz: Size; fill: Fill; rot: number; w: number; h: number })[][] = [];
  let cur: typeof rows[0] = [];
  let curW = 0;

  for (const item of items) {
    const sz = pickSize(rand);
    const { w, h } = SIZE_PX[sz];
    const fill: Fill = item.highlight ?? pickFill(rand);
    const rot = rand() * ROTATION_RANGE * 2 - ROTATION_RANGE;
    const card = { ...item, sz, fill, rot, w, h };
    const projW = curW + (cur.length ? MIN_GAP : 0) + w;
    if (cur.length && projW > usableW) {
      rows.push(cur);
      cur = [];
      curW = 0;
    }
    cur.push(card);
    curW += (cur.length > 1 ? MIN_GAP : 0) + w;
  }
  if (cur.length) rows.push(cur);

  const placed: PlacedCard[] = [];
  let y = 14;

  for (const row of rows) {
    const totalCardW = row.reduce((s, c) => s + c.w, 0);
    const gaps = Math.max(row.length - 1, 1);
    const gap =
      row.length > 1
        ? Math.min(MAX_GAP, Math.max(MIN_GAP, (usableW - totalCardW) / gaps))
        : 0;
    const usedW = totalCardW + gap * gaps;
    const startX = SIDE_MARGIN + (usableW - usedW) / 2;

    let x = startX;
    let rowH = 0;
    for (const c of row) {
      const yJitter = rand() * Y_JITTER * 2 - Y_JITTER;
      placed.push({ ...c, x, y: y + yJitter });
      x += c.w + gap;
      rowH = Math.max(rowH, c.h + Math.abs(yJitter));
    }
    y += rowH + MIN_GAP;
  }

  const totalH = placed.length ? Math.max(...placed.map((p) => p.y + p.h)) + 20 : 0;
  return { placed, totalH };
}

export function MenuStage({ stageWidth, onOpen, stageRef, categories, items, itemLabel }: MenuStageProps) {
  const sections = useMemo(() => {
    if (!stageWidth) return [];
    return categories.map(({ slug, name }) => {
      const catItems = items.filter((m) => m.cat === slug);
      const seed = hashStr(slug);
      const { placed, totalH } = layoutSection(catItems, seed, stageWidth);
      return { slug, name, catItems, placed, totalH };
    });
  }, [stageWidth, categories, items]);

  return (
    <div className="relative w-full" ref={stageRef}>
      {sections.map(({ slug, name, catItems, placed, totalH }, secIdx) => (
        <div key={slug}>
          <div
            data-cat={slug}
            className={[
              "relative px-3.5 pb-2.5 flex items-baseline justify-between gap-2.5 border-b-2 border-green bg-bg",
              secIdx === 0 ? "pt-3.5" : "pt-3.5 mt-2 border-t-2",
            ].join(" ")}
          >
            <span className="font-bowlby text-[22px] leading-[0.9] text-green uppercase tracking-[-0.5px]">
              {name}
            </span>
            <span className="font-ui font-extrabold text-[9px] tracking-[0.28em] text-orange uppercase">
              {itemLabel(catItems.length)}
            </span>
          </div>
          <div className="relative w-full" style={{ height: totalH }}>
            {placed.map((card, i) => (
              <MenuCard key={`${slug}-${i}`} card={card} index={i} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
