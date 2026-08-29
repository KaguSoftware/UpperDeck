"use client";

import { Fragment, useCallback, useState, useTransition } from "react";
import { DangerButton } from "../../_components";
import { deleteSalesEntry } from "./actions";
import { getSalesDayDetailAction } from "./detail-actions";
import type { SalesEntry, SalesDayDetail, DayItemDetail } from "@/lib/analytics/sales";

const fmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const tl = new Intl.NumberFormat("tr-TR");
const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

/** Signed ₺, so a drop reads as a loss at a glance rather than a bare number. */
function signedMoney(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "−"}${money.format(Math.abs(rounded))}`;
}

type SortKey = "impact" | "revenue" | "qty";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "impact", label: "Fark (₺)" },
  { key: "revenue", label: "Tutar" },
  { key: "qty", label: "Adet" },
];

function sortItems(items: DayItemDetail[], key: SortKey): DayItemDetail[] {
  const copy = [...items];
  // Impact ascending: the biggest LOSS first. That ordering is the whole feature —
  // "which items drove the drop on the 10th" is answered by the top of this list.
  if (key === "impact") return copy.sort((a, b) => a.impact - b.impact);
  if (key === "qty") return copy.sort((a, b) => b.qty - a.qty);
  return copy.sort((a, b) => b.revenue - a.revenue);
}

/**
 * The day's items against each item's own recent normal.
 *
 * Loaded lazily on expand (see detail-actions) and rendered with the ₺ difference,
 * not just the day's figures: a list of quantities can't tell you whether 12 is a
 * good day for an item, so every row carries the item's baseline average and what
 * the gap is worth. Items that sold nothing today but normally do are included at
 * zero — usually the actual cause of a bad day, and absent from any list built from
 * the day's own rows.
 */
function DayDetail({ detail }: { detail: SalesDayDetail }) {
  const [sort, setSort] = useState<SortKey>("impact");
  const items = sortItems(detail.items, sort);

  const vsBaseline = detail.total != null && detail.baseline.days > 0
    ? detail.total - detail.baseline.avgRevenue
    : null;

  const th = "text-[9px] tracking-[0.14em] font-extrabold text-green/60 uppercase text-right py-1.5 px-3";
  const td = "text-[12px] font-bold text-ink text-right py-1.5 px-3 tabular-nums";

  return (
    <div className="bg-bg-deep/40 border-t-2 border-green/15 px-4 py-3">
      {/* Day vs its own normal, first — the item table below explains this number. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-3">
        {vsBaseline != null && (
          <span className="text-[12px] font-extrabold">
            <span className="text-green/60">Son {tl.format(detail.baseline.days)} kayıtlı günün ortalaması </span>
            <span className="text-ink tabular-nums">{fmt.format(Math.round(detail.baseline.avgRevenue))}</span>
            <span className={`ml-2 tabular-nums ${vsBaseline >= 0 ? "text-green" : "text-orange"}`}>
              ({signedMoney(vsBaseline)} ₺)
            </span>
          </span>
        )}
        {detail.hasItems && detail.total != null && Math.abs(detail.itemRevenue - detail.total) > 1 && (
          <span
            className="text-[11px] font-bold text-green/50 tabular-nums"
            title="Kalem satırlarının toplamı — indirim, servis veya kalemsiz satırlar nedeniyle gün toplamından farklı olabilir"
          >
            kalem toplamı {fmt.format(Math.round(detail.itemRevenue))}
          </span>
        )}
      </div>

      {!detail.hasItems ? (
        <p className="text-[12px] text-green/50 font-bold py-2">
          Bu gün için ürün detayı yok — elle girilen bir gün ya da kalem satırı içermeyen bir içe aktarma.
          Ürün bazlı görmek için “Gelir Merkezi Detaylar” raporunu yükleyin.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] tracking-[0.14em] font-extrabold text-green/50 uppercase">Sırala</span>
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                className={[
                  "px-2 py-1 font-ui font-extrabold text-[9px] tracking-[0.12em] uppercase border-2 -ml-0.5 first:ml-0 cursor-pointer transition-colors",
                  sort === s.key
                    ? "bg-green text-white border-green"
                    : "bg-white text-green border-green/40 hover:bg-white/60",
                ].join(" ")}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white border-2 border-green/20">
              <thead>
                <tr className="border-b-2 border-green/30">
                  <th className={`${th} text-left`}>Ürün</th>
                  <th className={th}>Adet</th>
                  <th className={th}>Tutar</th>
                  <th className={th} title="Bu ürünün son 28 kayıtlı gündeki günlük ortalama adedi">
                    Normali
                  </th>
                  <th className={th}>Değişim</th>
                  <th className={th} title="Farkın parasal karşılığı: (adet − normal) × birim fiyat">
                    Fark (₺)
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const gone = i.qty === 0;
                  return (
                    <tr key={i.name} className="border-b border-green/10 last:border-0">
                      <td className={`${td} text-left max-w-56 truncate`} title={i.name}>
                        {i.name}
                        {gone && (
                          <span
                            className="ml-2 px-1 py-0.5 align-middle bg-orange/12 text-orange font-ui font-extrabold text-[8px] tracking-widest uppercase"
                            title={`Normalde satılıyor (${i.daysSeen} günde) ama bu gün hiç satılmadı`}
                          >
                            hiç satılmadı
                          </span>
                        )}
                      </td>
                      <td className={td}>{gone ? "—" : tl.format(i.qty)}</td>
                      <td className={td}>{i.revenue > 0 ? money.format(Math.round(i.revenue)) : "—"}</td>
                      <td className={`${td} text-green/50`}>{dec.format(i.baselineQty)}</td>
                      <td
                        className={`${td} ${
                          i.deltaPct == null ? "text-green/40" : i.deltaPct > 0 ? "text-green" : i.deltaPct < 0 ? "text-orange" : ""
                        }`}
                      >
                        {i.deltaPct == null ? "yeni" : `${i.deltaPct > 0 ? "+" : ""}${i.deltaPct}%`}
                      </td>
                      <td
                        className={`${td} font-extrabold ${
                          Math.round(i.impact) > 0 ? "text-green" : Math.round(i.impact) < 0 ? "text-orange" : "text-green/40"
                        }`}
                      >
                        {signedMoney(i.impact)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[10px] text-green/50 font-bold leading-relaxed">
            “Normali” = bu ürünün son {tl.format(detail.baseline.days)} kayıtlı gündeki günlük ortalama adedi ·
            “Fark (₺)” = o günün normalden sapmasının parasal karşılığı · varsayılan sıralama en büyük kayıptan
            başlar, yani günü aşağı çeken ürünler en üstte.
          </p>
        </>
      )}
    </div>
  );
}

export function SalesList({ entries }: { entries: SalesEntry[] }) {
  // Cached per date so collapsing and re-opening a day doesn't re-query it.
  const [details, setDetails] = useState<Record<string, SalesDayDetail | null>>({});
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [loadingDate, setLoadingDate] = useState<string | null>(null);
  const [, startLoading] = useTransition();

  const toggle = useCallback(
    (date: string) => {
      if (openDate === date) {
        setOpenDate(null);
        return;
      }
      setOpenDate(date);
      if (details[date] !== undefined) return;
      setLoadingDate(date);
      startLoading(async () => {
        const res = await getSalesDayDetailAction(date);
        setDetails((prev) => ({ ...prev, [date]: res.ok ? res.detail : null }));
        setLoadingDate((cur) => (cur === date ? null : cur));
      });
    },
    [openDate, details]
  );

  if (entries.length === 0) {
    return (
      <div className="border-2 border-dashed border-green/40 bg-white p-6 text-center text-[12px] text-green/60">
        Bu dönem için kayıtlı satış yok. Yukarıdan elle girin veya Excel yükleyin.
      </div>
    );
  }

  return (
    <div className="border-2 border-green bg-white overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b-2 border-green text-left text-[10px] uppercase tracking-[0.18em] text-green/70">
            <th className="px-4 py-3 font-extrabold">Tarih</th>
            <th className="px-4 py-3 font-extrabold">Satış</th>
            <th className="px-4 py-3 font-extrabold">Kişi</th>
            <th className="px-4 py-3 font-extrabold">Kaynak</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const open = openDate === e.entry_date;
            return (
              // Fragment, keyed: the row and its detail row are siblings in <tbody>,
              // so they can't be wrapped in anything else without breaking the table.
              <Fragment key={e.id}>
                <tr className={`border-b border-green/15 ${open ? "bg-bg-deep/30" : ""}`}>
                  <td className="px-4 py-2.5">
                    {/* The date itself is the affordance: the question this answers
                        ("what happened on the 10th?") always starts from a date. */}
                    <button
                      type="button"
                      onClick={() => toggle(e.entry_date)}
                      aria-expanded={open}
                      className="flex items-center gap-2 font-bold text-ink hover:text-orange cursor-pointer transition-colors"
                      title="Ürün bazında detayı göster"
                    >
                      <span
                        aria-hidden
                        className={`text-[10px] text-green/50 transition-transform ${open ? "rotate-90" : ""}`}
                      >
                        ▶
                      </span>
                      {e.entry_date}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-ink">{fmt.format(e.total_sales)}</td>
                  <td className="px-4 py-2.5 text-ink">{e.covers ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[9px] uppercase tracking-[0.16em] font-extrabold text-green/60">
                      {e.source === "excel" ? "Excel" : "Manuel"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={deleteSalesEntry}>
                      <input type="hidden" name="id" value={e.id} />
                      <DangerButton>Sil</DangerButton>
                    </form>
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={5} className="p-0">
                      {loadingDate === e.entry_date && details[e.entry_date] === undefined ? (
                        <div className="bg-bg-deep/40 border-t-2 border-green/15 px-4 py-4 text-[12px] font-bold text-green/60">
                          Ürün detayı yükleniyor…
                        </div>
                      ) : details[e.entry_date] ? (
                        <DayDetail detail={details[e.entry_date]!} />
                      ) : (
                        <div className="bg-bg-deep/40 border-t-2 border-green/15 px-4 py-4 text-[12px] font-bold text-orange">
                          Detay okunamadı.
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
