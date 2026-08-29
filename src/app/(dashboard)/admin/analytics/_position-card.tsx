"use client";

import { useMemo, useState } from "react";
import type { CategoryPosition, MenuPositionAnalysis, PositionItem } from "@/lib/analytics/menu-position";

/**
 * "Does menu position sell?" — the card for the one lever that costs nothing.
 *
 * ── Why this is a tile grid and not a stack of ladders ───────────────────────
 *
 * The first build rendered every category's full ladder at once. On a real menu
 * (8–12 categories × up to 20 items) that is several screens of bars inside a
 * page that already has ~24 cards, and the reader has to scroll the whole thing
 * to discover that only one category has anything to say.
 *
 * So the card is now a DASHBOARD: one compact tile per category showing just the
 * verdict and a sparkline of its slot profile, and a single expanded panel below
 * for whichever tile is selected. Overview stays constant-height regardless of
 * menu size; the detail is one tap away and only ever renders once.
 *
 * Design decisions worth stating, because each replaced an obvious-but-worse option:
 *
 *  • THE LADDER, NOT A SCATTER PLOT. The natural chart for two ordinal variables is
 *    a scatter with a fitted line, and it is the wrong instrument here: it asks the
 *    reader to map a dot back to a product name, and it renders a correlation as
 *    something that looks like a trend line through causation. The ladder instead
 *    IS the menu — rungs in the order the diner sees them, each rung's bar showing
 *    what that slot sold.
 *
 *  • THE GAP IS THE POINT. A bar chart of units per slot shows what sold; it can't
 *    show what SHOULD have sold from that slot. Each rung therefore carries its
 *    rank-gap marker: how many places the item's sales rank differs from its menu
 *    rank. That single number is the whole recommendation.
 *
 *  • NO CAUSAL LANGUAGE ANYWHERE. Position and sales are correlated; a popular dish
 *    is often placed high BECAUSE it is popular, which produces the same ρ as
 *    placement driving sales. The copy says "ilişkili" (related), never "yüzünden"
 *    (because of).
 */

const tl = new Intl.NumberFormat("tr-TR");

/** Brand tokens, mirrored from globals.css for inline styles. */
const GREEN = "#395A66";
const ORANGE = "#FF5138";

/**
 * Strength bands for |ρ|. Thresholds are the conventional social-science reading
 * (0.1 / 0.3 / 0.5) rather than invented, so "güçlü" means the same thing here as
 * it does anywhere else the owner might check.
 */
function strengthLabel(rho: number): string {
  const a = Math.abs(rho);
  if (a >= 0.5) return "güçlü";
  if (a >= 0.3) return "orta";
  if (a >= 0.1) return "zayıf";
  return "yok denecek kadar az";
}

/**
 * The headline sentence. Written as a full clause, not a stat, because the owner's
 * question is "should I move things?" and a bare ρ never answers it.
 */
function verdict(a: MenuPositionAnalysis): { line: string; tone: "up" | "down" | "flat" } {
  if (!a.significant) {
    return {
      line: "Menüdeki sıra ile satış arasında anlamlı bir ilişki bulunamadı — bu dönemde sıralama satışı belirlemiyor görünüyor.",
      tone: "flat",
    };
  }
  if (a.direction === "top-sells") {
    return {
      line: `Üst sıradaki ürünler belirgin şekilde daha çok satıyor (${strengthLabel(a.overallRho)} ilişki). Yukarı taşımak, ücretsiz bir tanıtım alanı demek.`,
      tone: "up",
    };
  }
  return {
    line: `Alt sıradaki ürünler daha çok satıyor (${strengthLabel(a.overallRho)} ilişki). Sıralama satışı sürüklemiyor — muhtemelen menünün sonundaki ürünler kendi başına güçlü.`,
    tone: "down",
  };
}

/** How many actionable items a category holds — drives the tile's badge. */
function flagCount(cat: CategoryPosition): number {
  return cat.items.filter((i) => Math.abs(i.rankGap) >= 3).length;
}

/**
 * Slot profile: one micro-bar per slot, in menu order, height = units sold.
 *
 * Not a sparkline in the line-chart sense — the x axis is position, not time, so
 * connecting the points would imply a sequence that doesn't exist. Bars keep each
 * slot discrete while still showing the section's shape at a glance: a left-heavy
 * profile means the top of that category sells, and that reads at 60px wide.
 */
