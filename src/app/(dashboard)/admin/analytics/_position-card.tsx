"use client";

import { useMemo, useState } from "react";
import type { CategoryPosition, MenuPositionAnalysis, PositionItem } from "@/lib/analytics/menu-position";

/**
 * "Does menu position sell?" — the card for the one lever that costs nothing.
 *
 * Design decisions worth stating, because each replaced an obvious-but-worse option:
 *
 *  • THE LADDER, NOT A SCATTER PLOT. The natural chart for two ordinal variables is
 *    a scatter with a fitted line, and it is the wrong instrument here: it asks the
 *    reader to map a dot back to a product name, and it renders a correlation as
 *    something that looks like a trend line through causation. The ladder instead
 *    IS the menu — rungs in the order the diner sees them, each rung's bar showing
 *    what that slot sold. The shape of the menu and the shape of the sales sit in
 *    the same column, so "top-heavy" is read directly rather than inferred.
 *
 *  • THE GAP IS THE POINT. A bar chart of units per slot shows what sold; it can't
 *    show what SHOULD have sold from that slot. Each rung therefore carries its
 *    rank-gap marker: how many places the item's sales rank differs from its menu
 *    rank. That single number is the whole recommendation — negative means "you
 *    buried a winner", positive means "this slot is being wasted".
 *
 *  • NO CAUSAL LANGUAGE ANYWHERE. Position and sales are correlated; a popular dish
 *    is often placed high BECAUSE it is popular, which produces the same ρ as
 *    placement driving sales. The copy says "ilişkili" (related), never "yüzünden"
 *    (because of), and the card states the reverse-causation caveat in plain words
 *    rather than in a footnote nobody reads.
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

/**
 * One rung of the ladder.
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
      className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3 py-1"
      aria-label={`${item.name}: menüde ${item.rank}. sırada, ${tl.format(item.qty)} adet satıldı, satış sıralamasında ${item.salesRank}.`}
    >
      {/* Slot number — the menu's own coordinate, so the owner can find the row.
          The row's aria-label already states all of this, so the visual layer below
          is presentational: the triangles in particular are announced literally
          ("black up-pointing triangle") when left exposed. */}
      <span
        aria-hidden
        className={[
          "font-ui font-extrabold text-[10px] leading-none tabular-nums text-center py-1",
          buried ? "bg-orange text-white" : "bg-green/10 text-green/70",
        ].join(" ")}
        title={`Menüde ${item.rank}. sırada (${item.categorySize} ürün içinde)`}
      >
        {item.rank}
      </span>

      <span className="min-w-0">
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="text-[12px] font-bold text-ink truncate min-w-0" title={item.name}>
            {item.name}
          </span>
          {notable && (
            <span
              aria-hidden
              className={[
                "shrink-0 font-ui font-extrabold text-[9px] leading-none px-1 py-0.5 tabular-nums",
                buried ? "bg-orange/15 text-orange" : "bg-green/10 text-green/60",
              ].join(" ")}
              title={
                buried
                  ? `Satışta ${item.salesRank}. sırada ama menüde ${item.rank}. sırada — ${Math.abs(gap)} basamak aşağıda duruyor`
                  : `Menüde ${item.rank}. sırada ama satışta ${item.salesRank}. sırada — iyi bir yeri hak ettiğinden az kullanıyor`
              }
            >
              {buried ? `▲ ${Math.abs(gap)}` : `▼ ${gap}`}
            </span>
          )}
        </span>
        {/* The bar. A plain div, not an SVG chart: one value, one axis, and it must
            align to the text baseline of a list that scrolls. */}
        <span className="mt-1 block h-1.5 bg-green/8" aria-hidden>
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

      <span className="text-[11px] font-extrabold tabular-nums text-green/70 shrink-0 text-right">
        {tl.format(item.qty)}
      </span>
    </li>
  );
}

/** One category's ladder, collapsed to its first rungs until expanded. */
function CategoryLadder({ cat }: { cat: CategoryPosition }) {
  const [open, setOpen] = useState(false);
  const COLLAPSED = 6;
  const max = Math.max(...cat.items.map((i) => i.qty), 0);
  const shown = open ? cat.items : cat.items.slice(0, COLLAPSED);
  const hidden = cat.items.length - shown.length;

  // Per-category direction, stated only when the category itself clears the bar.
  const dir = cat.significant ? (cat.rho < 0 ? "üst sıralar satıyor" : "alt sıralar satıyor") : null;

  return (
    <div className="border-2 border-green/25 p-3 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="text-[11px] tracking-[0.14em] font-extrabold text-ink uppercase truncate">
            {cat.categoryName}
          </span>
          <span className="text-[11px] font-bold text-green/40 tabular-nums shrink-0">
            ({cat.items.length})
          </span>
        </span>
        {dir && (
          <span
            className="shrink-0 text-[9px] font-extrabold uppercase tracking-[0.12em] text-green/60"
            title={`ρ = ${cat.rho.toFixed(2)} · p = ${cat.pValue < 0.001 ? "<0,001" : cat.pValue.toFixed(3)}`}
          >
            {dir}
          </span>
        )}
      </div>

      <ul className="min-w-0">
        {shown.map((i) => (
          <Rung key={i.id} item={i} max={max} showGap={cat.items.length >= 6} />
        ))}
      </ul>

      {/* One toggle, not two mutually-exclusive buttons: `aria-expanded` is what
          communicates the state, and `min-h-11` meets the 44px touch target that a
          py-2 button misses at this font size. */}
      {cat.items.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-2 w-full min-h-11 border-2 border-green/25 bg-transparent px-2 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase text-green/70 cursor-pointer transition-colors hover:border-green hover:text-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
        >
          {open ? "Daralt" : `${hidden} ürün daha`}
        </button>
      )}
    </div>
  );
}

