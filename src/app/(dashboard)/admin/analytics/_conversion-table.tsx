"use client";

import { useMemo, useState } from "react";
import type { ItemConversion } from "@/lib/analytics/compare";
import { useIsMobile } from "./_charts";

/**
 * Per-item menu engagement beside real POS sales.
 *
 * This is NOT a funnel and is deliberately no longer drawn as one. Views and cart
 * adds come from the QR menu (diners who opened the app); sold comes from the
 * POS (every guest, including the ones who never scanned anything). They are two
 * different populations, which is why "sold" routinely exceeds "carts" several
 * times over — an arrow between those columns would assert a sequence that does
 * not exist. So the columns are grouped under their source and the last column is
 * an INDEX (sold per view), not a percentage of anything.
 *
 * The table is also the densest view on the page, so it carries the controls that
 * make 89 products usable: sort on any column, search, show-all, CSV export.
 * Sorting by Satış/Görünt. ascending — most looked at, least bought — is the
 * single most useful ordering here and is one click away.
 */

const tl = new Intl.NumberFormat("tr-TR");
const ratioFmt = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Sold-per-view as a ratio ("1,2×"), not a probability ("120%"): views count
 * distinct phone sessions that opened the item, sold counts real POS units.
 * A multiplier makes >1× ("sells more than it's browsed" — ordered without ever
 * being looked up) read as a signal instead of a broken over-100% conversion.
 */
export function saleRatio(sold: number, views: number): string {
  if (views === 0) return "—";
  if (sold === 0) return "0×";
  const r = sold / views;
  if (r < 0.1) return "<0,1×";
  return `${ratioFmt.format(r)}×`;
}

type SortKey = "name" | "views" | "carts" | "sold" | "ratio";
type Dir = "asc" | "desc";

/** Rows shown before "show all" — a screenful, not an arbitrary cut. */
const COLLAPSED = 15;