function SlotProfile({ cat }: { cat: CategoryPosition }) {
  const max = Math.max(...cat.items.map((i) => i.qty), 1);
  return (
    <span aria-hidden className="flex items-end gap-px h-6 w-full min-w-0">
      {cat.items.map((i) => {
        const flagged = Math.abs(i.rankGap) >= 3;
        return (
          <span
            key={i.id}
            className="flex-1 min-w-px transition-[height] duration-500 ease-out"
            style={{
              height: `${Math.max(8, (i.qty / max) * 100)}%`,
              backgroundColor: flagged && i.rankGap < 0 ? ORANGE : GREEN,
              opacity: flagged ? 1 : 0.3,
            }}
          />
        );
      })}
    </span>
  );
}

/**
 * One category tile: the whole category compressed to a button.
 *
 * Carries only what decides whether to open it — name, item count, direction, and
 * how many items are mispositioned. Everything else lives in the detail panel.
 */
function CategoryTile({
  cat,
  active,
  onSelect,
}: {
  cat: CategoryPosition;
  active: boolean;
  onSelect: () => void;
}) {
  const flags = flagCount(cat);
  const dir = cat.significant ? (cat.rho < 0 ? "üst satıyor" : "alt satıyor") : "ilişki yok";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={active}
      className={[
        "text-left p-2.5 border-2 min-w-0 cursor-pointer transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange",
        active ? "border-green bg-green/5" : "border-green/25 bg-transparent hover:border-green/60",
      ].join(" ")}
    >
      <span className="flex items-baseline justify-between gap-1.5 min-w-0">
        <span className="text-[10px] tracking-[0.12em] font-extrabold text-ink uppercase truncate min-w-0">
          {cat.categoryName}
        </span>
        {flags > 0 && (
          <span
            className="shrink-0 px-1 py-0.5 bg-orange text-white font-ui font-extrabold text-[9px] leading-none tabular-nums"
            title={`${flags} ürün bulunduğu sıraya göre beklenmedik satıyor`}
          >
            {flags}
          </span>
        )}
      </span>

      <span className="mt-1.5 block">
        <SlotProfile cat={cat} />
      </span>

      <span className="mt-1 flex items-baseline justify-between gap-1.5 text-[9px] font-bold tabular-nums">
        <span className={cat.significant ? "text-green" : "text-green/40"}>{dir}</span>
        <span className="text-green/40">{cat.items.length} ürün</span>
      </span>
    </button>
  );
}

/**
 * One rung of the expanded ladder.
 *
 * The bar is sized against the category's BEST seller, not the global best: a
 * starters section whose top item sells 40 units would otherwise render as a row
 * of stubs beside a mains section selling 300, and the within-category comparison
 * is the only one that means anything.
 */
function Rung({ item, max, showGap }: { item: PositionItem; max: number; showGap: boolean }) {
  const pct = max > 0 ? (item.qty / max) * 100 : 0;
  const gap = item.rankGap;
  // Only flag gaps that clear the noise floor the analysis itself uses.
  const notable = showGap && Math.abs(gap) >= 3;
  const buried = notable && gap < 0;

  return (
    // The bar encodes quantity as width and "buried" as color, neither of which
    // reaches a screen reader — so the row states the same facts in one label.
    <li
      className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 py-0.5"
      aria-label={`${item.name}: menüde ${item.rank}. sırada, ${tl.format(item.qty)} adet satıldı, satış sıralamasında ${item.salesRank}.`}
    >
      {/* Slot number — the menu's own coordinate, so the owner can find the row.
          The row's aria-label already states all of this, so the visual layer below
          is presentational: the triangles in particular are announced literally
          ("black up-pointing triangle") when left exposed. */}
      <span
        aria-hidden
        className={[
          "font-ui font-extrabold text-[9px] leading-none tabular-nums text-center py-0.5",
          buried ? "bg-orange text-white" : "bg-green/10 text-green/70",
        ].join(" ")}
      >
        {item.rank}
      </span>

      <span className="min-w-0">
        <span className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[11px] font-bold text-ink truncate min-w-0" title={item.name}>
            {item.name}
          </span>
          {notable && (
            <span
              aria-hidden
              className={[
                "shrink-0 font-ui font-extrabold text-[9px] leading-none px-1 tabular-nums",
                buried ? "bg-orange/15 text-orange" : "bg-green/10 text-green/60",
              ].join(" ")}
              title={
                buried
                  ? `Satışta ${item.salesRank}. sırada ama menüde ${item.rank}. sırada — ${Math.abs(gap)} basamak aşağıda duruyor`
                  : `Menüde ${item.rank}. sırada ama satışta ${item.salesRank}. sırada — iyi bir yeri hak ettiğinden az kullanıyor`
              }
            >
              {buried ? `▲${Math.abs(gap)}` : `▼${gap}`}
            </span>
          )}
        </span>
        <span className="mt-0.5 block h-1 bg-green/8" aria-hidden>
          <span
            className="block h-full transition-[width] duration-500 ease-out"
            style={{
              width: `${Math.max(pct, item.qty > 0 ? 2 : 0)}%`,
              backgroundColor: buried ? ORANGE : GREEN,
              opacity: buried ? 1 : 0.55,
            }}
          />
        </span>
      </span>

      <span className="text-[10px] font-extrabold tabular-nums text-green/70 shrink-0 text-right">
        {tl.format(item.qty)}
      </span>
    </li>
  );
}

