"use client";

import { Fragment, useEffect, useState } from "react";
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

/** Below this the layout is treated as mobile. Matches Tailwind's `sm`. */
const MOBILE_MAX = 639;

/**
 * Is the viewport phone-sized right now?
 *
 * Recharts' `ResponsiveContainer` adapts its WIDTH but takes `height` as a fixed
 * number, so a chart sized for desktop keeps that exact height at 390px — which is
 * where the page's screens-tall blank gaps came from. Charts read this to pick a
 * proportionate height instead.
 *
 * Starts `false` and corrects in an effect so server and first client render agree
 * (a `window` read during render would hydration-mismatch); the swap is a height
 * change on an already-responsive element, so nothing reflows visibly.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isMobile;
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-2 border-green bg-white p-4 sm:p-5 shadow-hard">
      {/* items-start + the marker's nudge: on a heading that wraps to two lines
          (common at 390px) `items-center` floated the square against the middle of
          the block instead of aligning it to the first line. */}
      <h3 className="flex items-start gap-2 text-[11px] tracking-[0.2em] font-extrabold text-green/70 uppercase mb-4">
        <span aria-hidden className="size-1.5 bg-orange shrink-0 mt-[0.35em]" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Empty-state note. Sized to its text on mobile rather than reserving a chart's
 * worth of height — an empty card that occupies 220px of a 844px screen is most of
 * a scroll for one sentence.
 */
function Empty({ note }: { note: string }) {
  return (
    <div className="py-8 sm:h-[220px] grid place-items-center text-[12px] text-green/50 text-center px-4">
      {note}
    </div>
  );
}

/** The three series of the headline chart, in render order. */
const SVE_SERIES = [
  { key: "revenue", label: "Gerçek Satış (₺)", color: GREEN },
  { key: "views", label: "Görüntüleme", color: ORANGE },
  { key: "waiterCalls", label: "Garson Çağrısı", color: GREEN_DEEP },
] as const;

type SveKey = (typeof SVE_SERIES)[number]["key"];

/**
 * Headline: real revenue (bars) vs menu engagement (lines).
 *
 * Desktop keeps all three series on a dual axis. Mobile cannot: 16 days, two axes
 * and three series inside ~340px produced 12px-wide bars, a legend wrapping to two
 * centred lines, and a dotted waiter-call series indistinguishable from the
 * baseline. So at phone width the chart shows ONE series at a time on a SINGLE
 * axis, picked from chips above it and defaulting to revenue.
 *
 * One axis is the point, not a side effect: two differently-scaled axes on a
 * 390px screen invite reading a crossing of the two as meaningful when it is an
 * artifact of independent scaling.
 */
