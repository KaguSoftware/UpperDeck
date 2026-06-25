"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  ChartCard,
  SalesVsEngagementChart,
  RevenueAreaChart,
  HBarChart,
  FunnelBars,
  PeakHoursChart,
} from "./_charts";
import type { NamedCount } from "@/lib/analytics/posthog";

export type AnalyticsData = {
  preset: string;
  range: { from: string; to: string };
  posthogConfigured: boolean;
  kpis: {
    totalSales: number;
    totalCovers: number;
    avgSpendPerCover: number;
    sessions: number;
    avgSeconds: number;
    waiterCalls: number;
    views: number;
  };
  comparison: { date: string; revenue: number | null; covers: number | null; views: number; waiterCalls: number }[];
  revenueOverTime: { date: string; revenue: number; covers: number }[];
  topViewed: NamedCount[];
  funnel: { step: string; count: number }[];
  peakHours: { hour: number; count: number }[];
  categoryPopularity: NamedCount[];
  localeSplit: NamedCount[];
  bestSellers: { item_name: string; qty: number; revenue: number }[];
};

const PRESETS: { key: string; label: string }[] = [
  { key: "today", label: "Bugün" },
  { key: "7d", label: "7 Gün" },
  { key: "30d", label: "30 Gün" },
  { key: "90d", label: "90 Gün" },
];

const tl = new Intl.NumberFormat("tr-TR");
const lira = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

function duration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}d ${s}s` : `${s}s`;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-green bg-white p-5">
      <div className="text-[10px] tracking-[0.22em] font-bold text-green/70 uppercase">{label}</div>
      <div className="font-bowlby text-[40px] leading-none text-green mt-1 break-words">{value}</div>
    </div>
  );
}

export function AnalyticsClient({ data }: { data: AnalyticsData }) {
  const router = useRouter();
  const params = useSearchParams();

  const setRange = useCallback(
    (preset: string) => {
      const q = new URLSearchParams(params.toString());
      q.set("range", preset);
      q.delete("from");
      q.delete("to");
      router.push(`/admin/analytics?${q.toString()}`);
    },
    [params, router]
  );

  const onCustom = useCallback(
    (from: string, to: string) => {
      if (!from || !to) return;
      router.push(`/admin/analytics?range=custom&from=${from}&to=${to}`);
    },
    [router]
  );

  const { kpis } = data;

  return (
    <div className="flex flex-col gap-6">
      {/* Date range switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => {
          const active = data.preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setRange(p.key)}
              className={[
                "px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase border-2 cursor-pointer transition-colors",
                active ? "bg-orange text-white border-orange" : "bg-white text-green border-green hover:bg-bg-deep",
              ].join(" ")}
            >
              {p.label}
            </button>
          );
        })}
        <div className="flex items-center gap-1.5 ml-auto">
          <input
            type="date"
            defaultValue={data.range.from}
            id="range-from"
            className="border-2 border-green bg-white px-2 py-1.5 text-[12px] text-ink"
          />
          <span className="text-green/60 text-[12px]">→</span>
          <input
            type="date"
            defaultValue={data.range.to}
            id="range-to"
            className="border-2 border-green bg-white px-2 py-1.5 text-[12px] text-ink"
          />
          <button
            type="button"
            onClick={() => {
              const f = (document.getElementById("range-from") as HTMLInputElement)?.value;
              const t = (document.getElementById("range-to") as HTMLInputElement)?.value;
              onCustom(f, t);
            }}
            className={[
              "px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase border-2 cursor-pointer",
              data.preset === "custom" ? "bg-orange text-white border-orange" : "bg-white text-green border-green hover:bg-bg-deep",
            ].join(" ")}
          >
            Uygula
          </button>
        </div>
      </div>

      {!data.posthogConfigured && (
        <div className="bg-bg-deep border-2 border-green/30 text-green text-[11px] font-bold uppercase tracking-[0.1em] px-4 py-3">
          PostHog yapılandırılmadı — etkileşim grafikleri için <code className="text-orange">.env.local</code> içine anahtarları ekleyin.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Kpi label="Gerçek Satış" value={lira.format(kpis.totalSales)} />
        <Kpi label="Kişi" value={kpis.totalCovers ? tl.format(kpis.totalCovers) : "—"} />
        <Kpi label="Kişi Başı" value={kpis.avgSpendPerCover ? lira.format(kpis.avgSpendPerCover) : "—"} />
        <Kpi label="Menü Görüntüleme" value={tl.format(kpis.views)} />
        <Kpi label="Ort. Süre" value={duration(kpis.avgSeconds)} />
        <Kpi label="Garson Çağrısı" value={tl.format(kpis.waiterCalls)} />
      </div>

      {/* Headline comparison */}
      <ChartCard title="Gerçek Satış vs Menü Etkileşimi">
        <SalesVsEngagementChart data={data.comparison} />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Satış (Zaman İçinde)">
          <RevenueAreaChart data={data.revenueOverTime} />
        </ChartCard>
        <ChartCard title="En Çok Görüntülenen Ürünler">
          <HBarChart data={data.topViewed} note="Etkileşim verisi yok (PostHog gerekli)." />
        </ChartCard>
        <ChartCard title="Etkileşim Hunisi">
          <FunnelBars data={data.funnel} />
        </ChartCard>
        <ChartCard title="Yoğun Saatler">
          <PeakHoursChart data={data.peakHours} />
        </ChartCard>
        <ChartCard title="Kategori Popülerliği">
          <HBarChart data={data.categoryPopularity} color="#243845" note="Etkileşim verisi yok (PostHog gerekli)." />
        </ChartCard>
        <ChartCard title="Dil Dağılımı (en / tr)">
          <HBarChart data={data.localeSplit} note="Etkileşim verisi yok (PostHog gerekli)." />
        </ChartCard>
      </div>

      {data.bestSellers.length > 0 && (
        <ChartCard title="Gerçekte En Çok Satanlar (Excel)">
          <HBarChart data={data.bestSellers.map((b) => ({ name: b.item_name, count: b.qty }))} />
        </ChartCard>
      )}
    </div>
  );
}