/** The expanded panel for the selected category: its full ladder, nothing else. */
function CategoryDetail({ cat }: { cat: CategoryPosition }) {
  const max = Math.max(...cat.items.map((i) => i.qty), 0);
  return (
    <div className="mt-3 border-2 border-green p-3 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-[11px] tracking-[0.14em] font-extrabold text-ink uppercase truncate min-w-0">
          {cat.categoryName}
        </span>
        <span
          className="shrink-0 text-[9px] font-bold text-green/50 tabular-nums"
          title="Spearman sıra korelasyonu ve anlamlılık değeri"
        >
          ρ {cat.rho.toFixed(2)} · p {cat.pValue < 0.001 ? "<0,001" : cat.pValue.toFixed(3)}
        </span>
      </div>
      <ul className="min-w-0">
        {cat.items.map((i) => (
          <Rung key={i.id} item={i} max={max} showGap={cat.items.length >= 6} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The two action lists, merged into one compact block.
 *
 * Previously two bordered cards stacked vertically, each with its own heading and
 * hint paragraph — roughly 10 lines of chrome for what is usually 2–3 item names.
 * One list with a direction marker per row carries the same information in a
 * third of the height.
 */
function Actions({ buried, squatters }: { buried: PositionItem[]; squatters: PositionItem[] }) {
  const rows = [
    ...buried.map((i) => ({ item: i, up: true })),
    ...squatters.map((i) => ({ item: i, up: false })),
  ];
  if (!rows.length) return null;

  return (
    <ul className="flex flex-col gap-1 mb-3 min-w-0">
      {rows.map(({ item, up }) => (
        <li
          key={item.id}
          className="flex items-baseline gap-2 min-w-0 text-[11px]"
          aria-label={`${item.name}, ${item.categoryName} kategorisinde ${item.rank}. sırada, satışta ${item.salesRank}. — ${up ? "yukarı taşı" : "sırayı değerlendir"}`}
        >
          <span
            aria-hidden
            className={[
              "shrink-0 px-1 py-0.5 font-ui font-extrabold text-[9px] leading-none",
              up ? "bg-orange text-white" : "bg-green/70 text-white",
            ].join(" ")}
          >
            {up ? "▲" : "▼"}
          </span>
          <span className="font-bold text-ink truncate min-w-0" title={item.name}>
            {item.name}
          </span>
          <span className="shrink-0 ml-auto tabular-nums text-green/50">
            {item.categoryName} · {item.rank}→{item.salesRank}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MenuPositionCard({ analysis }: { analysis: MenuPositionAnalysis }) {
  const v = useMemo(() => verdict(analysis), [analysis]);
  // Default to the category with the most mispositioned items — the one worth
  // opening. Null only when nothing is flagged anywhere.
  const [selected, setSelected] = useState<string | null>(() => {
    const best = [...analysis.categories].sort((a, b) => flagCount(b) - flagCount(a))[0];
    return best && flagCount(best) > 0 ? (best.categoryId ?? best.categoryName) : null;
  });

  // Not enough matched items to say anything. Explain what unlocks it rather than
  // rendering an empty grid that reads as broken.
  if (!analysis.hasData) {
    return (
      <section className="border-2 border-green bg-white p-4 sm:p-5 shadow-hard">
        <h3 className="flex items-start gap-2 text-[11px] tracking-[0.2em] font-extrabold text-green/70 uppercase mb-3">
          <span aria-hidden className="size-1.5 bg-orange shrink-0 mt-[0.35em]" />
          Menü Sırası × Satış
        </h3>
        <p className="text-[13px] text-ink leading-relaxed">
          Bu bölüm, menüdeki <b>sıranın</b> satışla ilişkili olup olmadığını ölçer — ürünleri yukarı taşımak
          ücretsizdir, o yüzden işe yarıyorsa en ucuz kaldıraçtır.
        </p>
        <p className="mt-2 text-[12px] text-green/60 font-bold leading-relaxed">
          {analysis.coverage.soldItems > 0
            ? `Bu dönemde satılan ${tl.format(analysis.coverage.soldItems)} üründen yalnızca ${tl.format(
                analysis.coverage.matchedItems
              )} tanesi menüdeki bir ürünle eşleşti — ölçüm için her kategoride en az 4 eşleşen ürün gerekiyor.`
            : "Bu dönem için ürün bazında gerçek satış verisi yok."}
        </p>
      </section>
    );
  }

  const toneChip =
    v.tone === "up"
      ? "bg-orange text-white"
      : v.tone === "down"
        ? "bg-green text-white"
        : "bg-green/20 text-green";

  const active = analysis.categories.find((c) => (c.categoryId ?? c.categoryName) === selected) ?? null;

  return (
    <section className="border-2 border-green bg-white p-4 sm:p-5 shadow-hard">
      <h3 className="flex items-start gap-2 text-[11px] tracking-[0.2em] font-extrabold text-green/70 uppercase mb-3">
        <span aria-hidden className="size-1.5 bg-orange shrink-0 mt-[0.35em]" />
        Menü Sırası × Satış
      </h3>

      {/* The verdict, first and in plain Turkish. The statistic sits inline as
          support, never as the headline — ρ is evidence, not the finding. */}
      <div className="flex items-start gap-2 mb-1">
        <span
          className={`shrink-0 px-1.5 py-1 font-ui font-extrabold text-[10px] leading-none tabular-nums ${toneChip}`}
          title="Spearman sıra korelasyonu"
        >
          ρ {analysis.overallRho.toFixed(2)}
        </span>
        <p className="text-[12px] text-ink leading-snug min-w-0">{v.line}</p>
      </div>
      <p className="mb-3 text-[10px] font-bold text-green/45 tabular-nums">
        {tl.format(analysis.coverage.matchedItems)} ürün · {tl.format(analysis.coverage.usableCategories)}{" "}
        kategori · p = {analysis.overallP < 0.001 ? "<0,001" : analysis.overallP.toFixed(3)}
        {!analysis.coverage.reliable && (
          <span className="text-orange">
            {" "}
            · dönem satışının %{Math.round(analysis.coverage.revenueRatio * 100)}&apos;ini kapsıyor
          </span>
        )}
      </p>

      {/* Actions before evidence: the owner needs the names more than the ladders. */}
      <Actions buried={analysis.buriedWinners} squatters={analysis.squatters} />

      {/* The dashboard. Auto-fit keeps tiles a readable width at any menu size
          rather than squeezing 12 categories into 12 slivers. */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(9.5rem, 1fr))" }}
      >
        {analysis.categories.map((c) => {
          const key = c.categoryId ?? c.categoryName;
          return (
            <CategoryTile
              key={key}
              cat={c}
              active={key === selected}
              // Tapping the open tile closes it, so the card can return to pure
              // overview height without a separate "collapse" control.
              onSelect={() => setSelected((cur) => (cur === key ? null : key))}
            />
          );
        })}
      </div>

      {active && <CategoryDetail cat={active} />}

      {/* The caveat. Stated in the card, not hidden in a tooltip, because it is the
          difference between a true reading and a confident wrong one. */}
      <p className="mt-3 pt-2.5 border-t border-green/15 text-[10px] text-green/50 leading-relaxed">
        <b className="text-green/65">Nasıl okunur:</b> sıralar <b>bugünkü</b> menü düzeninden alınır, satışlar
        ise seçili dönemden. Dönem içinde menüyü yeniden sıraladıysan bu karşılaştırma o değişikliği bilemez.
        İlişki nedensellik değildir: çok satan bir ürün zaten yukarı konmuş olabilir, bu da aynı sonucu üretir.
      </p>
    </section>
  );
}