function toCsv(rows: ItemConversion[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Ürün", "Görüntüleme (menü)", "Sepet (menü)", "Satılan (POS)", "Satış/Görüntüleme"];
  const body = rows.map((r) => [
    esc(r.name),
    r.views,
    r.carts,
    r.sold,
    // Turkish decimal comma, so Excel in a tr-TR locale reads it as a number.
    r.views > 0 ? String(Math.round((r.sold / r.views) * 100) / 100).replace(".", ",") : "",
  ]);
  // Semicolon-separated + BOM: what Turkish Excel opens correctly on a double click.
  return `﻿${[head, ...body].map((r) => r.join(";")).join("\r\n")}`;
}

function download(rows: ItemConversion[], range: { from: string; to: string }) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `urun-donusumu_${range.from}_${range.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ConversionTable({
  rows,
  note,
  range,
}: {
  rows: ItemConversion[];
  note: string;
  range: { from: string; to: string };
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: "views", dir: "desc" });
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const isMobile = useIsMobile();

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr");
    const base = needle ? rows.filter((r) => r.name.toLocaleLowerCase("tr").includes(needle)) : rows;
    const value = (r: ItemConversion) => {
      switch (sort.key) {
        case "name":
          return r.name;
        case "views":
          return r.views;
        case "carts":
          return r.carts;
        case "sold":
          return r.sold;
        case "ratio":
          // Never-viewed items have no ratio; park them at the end of BOTH
          // directions so they can't masquerade as the worst converters.
          return r.views > 0 ? r.sold / r.views : Number.POSITIVE_INFINITY;
      }
    };
    return [...base].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (typeof av === "string" || typeof bv === "string") {
        const c = String(av).localeCompare(String(bv), "tr");
        return sort.dir === "asc" ? c : -c;
      }
      if (av === Number.POSITIVE_INFINITY || bv === Number.POSITIVE_INFINITY) {
        return av === bv ? 0 : av === Number.POSITIVE_INFINITY ? 1 : -1;
      }
      return sort.dir === "asc" ? av - bv : bv - av;
    });
  }, [rows, query, sort]);

  const visible = showAll ? filtered : filtered.slice(0, COLLAPSED);

  if (!rows.length) {
    return <div className="py-8 sm:h-30 grid place-items-center text-[12px] text-green/50 text-center px-4">{note}</div>;
  }

  const th = "text-[10px] tracking-[0.14em] font-extrabold text-green/60 uppercase text-right py-2 px-3";
  const td = "text-[13px] font-bold text-ink text-right py-2 px-3 tabular-nums";
  const ctrl =
    "px-2.5 min-h-11 font-ui font-extrabold text-[10px] tracking-[0.14em] uppercase border-2 cursor-pointer transition-colors bg-white text-green border-green/40 hover:bg-bg-deep";

  // STICKY PRODUCT NAME (P0.1). `Satılan` and `Satış/Görünt.` — the two columns
  // this table exists for — sit at the right edge, so reading them on a phone
  // means scrolling the name column out of view and staring at a column of bare
  // "0,5× 0,7× 1,0×" with no idea which product is which. Pinning the first column
  // keeps the row identifiable at every scroll position. The background must be
  // opaque (cells would otherwise show through) and the header's z-index must beat
  // the body's, or a scrolled cell rides over the header.
  const stickyCell = "sticky left-0 z-[2] bg-white";
  const stickyHead = "sticky left-0 z-[3] bg-white";

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : // Names read naturally A→Z; every figure is most interesting large-first.
          { key, dir: key === "name" ? "asc" : "desc" }
    );

  // The button fills the header cell rather than hugging the text: the sort arrows
  // alone are a ~10px target, well under the 44px minimum (P2.2).
  const Th = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`${th} ${className}`}>
      <button
        type="button"
        onClick={() => toggle(k)}
        className={[
          "w-full min-h-11 inline-flex items-center gap-1 uppercase cursor-pointer",
          "hover:text-orange transition-colors",
          className.includes("text-left") ? "justify-start" : "justify-end",
        ].join(" ")}
        title="Bu sütuna göre sırala"
      >
        {children}
        <span aria-hidden className={sort.key === k ? "text-orange" : "text-green/25"}>
          {sort.key === k ? (sort.dir === "asc" ? "▲" : "▼") : "▽"}
        </span>
      </button>
    </th>
  );

  return (
    <div>
      {/* Toolbar stacks on mobile (P1.2). On one row the search box collapsed to
          ~90px and showed its placeholder as "Ür" — an unusable control on the
          table that most needs searching. Full width first, buttons 50/50 below. */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ürün ara…"
          className="w-full min-w-0 sm:flex-none sm:w-56 px-2.5 min-h-11 sm:min-h-0 sm:py-1.5 border-2 border-green/30 bg-white text-[12px] text-ink placeholder:text-green/40 focus:outline-none focus:border-green"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => toggle("ratio")}
            className={`${ctrl} flex-1 sm:flex-none`}
            title="En çok bakılıp en az satılanlar üste"
          >
            Az Satan Üste
          </button>
          <button
            type="button"
            onClick={() => download(filtered, range)}
            className={`${ctrl} flex-1 sm:flex-none`}
          >
            Excel’e Aktar
          </button>
        </div>
        <span className="text-[10px] font-extrabold text-green/50 tabular-nums sm:ml-auto text-right">
          {tl.format(visible.length)} / {tl.format(filtered.length)} ürün
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            {/* Source banner: the two halves of this table do not come from the
                same place and must never be read as consecutive funnel steps. */}
            <tr>
              <th className={stickyHead} />
              {/* `normal-case`+wrap rather than a truncating single line: the header
                  used to cut to "MENÜ (QR) · BAKA…", and a source label that can't
                  name its source is the one thing this row exists to do (P1.3). */}
              <th
                colSpan={2}
                className="text-[9px] tracking-[0.16em] font-extrabold text-green/50 uppercase text-right pb-1 px-3 whitespace-normal"
              >
                Menü (QR) · bakan kişiler
              </th>
              <th
                colSpan={2}
                className="text-[9px] tracking-[0.16em] font-extrabold text-green/50 uppercase text-right pb-1 px-3 whitespace-normal"
              >
                POS (kasa) · tüm müşteriler
              </th>
            </tr>
            <tr className="border-b-2 border-green">
              <Th k="name" className={`text-left ${stickyHead}`}>
                Ürün
              </Th>
              <Th k="views">Görüntüleme</Th>
              <Th k="carts">Sepet</Th>
              <Th k="sold">Satılan</Th>
              <Th k="ratio">Satış/Görünt.</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.name} className="border-b border-green/15">
                {/* max-w tighter on mobile so the pinned column leaves room for the
                    figures; `title` carries the full name for the truncated ones —
                    the only place on the page where an ellipsis is acceptable. */}
                <td
                  className={`${td} ${stickyCell} text-left whitespace-nowrap max-w-32 sm:max-w-45 truncate shadow-[2px_0_4px_rgba(0,0,0,0.06)] sm:shadow-none`}
                  title={r.name}
                >
                  {r.name}
                </td>
                <td className={td}>{tl.format(r.views)}</td>
                <td className={td}>{tl.format(r.carts)}</td>
                <td className={td}>{r.sold ? tl.format(r.sold) : "—"}</td>
                <td
                  className={`${td} ${
                    r.views >= 5 && r.sold === 0
                      ? "text-orange"
                      : r.views > 0 && r.sold / r.views >= 1
                        ? "text-green"
                        : ""
                  }`}
                >
                  {saleRatio(r.sold, r.views)}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[12px] text-green/50">
                  “{query}” ile eşleşen ürün yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase text-orange hover:text-orange/70 cursor-pointer transition-colors"
        >
          {showAll ? "Daha az göster" : `Tümünü göster (${tl.format(filtered.length)})`}
        </button>
      )}

      {/* Collapsed by default on mobile (P1.7): the explanation is genuinely good,
          but 6 lines of it before the reader has seen a single number costs a whole
          screen. Open on desktop, where it costs nothing. Contrast raised from
          green/50 to green/80 to clear WCAG AA at this size. */}
      <details className="mt-2" open={!isMobile}>
        <summary className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 text-[10px] font-extrabold text-green/90 uppercase tracking-[0.14em] cursor-pointer list-none marker:content-none hover:text-orange transition-colors">
          <span aria-hidden className="text-orange">ⓘ</span>
          Nasıl okunur?
        </summary>
        <p className="mt-1.5 text-[10px] text-green/90 font-bold leading-relaxed">
          İki ayrı kaynak: <b>Görüntüleme/Sepet</b> QR menüyü açan müşterilerden, <b>Satılan</b> kasadan gelir —
          menüyü hiç açmayan müşteriler de satışa dahil olduğu için satılan adet sepetten çok daha yüksek
          olabilir; bu bir huni değildir. <b>Satış/Görünt.</b> = her görüntülemeye düşen satış (1× = görüntülendiği
          kadar satılıyor, 1×+ = menüye bakılmadan da sipariş ediliyor) · turuncu = çok görüntülenip hiç
          satılmayan.
        </p>
      </details>
    </div>
  );
}