/** The two action lists — the part an owner can act on this afternoon. */
function ActionList({
  title,
  hint,
  items,
  accent,
}: {
  title: string;
  hint: string;
  items: PositionItem[];
  accent: "orange" | "green";
}) {
  if (!items.length) return null;
  return (
    <div className={`border-2 p-3 min-w-0 ${accent === "orange" ? "border-orange" : "border-green/40"}`}>
      <div className="flex items-baseline gap-2 mb-1">
        <span
          className={`px-1.5 py-0.5 font-ui font-extrabold text-[10px] leading-none ${
            accent === "orange" ? "bg-orange text-white" : "bg-green/70 text-white"
          }`}
          aria-hidden
        >
          {accent === "orange" ? "▲" : "▼"}
        </span>
        <span className="text-[11px] tracking-[0.14em] font-extrabold text-ink uppercase">{title}</span>
      </div>
      <p className="text-[11px] text-green/60 font-bold leading-snug mb-2">{hint}</p>
      <ul className="flex flex-col gap-1.5 min-w-0">
        {items.map((i) => (
          <li key={i.id} className="flex items-baseline justify-between gap-2 min-w-0">
            <span className="text-[12px] font-bold text-ink truncate min-w-0" title={i.name}>
              {i.name}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-green/60">
              {i.categoryName} · {i.rank}. sıra → satışta {i.salesRank}.
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MenuPositionCard({ analysis }: { analysis: MenuPositionAnalysis }) {
  const v = useMemo(() => verdict(analysis), [analysis]);

  // Not enough matched items to say anything. Explain what unlocks it rather than
  // rendering an empty ladder that reads as broken.
  if (!analysis.hasData) {
    return (
      <section className="border-2 border-green bg-white p-4 sm:p-5 shadow-hard">
        <h3 className="flex items-start gap-2 text-[11px] tracking-[0.2em] font-extrabold text-green/70 uppercase mb-4">
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

  return (
    <section className="border-2 border-green bg-white p-4 sm:p-5 shadow-hard">
      <h3 className="flex items-start gap-2 text-[11px] tracking-[0.2em] font-extrabold text-green/70 uppercase mb-4">
        <span aria-hidden className="size-1.5 bg-orange shrink-0 mt-[0.35em]" />
        Menü Sırası × Satış
      </h3>

      {/* The verdict, first and in plain Turkish. The statistic sits beneath it as
          support, never as the headline — ρ is evidence, not the finding. */}
      <div className="mb-4">
        <div className="flex items-start gap-2">
          <span
            className={`shrink-0 px-1.5 py-1 font-ui font-extrabold text-[10px] leading-none tabular-nums ${toneChip}`}
            title="Spearman sıra korelasyonu"
          >
            ρ {analysis.overallRho.toFixed(2)}
          </span>
          <p className="text-[13px] text-ink leading-relaxed min-w-0">{v.line}</p>
        </div>
        <p className="mt-2 text-[11px] font-bold text-green/50 tabular-nums">
          {tl.format(analysis.coverage.matchedItems)} ürün · {tl.format(analysis.coverage.usableCategories)}{" "}
          kategori · p ={" "}
          {analysis.overallP < 0.001 ? "<0,001" : analysis.overallP.toFixed(3)}
          {!analysis.coverage.reliable && (
            <span className="text-orange">
              {" "}
              · dönem satışının %{Math.round(analysis.coverage.revenueRatio * 100)}&apos;ini kapsıyor
            </span>
          )}
        </p>
      </div>

      {/* Actions before evidence: the owner needs the two lists more than the ladder. */}
      {(analysis.buriedWinners.length > 0 || analysis.squatters.length > 0) && (
        <div className="flex flex-col gap-3 mb-4">
          <ActionList
            title="Gömülü Kazananlar"
            hint="Bulunduğu sıradan çok daha iyi satıyor — kategorisinde yukarı taşı."
            items={analysis.buriedWinners}
            accent="orange"
          />
          <ActionList
            title="Yeri Boşa Giden"
            hint="İyi bir sırada ama satışı zayıf — sırayı daha güçlü bir ürüne ver."
            items={analysis.squatters}
            accent="green"
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {analysis.categories.map((c) => (
          <CategoryLadder key={c.categoryId ?? c.categoryName} cat={c} />
        ))}
      </div>

      {/* The caveat. Stated in the card, not hidden in a tooltip, because it is the
          difference between a true reading and a confident wrong one. */}
      <p className="mt-4 pt-3 border-t border-green/15 text-[11px] text-green/55 leading-relaxed">
        <b className="text-green/70">Nasıl okunur:</b> sıralar <b>bugünkü</b> menü düzeninden alınır, satışlar
        ise seçili dönemden. Dönem içinde menüyü yeniden sıraladıysan bu karşılaştırma o değişikliği bilemez.
        İlişki nedensellik değildir: çok satan bir ürün zaten yukarı konmuş olabilir, bu da aynı sonucu üretir.
      </p>
    </section>
  );
}
