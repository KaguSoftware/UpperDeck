"use client";

import { Fragment, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";

// Brand tokens (mirror globals.css) — Recharts needs literal colors.
const GREEN = "#395A66";
const GREEN_DEEP = "#243845";
const ORANGE = "#FF5138";
const GRID = "#39556622";

const axisProps = {
  tick: { fill: GREEN, fontSize: 10, fontWeight: 700 },
  stroke: GREEN,
} as const;

const tooltipStyle = {
  contentStyle: {
    background: "#fff",
    border: `2px solid ${GREEN}`,
    borderRadius: 0,
    fontSize: 12,
    fontFamily: "var(--font-inter-next)",
  },
  labelStyle: { color: GREEN, fontWeight: 800 },
} as const;

const tl = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

// Compact axis ticks (1500 → "1,5B", 1200000 → "1,2Mn") so long revenue numbers
// don't overflow the axis gutter.
const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

const legendStyle = { fontSize: 11, fontWeight: 700, color: GREEN } as const;

/** Longest category-axis label before it gets an ellipsis. */
const AXIS_LABEL_MAX = 24;

/**
 * Category-axis tick that keeps the full name reachable.
 *
 * Recharts' `tickFormatter` truncates the string and there is no way back to the
 * original from the rendered text, so "Berries & Ice Cream Waf…" was a dead end —
 * the reader could not find out which product it was without leaving the chart.
 * An SVG `<title>` restores the native tooltip on hover for exactly the ticks that
 * were cut.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CategoryTick({ x, y, payload }: any) {
  const full = String(payload?.value ?? "");
  const cut = full.length > AXIS_LABEL_MAX;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill={GREEN} fontSize={10} fontWeight={700}>
      {cut && <title>{full}</title>}
      {cut ? `${full.slice(0, AXIS_LABEL_MAX - 1)}…` : full}
    </text>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-2 border-green bg-white p-5 shadow-hard">
      <h3 className="flex items-center gap-2 text-[11px] tracking-[0.2em] font-extrabold text-green/70 uppercase mb-4">
        <span aria-hidden className="size-1.5 bg-orange shrink-0" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Empty({ note }: { note: string }) {
  return (
    <div className="h-[220px] grid place-items-center text-[12px] text-green/50 text-center px-4">{note}</div>
  );
}

/** Headline: real revenue (bars) vs menu engagement (line). */
export function SalesVsEngagementChart({
  data,
}: {
  data: { date: string; revenue: number | null; views: number; waiterCalls: number }[];
}) {
  if (!data.length) return <Empty note="Menü etkileşimi biriktikçe ve gerçek satış girdikçe burada karşılaştırılır." />;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => String(d).slice(5)} minTickGap={16} />
        <YAxis yAxisId="left" {...axisProps} width={44} tickFormatter={(v) => compact.format(v)} />
        <YAxis yAxisId="right" orientation="right" {...axisProps} width={32} allowDecimals={false} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={legendStyle} iconType="plainline" />
        {/* connectNulls + visible dots so sparse days (a single sales entry or a
            lone active day) still render instead of showing an empty plot. */}
        <Bar yAxisId="left" dataKey="revenue" name="Gerçek Satış (₺)" fill={GREEN} barSize={18} />
        <Line yAxisId="right" type="monotone" dataKey="views" name="Görüntüleme" stroke={ORANGE} strokeWidth={2} dot={{ r: 2 }} connectNulls />
        <Line yAxisId="right" type="monotone" dataKey="waiterCalls" name="Garson Çağrısı" stroke={GREEN_DEEP} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function RevenueAreaChart({ data }: { data: { date: string; revenue: number }[] }) {
  if (!data.length) return <Empty note="Bu dönem için satış girilmedi. Sağ üstten “Gerçek Satış Gir”." />;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
            <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => String(d).slice(5)} minTickGap={16} />
        <YAxis {...axisProps} width={44} tickFormatter={(v) => compact.format(v)} />
        <Tooltip {...tooltipStyle} formatter={(v) => tl.format(Number(v))} />
        {/* dot enabled so a single day's entry is still visible (a lone point
            would otherwise draw a zero-length, invisible line). */}
        <Area
          type="monotone"
          dataKey="revenue"
          name="Satış (₺)"
          stroke={GREEN}
          strokeWidth={2}
          fill="url(#rev)"
          dot={{ r: 3, fill: GREEN }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({
  data,
  color = ORANGE,
  note,
}: {
  data: { name: string; count: number }[];
  color?: string;
  note?: string;
}) {
  if (!data.length) return <Empty note={note ?? "Veri yok."} />;
  // Widen the label gutter for long item/category names, but cap it so the bars
  // still have room; overflowing names get an ellipsis instead of being clipped.
  const labelWidth = Math.min(180, Math.max(96, ...data.map((d) => d.name.length * 7)));
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={labelWidth} {...axisProps} tick={<CategoryTick />} />
        <Tooltip {...tooltipStyle} cursor={{ fill: GRID }} />
        <Bar dataKey="count" name="Adet" fill={color} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * "Watched but not bought" — per item, stacked by dwell bucket. Each bucket
 * suggests a different fix: 5–10 s = photo isn't selling it, 10–20 s = the
 * description loses them, +20 s = they read everything and still passed
 * (content/price). Mistake taps (<5 s) never reach this data.
 */
export function AbandonedViewsChart({
  data,
  note,
}: {
  data: { name: string; b5to10: number; b10to20: number; b20plus: number }[];
  note?: string;
}) {
  if (!data.length) return <Empty note={note ?? "Veri yok."} />;
  const labelWidth = Math.min(180, Math.max(96, ...data.map((d) => d.name.length * 7)));
  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" {...axisProps} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={labelWidth} {...axisProps} tick={<CategoryTick />} />
          <Tooltip {...tooltipStyle} cursor={{ fill: GRID }} />
          <Legend wrapperStyle={legendStyle} />
          <Bar dataKey="b5to10" name="5–10 sn" stackId="d" fill={GREEN} barSize={16} />
          <Bar dataKey="b10to20" name="10–20 sn" stackId="d" fill={GREEN_DEEP} barSize={16} />
          <Bar dataKey="b20plus" name="+20 sn" stackId="d" fill={ORANGE} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-3 text-[11px] leading-relaxed text-green/60 font-bold">
        5–10 sn · görsel ilgi çekmiyor &nbsp;·&nbsp; 10–20 sn · açıklama ikna etmiyor &nbsp;·&nbsp; +20 sn · okudu ama
        almadı (içerik/fiyat)
        <br />O gün gerçekten satılan ürünler hariç tutulur.
      </p>
    </>
  );
}

export function FunnelBars({ data, note }: { data: { step: string; count: number }[]; note?: string }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  if (!data.some((d) => d.count > 0)) return <Empty note={note ?? "Veri yok."} />;
  return (
    <div className="flex flex-col gap-3 py-2">
      {data.map((d, i) => {
        const prev = i > 0 ? data[i - 1].count : d.count;
        const conv = prev > 0 ? Math.round((d.count / prev) * 100) : 100;
        return (
          <div key={d.step}>
            <div className="flex justify-between text-[11px] font-bold text-green mb-1">
              <span>{d.step}</span>
              <span>
                {tl.format(d.count)}
                {i > 0 && <span className="text-orange ml-2">{conv}%</span>}
              </span>
            </div>
            <div className="h-5 bg-bg-deep">
              <div
                className="h-full"
                style={{ width: `${(d.count / max) * 100}%`, background: i === 0 ? GREEN : i === 1 ? GREEN_DEEP : ORANGE }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type ConversionRow = {
  label: string;
  views: number;
  sold: number;
  revenue?: number;
  /** Products inside the group — the drill-down behind the summary row. */
  items?: { name: string; views: number; sold: number; revenue: number }[];
};

/**
 * Views → REAL SALES per group (price bands).
 *
 * Deliberately NOT view→cart: the menu has no checkout, so add-to-cart says which
 * items get tapped, not which get sold.
 *
 * The displayed rate is CAPPED AT 100%. A raw ratio here regularly exceeded it
 * (465% in one band), and a number above 100 in a box labelled "dönüşüm" reads as
 * a bug — worse, it reads as spectacular success when it means the opposite: those
 * units were ordered without the item's menu page ever being opened. That surplus
 * gets its own honest figure, "menüsüz satış", instead of being folded into a
 * conversion rate it isn't part of.
 */
export function ConversionBars({ data, note }: { data: ConversionRow[]; note?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!data.some((d) => d.views > 0 || d.sold > 0)) return <Empty note={note ?? "Veri yok."} />;
  return (
    <div className="flex flex-col gap-3 py-2">
      {data.map((d) => {
        // Units that a viewer could actually account for; the rest were ordered
        // without the menu page being opened at all.
        const converted = Math.min(d.sold, d.views);
        const pct = d.views > 0 ? Math.round((converted / d.views) * 100) : 0;
        const offMenuPct = d.sold > converted ? Math.round(((d.sold - converted) / d.sold) * 100) : 0;
        const items = d.items ?? [];
        const expanded = open === d.label;
        return (
          <div key={d.label}>
            <div className="flex flex-wrap justify-between gap-x-2 text-[11px] font-bold text-green mb-1">
              <button
                type="button"
                disabled={items.length === 0}
                onClick={() => setOpen(expanded ? null : d.label)}
                className="flex items-center gap-1.5 text-left enabled:cursor-pointer enabled:hover:text-orange transition-colors"
                title={items.length ? "Bu aralıktaki ürünleri göster" : undefined}
              >
                {items.length > 0 && (
                  <span aria-hidden className="text-green/40 text-[9px] w-2">{expanded ? "▾" : "▸"}</span>
                )}
                <span>{d.label}</span>
              </button>
              <span className="tabular-nums">
                <span className="text-orange">{pct}%</span>
                <span className="text-green/50 ml-2">
                  {tl.format(converted)}/{tl.format(d.views)}
                </span>
                {offMenuPct > 0 && (
                  <span
                    className="ml-2 px-1 py-0.5 bg-ink/10 text-ink font-ui font-extrabold text-[9px] tracking-[0.1em] uppercase"
                    title={`Satılan ${tl.format(d.sold)} adedin ${tl.format(d.sold - converted)} tanesi, ürün menüde hiç görüntülenmeden sipariş edildi.`}
                  >
                    menüsüz %{offMenuPct}
                  </span>
                )}
              </span>
            </div>
            {/* Scaled to a full 100%, not to the row max: the bar is a rate, and a
                rate deserves an absolute scale the eye can read against. */}
            <div className="h-5 bg-bg-deep">
              <div className="h-full bg-green" style={{ width: `${pct}%` }} />
            </div>
            {expanded && items.length > 0 && (
              <ul className="mt-2 mb-1 pl-3 border-l-2 border-green/20 flex flex-col divide-y divide-green/10">
                {items.map((it) => (
                  <li key={it.name} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="text-[12px] text-ink truncate min-w-0" title={it.name}>
                      {it.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-green/60 tabular-nums">
                      {tl.format(it.views)} görüntüleme · {tl.format(it.sold)} satış
                      {it.revenue > 0 && <> · {tl.format(Math.round(it.revenue))} ₺</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <p className="text-[10px] text-green/50 font-bold leading-relaxed">
        Görüntüleme → gerçek satış oranı, en fazla %100 gösterilir. “Menüsüz %” = o aralıkta satılan ama menüde
        hiç açılmadan sipariş edilen adetlerin payı — menünün o ürünlere ulaşmadığı anlamına gelir, başarı değil.
        {data.some((d) => (d.items?.length ?? 0) > 0) && " Aralığa tıklayarak ürünleri görebilirsiniz."}
      </p>
    </div>
  );
}

const DAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]; // ISO: 1 = Monday

/**
 * Weekday × hour heatmap of menu views. Cell shading is a sequential ramp of
 * the brand green; the single busiest cell flips to orange like PeakHours.
 */
export function WeekHeatmapChart({
  data,
  note,
}: {
  data: { day: number; hour: number; count: number }[];
  note?: string;
}) {
  if (!data.some((d) => d.count > 0)) return <Empty note={note ?? "Veri yok."} />;
  const byCell = new Map(data.map((d) => [`${d.day}-${d.hour}`, d.count]));
  const peak = Math.max(...data.map((d) => d.count));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: "36px repeat(24, 1fr)" }}>
          {/* hour header */}
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center text-[9px] font-bold text-green/50">
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </div>
          ))}
          {DAY_LABELS.map((label, i) => {
            const day = i + 1;
            return (
              <Fragment key={day}>
                <div className="text-[10px] font-extrabold text-green/70 leading-4">{label}</div>
                {Array.from({ length: 24 }, (_, h) => {
                  const count = byCell.get(`${day}-${h}`) ?? 0;
                  const isPeak = count === peak && count > 0;
                  return (
                    <div
                      key={`${day}-${h}`}
                      title={`${label} ${String(h).padStart(2, "0")}:00 — ${tl.format(count)}`}
                      className="h-4"
                      style={{
                        background: isPeak
                          ? ORANGE
                          : count > 0
                            ? `rgba(57, 90, 102, ${0.15 + 0.85 * (count / peak)})`
                            : "#39556611",
                      }}
                    />
                  );
                })}
              </Fragment>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] text-green/50 font-bold">
          Koyu = daha çok görüntüleme · turuncu = en yoğun saat
        </p>
      </div>
    </div>
  );
}

export function PeakHoursChart({ data, note }: { data: { hour: number; count: number }[]; note?: string }) {
  if (!data.some((d) => d.count > 0)) return <Empty note={note ?? "Veri yok."} />;
  // Compute the peak once (not per-cell) so only the busiest hour is highlighted.
  const peak = Math.max(...data.map((d) => d.count));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="hour" {...axisProps} tickFormatter={(h) => `${String(h).padStart(2, "0")}`} interval={2} />
        <YAxis {...axisProps} width={28} allowDecimals={false} />
        <Tooltip {...tooltipStyle} cursor={{ fill: GRID }} labelFormatter={(h) => `${String(h).padStart(2, "0")}:00`} />
        <Bar dataKey="count" name="Görüntüleme" barSize={10}>
          {data.map((d) => (
            <Cell key={d.hour} fill={d.count === peak ? ORANGE : GREEN} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
