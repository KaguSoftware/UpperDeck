"use client";

import { useMemo, useState } from "react";
import type { ItemConversion } from "@/lib/analytics/compare";

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
    return <div className="h-30 grid place-items-center text-[12px] text-green/50 text-center px-4">{note}</div>;
  }

  const th = "text-[10px] tracking-[0.14em] font-extrabold text-green/60 uppercase text-right py-2 px-3";
  const td = "text-[13px] font-bold text-ink text-right py-2 px-3 tabular-nums";
  const ctrl =
    "px-2.5 py-1.5 font-ui font-extrabold text-[10px] tracking-[0.14em] uppercase border-2 cursor-pointer transition-colors bg-white text-green border-green/40 hover:bg-bg-deep";

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : // Names read naturally A→Z; every figure is most interesting large-first.
          { key, dir: key === "name" ? "asc" : "desc" }
    );

  const Th = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`${th} ${className}`}>
      <button
        type="button"
        onClick={() => toggle(k)}
        className="inline-flex items-center gap-1 uppercase cursor-pointer hover:text-orange transition-colors"
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
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ürün ara…"
          className="min-w-0 flex-1 sm:flex-none sm:w-56 px-2.5 py-1.5 border-2 border-green/30 bg-white text-[12px] text-ink placeholder:text-green/40 focus:outline-none focus:border-green"
        />
        <button type="button" onClick={() => toggle("ratio")} className={ctrl} title="En çok bakılıp en az satılanlar üste">
          Az Satan Üste
        </button>
        <button type="button" onClick={() => download(filtered, range)} className={ctrl}>
          Excel’e Aktar
        </button>
        <span className="text-[10px] font-extrabold text-green/50 tabular-nums ml-auto">
          {tl.format(visible.length)} / {tl.format(filtered.length)} ürün
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            {/* Source banner: the two halves of this table do not come from the
                same place and must never be read as consecutive funnel steps. */}
            <tr>
              <th />
              <th
                colSpan={2}
                className="text-[9px] tracking-[0.16em] font-extrabold text-green/50 uppercase text-right pb-1 px-3"
              >
                Menü (QR) · bakan kişiler
              </th>
              <th
                colSpan={2}
                className="text-[9px] tracking-[0.16em] font-extrabold text-green/50 uppercase text-right pb-1 px-3"
              >
                POS (kasa) · tüm müşteriler
              </th>
            </tr>
            <tr className="border-b-2 border-green">
              <Th k="name" className="text-left">
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
                <td className={`${td} text-left whitespace-nowrap max-w-45 truncate`} title={r.name}>
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

      <p className="mt-2 text-[10px] text-green/50 font-bold leading-relaxed">
        İki ayrı kaynak: <b>Görüntüleme/Sepet</b> QR menüyü açan müşterilerden, <b>Satılan</b> kasadan gelir —
        menüyü hiç açmayan müşteriler de satışa dahil olduğu için satılan adet sepetten çok daha yüksek
        olabilir; bu bir huni değildir. <b>Satış/Görünt.</b> = her görüntülemeye düşen satış (1× = görüntülendiği
        kadar satılıyor, 1×+ = menüye bakılmadan da sipariş ediliyor) · turuncu = çok görüntülenip hiç
        satılmayan.
      </p>
    </div>
  );
}
