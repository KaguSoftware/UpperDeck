"use client";

import { Fragment } from "react";
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

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-2 border-green bg-white p-5">
      <h3 className="text-[11px] tracking-[0.2em] font-extrabold text-green/70 uppercase mb-4">{title}</h3>
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
        <YAxis
          type="category"
          dataKey="name"
          width={labelWidth}
          {...axisProps}
          tickFormatter={(n) => (String(n).length > 24 ? `${String(n).slice(0, 23)}…` : String(n))}
        />
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
          <YAxis
            type="category"
            dataKey="name"
            width={labelWidth}
            {...axisProps}
            tickFormatter={(n) => (String(n).length > 24 ? `${String(n).slice(0, 23)}…` : String(n))}
          />
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

/**
 * View→cart conversion per group (price bands, discount split). Rows of
 * "label — conversion bar — % + raw counts"; a plain HBar would hide the
 * conversion rate, which is the point of these charts.
 */
export function ConversionBars({
  data,
  note,
}: {
  data: { label: string; views: number; carts: number }[];
  note?: string;
}) {
  if (!data.some((d) => d.views > 0)) return <Empty note={note ?? "Veri yok."} />;
  const maxPct = Math.max(...data.map((d) => (d.views > 0 ? d.carts / d.views : 0)), 0.01);
  return (
    <div className="flex flex-col gap-3 py-2">
      {data.map((d) => {
        const pct = d.views > 0 ? (d.carts / d.views) * 100 : 0;
        return (
          <div key={d.label}>
            <div className="flex justify-between text-[11px] font-bold text-green mb-1">
              <span>{d.label}</span>
              <span>
                <span className="text-orange">{Math.round(pct)}%</span>
                <span className="text-green/50 ml-2">{tl.format(d.carts)}/{tl.format(d.views)}</span>
              </span>
            </div>
            <div className="h-5 bg-bg-deep">
              <div className="h-full bg-green" style={{ width: `${(pct / (maxPct * 100)) * 100}%` }} />
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-green/50 font-bold">Görüntüleme → sepete ekleme oranı</p>
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