export function SalesVsEngagementChart({
  data,
}: {
  data: { date: string; revenue: number | null; views: number; waiterCalls: number }[];
}) {
  const isMobile = useIsMobile();
  const [active, setActive] = useState<SveKey>("revenue");

  if (!data.length) return <Empty note="Menü etkileşimi biriktikçe ve gerçek satış girdikçe burada karşılaştırılır." />;

  const current = SVE_SERIES.find((s) => s.key === active)!;

  return (
    <>
      {/* Chips double as the legend on mobile (P1.1: legend above, left-aligned,
          wrapping — never a two-line centred block below the plot). */}
      {isMobile && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {SVE_SERIES.map((s) => {
            const on = s.key === active;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                aria-pressed={on}
                className={[
                  "inline-flex items-center gap-1.5 px-2.5 min-h-11 border-2 font-ui font-extrabold",
                  "text-[10px] tracking-[0.12em] uppercase cursor-pointer transition-colors",
                  on ? "border-green bg-green text-white" : "border-green/30 bg-white text-green/60",
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0"
                  style={{ background: on ? "#fff" : s.color }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
      )}
      <ResponsiveContainer width="100%" height={isMobile ? 210 : 320}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            {...axisProps}
            tickFormatter={(d) => String(d).slice(5)}
            minTickGap={isMobile ? 24 : 16}
            angle={isMobile ? -45 : 0}
            textAnchor={isMobile ? "end" : "middle"}
            height={isMobile ? 46 : 30}
          />
          {/* Mobile: one axis, sized for the active series. Desktop: unchanged. */}
          {isMobile ? (
            <YAxis
              yAxisId="left"
              {...axisProps}
              width={44}
              tickFormatter={(v) => compact.format(v)}
              allowDecimals={false}
            />
          ) : (
            <>
              <YAxis yAxisId="left" {...axisProps} width={44} tickFormatter={(v) => compact.format(v)} />
              <YAxis yAxisId="right" orientation="right" {...axisProps} width={32} allowDecimals={false} />
            </>
          )}
          <Tooltip {...tooltipStyle} />
          {!isMobile && <Legend wrapperStyle={legendStyle} iconType="plainline" />}
          {/* connectNulls + visible dots so sparse days (a single sales entry or a
              lone active day) still render instead of showing an empty plot. */}
          {(!isMobile || active === "revenue") && (
            <Bar yAxisId="left" dataKey="revenue" name="Gerçek Satış (₺)" fill={GREEN} barSize={isMobile ? 10 : 18} />
          )}
          {(!isMobile || active === "views") && (
            <Line
              yAxisId={isMobile ? "left" : "right"}
              type="monotone"
              dataKey="views"
              name="Görüntüleme"
              stroke={ORANGE}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
          )}
          {(!isMobile || active === "waiterCalls") && (
            <Line
              yAxisId={isMobile ? "left" : "right"}
              type="monotone"
              dataKey="waiterCalls"
              name="Garson Çağrısı"
              stroke={GREEN_DEEP}
              strokeWidth={2}
              // The dashed style is what made this series vanish against the
              // baseline at phone width; on its own single axis it can be solid.
              strokeDasharray={isMobile ? undefined : "4 3"}
              dot={{ r: 2 }}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {isMobile && (
        <p className="mt-2 text-[10px] text-green/90 font-bold">
          Tek eksende okunabilirlik için seriler ayrı gösterilir — üstteki etiketlerden seçin.
          <span className="text-green/70"> Şu an: {current.label}.</span>
        </p>
      )}
    </>
  );
}

export function RevenueAreaChart({ data }: { data: { date: string; revenue: number }[] }) {
  const isMobile = useIsMobile();
  if (!data.length) return <Empty note="Bu dönem için satış girilmedi. Sağ üstten “Gerçek Satış Gir”." />;
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 200 : 300}>
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
      <p className="text-[10px] text-green/90 font-bold leading-relaxed">
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
  const isMobile = useIsMobile();
  if (!data.some((d) => d.count > 0)) return <Empty note={note ?? "Veri yok."} />;
  const byCell = new Map(data.map((d) => [`${d.day}-${d.hour}`, d.count]));
  const peak = Math.max(...data.map((d) => d.count));

  // TRADING HOURS ONLY on mobile. A fixed 00–23 axis opens on twelve hours of
  // empty pre-service cells and pushes the actual peak off-screen — the card hid
  // its own headline finding. Narrowing to the hours that contain data (padded by
  // one for context) fits the whole week in 390px with no horizontal scroll at
  // all, so there is nothing left to scroll away from.
  const active = data.filter((d) => d.count > 0).map((d) => d.hour);
  const from = isMobile ? Math.max(0, Math.min(...active) - 1) : 0;
  const to = isMobile ? Math.min(23, Math.max(...active) + 1) : 23;
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  // Label every 3rd hour on desktop; mobile's window is short enough for every 2nd.
  const labelEvery = isMobile ? 2 : 3;
  const clipped = isMobile && (from > 0 || to < 23);

  return (
    <div className="overflow-x-auto">
      {/* No min-width on mobile: the collapsed hour window is designed to fit. */}
      <div className="sm:min-w-[560px]">
        <div
          className="grid gap-[2px] sm:gap-[3px]"
          style={{ gridTemplateColumns: `28px repeat(${hours.length}, minmax(0, 1fr))` }}
        >
          {/* hour header — sticky alongside the day column so the corner cell
              doesn't let the grid slide under the labels while scrolling. */}
          <div className="sticky left-0 z-[3] bg-white" />
          {hours.map((h) => (
            <div key={h} className="text-center text-[9px] font-bold text-green/50">
              {h % labelEvery === 0 ? String(h).padStart(2, "0") : ""}
            </div>
          ))}
          {DAY_LABELS.map((label, i) => {
            const day = i + 1;
            return (
              <Fragment key={day}>
                {/* Sticky day label: once the grid scrolls right, an unlabelled row
                    of cells says nothing about which day it belongs to. Opaque
                    background is required or cells show through underneath. */}
                <div className="sticky left-0 z-[2] bg-white pr-1 text-[10px] font-extrabold text-green/70 leading-4">
                  {label}
                </div>
                {hours.map((h) => {
                  const count = byCell.get(`${day}-${h}`) ?? 0;
                  const isPeak = count === peak && count > 0;
                  return (
                    <div
                      key={`${day}-${h}`}
                      title={`${label} ${String(h).padStart(2, "0")}:00 — ${tl.format(count)}`}
                      className="h-5 sm:h-4"
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
        <p className="mt-3 text-[10px] text-green/90 font-bold">
          Koyu = daha çok görüntüleme · turuncu = en yoğun saat
          {clipped && (
            <>
              {" "}
              · Yalnızca hareket olan saatler ({String(from).padStart(2, "0")}:00–
              {String(to).padStart(2, "0")}:00) gösteriliyor
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export function PeakHoursChart({ data, note }: { data: { hour: number; count: number }[]; note?: string }) {
  const isMobile = useIsMobile();
  if (!data.some((d) => d.count > 0)) return <Empty note={note ?? "Veri yok."} />;
  // Compute the peak once (not per-cell) so only the busiest hour is highlighted.
  const peak = Math.max(...data.map((d) => d.count));
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 170 : 220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        {/* Wider tick spacing on mobile — at 390px every-3rd-hour labels collide. */}
        <XAxis
          dataKey="hour"
          {...axisProps}
          tickFormatter={(h) => `${String(h).padStart(2, "0")}`}
          interval={isMobile ? 3 : 2}
        />
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
