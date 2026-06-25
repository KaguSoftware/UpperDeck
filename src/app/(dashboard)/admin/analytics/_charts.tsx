"use client";

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
  if (!data.length) return <Empty note="Veri yok — gerçek satış girin ve menü etkileşimini bekleyin." />;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => String(d).slice(5)} />
        <YAxis yAxisId="left" {...axisProps} tickFormatter={(v) => tl.format(v)} />
        <YAxis yAxisId="right" orientation="right" {...axisProps} />
        <Tooltip {...tooltipStyle} />
        <Bar yAxisId="left" dataKey="revenue" name="Gerçek Satış (₺)" fill={GREEN} barSize={18} />
        <Line yAxisId="right" type="monotone" dataKey="views" name="Görüntüleme" stroke={ORANGE} strokeWidth={2} dot={false} />
        <Line yAxisId="right" type="monotone" dataKey="waiterCalls" name="Garson Çağrısı" stroke={GREEN_DEEP} strokeWidth={2} strokeDasharray="4 3" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function RevenueAreaChart({ data }: { data: { date: string; revenue: number }[] }) {
  if (!data.length) return <Empty note="Henüz satış girilmedi." />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
            <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => String(d).slice(5)} />
        <YAxis {...axisProps} tickFormatter={(v) => tl.format(v)} />
        <Tooltip {...tooltipStyle} />
        <Area type="monotone" dataKey="revenue" name="Satış (₺)" stroke={GREEN} strokeWidth={2} fill="url(#rev)" />
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
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" {...axisProps} />
        <YAxis type="category" dataKey="name" width={120} {...axisProps} />
        <Tooltip {...tooltipStyle} cursor={{ fill: GRID }} />
        <Bar dataKey="count" name="Adet" fill={color} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FunnelBars({ data }: { data: { step: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  if (!data.some((d) => d.count > 0)) return <Empty note="Etkileşim verisi yok (PostHog gerekli)." />;
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

export function PeakHoursChart({ data }: { data: { hour: number; count: number }[] }) {
  if (!data.some((d) => d.count > 0)) return <Empty note="Etkileşim verisi yok (PostHog gerekli)." />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="hour" {...axisProps} tickFormatter={(h) => `${h}:00`} interval={2} />
        <YAxis {...axisProps} />
        <Tooltip {...tooltipStyle} cursor={{ fill: GRID }} labelFormatter={(h) => `${h}:00`} />
        <Bar dataKey="count" name="Görüntüleme" barSize={10}>
          {data.map((d) => (
            <Cell key={d.hour} fill={d.count === Math.max(...data.map((x) => x.count)) ? ORANGE : GREEN} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
