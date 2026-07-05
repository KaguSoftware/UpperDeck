"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import {
  ChartCard,
  SalesVsEngagementChart,
  RevenueAreaChart,
  HBarChart,
  FunnelBars,
  PeakHoursChart,
  AbandonedViewsChart,
} from "./_charts";
import { generateInsightsAction } from "./actions";
import type { NamedCount, AbandonedView } from "@/lib/analytics/posthog";

export type AnalyticsData = {
  preset: string;
  range: { from: string; to: string };
  posthogConfigured: boolean;
  insightsConfigured: boolean;
  kpis: {
    totalSales: number;
    totalCovers: number;
    avgSpendPerCover: number;
    sessions: number;
    avgSeconds: number;
    waiterCalls: number;
    views: number;
    cartConversion: number;
  };
  comparison: { date: string; revenue: number | null; covers: number | null; views: number; waiterCalls: number }[];
  revenueOverTime: { date: string; revenue: number; covers: number }[];
  topViewed: NamedCount[];
  topCarted: NamedCount[];
  tableActivity: NamedCount[];
  funnel: { step: string; count: number }[];
  peakHours: { hour: number; count: number }[];
  categoryPopularity: NamedCount[];
  localeSplit: NamedCount[];
  bestSellers: { item_name: string; qty: number; revenue: number }[];
  abandonedViews: AbandonedView[];
};

const PRESETS: { key: string; label: string }[] = [
  { key: "today", label: "Bugün" },
  { key: "7d", label: "7 Gün" },
  { key: "30d", label: "30 Gün" },
  { key: "90d", label: "90 Gün" },
];

const tl = new Intl.NumberFormat("tr-TR");
// Plain number (no currency style): the Bowlby display font has no ₺ glyph, so
// we render the amount in Bowlby and the ₺ separately in the UI font — see Kpi.
const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

function duration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}d ${s}s` : `${s}s`;
}

function Kpi({ label, value, unit }: { label: string; value: string; unit?: string }) {
  // The Bowlby display font is very wide, so long values (e.g. "1.234.567")
  // overrun the narrow cards. Step the size down as the string grows.
  const size =
    value.length > 11 ? "text-[20px]" : value.length > 9 ? "text-[26px]" : value.length > 6 ? "text-[32px]" : "text-[40px]";
  return (
    <div className="border-2 border-green bg-white p-4 sm:p-5 min-w-0 overflow-hidden">
      <div className="text-[10px] tracking-[0.22em] font-bold text-green/70 uppercase truncate">{label}</div>
      <div className="flex items-baseline gap-1 mt-1.5 whitespace-nowrap">
        {/* ₺ (and %) live outside the display font, which lacks those glyphs. */}
        {unit && <span className="font-ui font-extrabold text-[16px] text-green/70">{unit}</span>}
        <span className={`font-bowlby ${size} leading-none text-green`}>{value}</span>
      </div>
    </div>
  );
}

function AiInsights({ configured }: { configured: boolean }) {
  const params = useSearchParams();
  const [insights, setInsights] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const generate = useCallback(() => {
    setError(false);
    startTransition(async () => {
      const res = await generateInsightsAction({
        range: params.get("range") ?? undefined,
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
      });
      if (res.ok) setInsights(res.insights);
      else setError(true);
    });
  }, [params]);

  return (
    <section className="border-2 border-green bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="text-[11px] tracking-[0.2em] font-extrabold text-green/70 uppercase">Yapay Zekâ Yorumu</h3>
        {configured && (
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className={[
              "px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase border-2 cursor-pointer transition-colors",
              pending
                ? "bg-bg-deep text-green/50 border-green/30 cursor-wait"
                : "bg-orange text-white border-orange hover:bg-orange/90",
            ].join(" ")}
          >
            {pending ? "Oluşturuluyor…" : insights ? "Yeniden Oluştur" : "Yorum Oluştur"}
          </button>
        )}
      </div>
      {!configured ? (
        <p className="text-[12px] text-green/50 py-3">
          Yapay zekâ yorumu için XAI_API_KEY ortam değişkeni gerekli.
        </p>
      ) : error ? (
        <p className="text-[12px] text-orange font-bold py-3">Yorum oluşturulamadı — tekrar deneyin.</p>
      ) : insights ? (
        <ul className="flex flex-col gap-2 pt-2">
          {insights.map((s, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink">
              <span className="text-orange font-extrabold shrink-0">→</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-green/50 py-3">
          Seçili dönemin verilerini birkaç maddelik Türkçe yoruma çevirir: en çok/az satanlar, bakılıp alınmayanlar,
          içerik sorunları.
        </p>
      )}
    </section>
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
      // Next 16 client router cache serves the cached segment on a query-only
      // change, so force the server component to re-run with the new range.
      router.refresh();
    },
    [params, router]
  );

  const onCustom = useCallback(
    (from: string, to: string) => {
      if (!from || !to) return;
      router.push(`/admin/analytics?range=custom&from=${from}&to=${to}`);
      router.refresh();
    },
    [router]
  );

  // Derive the active preset from the live URL (not the possibly-cached server
  // prop) so the highlight tracks clicks immediately.
  const urlRange = params.get("range");
  const activePreset =
    urlRange === "custom" && params.get("from") && params.get("to")
      ? "custom"
      : ["today", "7d", "30d", "90d"].includes(urlRange ?? "")
        ? (urlRange as string)
        : data.preset;

  const { kpis } = data;

  // Distinguish "not configured" from "configured but no events yet".
  const engagementNote = data.posthogConfigured
    ? "Bu dönemde menü etkileşimi kaydedilmedi."
    : "Etkileşim verisi yok (PostHog gerekli).";

  return (
    <div className="flex flex-col gap-6">
      {/* Date range switcher */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => {
            const active = activePreset === p.key;
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
        </div>
        <div className="flex items-center gap-1.5 sm:ml-auto min-w-0">
          <input
            type="date"
            defaultValue={data.range.from}
            id="range-from"
            className="min-w-0 flex-1 sm:flex-none border-2 border-green bg-white px-2 py-1.5 text-[12px] text-ink"
          />
          <span className="text-green/60 text-[12px] shrink-0">→</span>
          <input
            type="date"
            defaultValue={data.range.to}
            id="range-to"
            className="min-w-0 flex-1 sm:flex-none border-2 border-green bg-white px-2 py-1.5 text-[12px] text-ink"
          />
          <button
            type="button"
            onClick={() => {
              const f = (document.getElementById("range-from") as HTMLInputElement)?.value;
              const t = (document.getElementById("range-to") as HTMLInputElement)?.value;
              onCustom(f, t);
            }}
            className={[
              "shrink-0 px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase border-2 cursor-pointer",
              activePreset === "custom" ? "bg-orange text-white border-orange" : "bg-white text-green border-green hover:bg-bg-deep",
            ].join(" ")}
          >
            Uygula
          </button>
        </div>
      </div>

      {!data.posthogConfigured && (
        <div className="bg-bg-deep border-2 border-green/30 text-green text-[11px] font-bold uppercase tracking-[0.1em] px-4 py-3">
          Menü etkileşim takibi henüz bağlı değil — etkileşim grafikleri şimdilik boş görünecek.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
        <Kpi label="Gerçek Satış" value={money.format(kpis.totalSales)} unit="₺" />
        <Kpi label="Kişi" value={kpis.totalCovers ? tl.format(kpis.totalCovers) : "—"} />
        <Kpi label="Kişi Başı" value={kpis.avgSpendPerCover ? money.format(kpis.avgSpendPerCover) : "—"} unit={kpis.avgSpendPerCover ? "₺" : undefined} />
        <Kpi label="Menü Görüntüleme" value={tl.format(kpis.views)} />
        <Kpi label="Medyan Süre" value={duration(kpis.avgSeconds)} />
        <Kpi label="Garson Çağrısı" value={tl.format(kpis.waiterCalls)} />
        <Kpi label="Sepet → Çağrı" value={kpis.cartConversion ? tl.format(kpis.cartConversion) : "—"} unit={kpis.cartConversion ? "%" : undefined} />
      </div>

      <AiInsights configured={data.insightsConfigured} />

      {/* Headline comparison */}
      <ChartCard title="Gerçek Satış vs Menü Etkileşimi">
        <SalesVsEngagementChart data={data.comparison} />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Satış (Zaman İçinde)">
          <RevenueAreaChart data={data.revenueOverTime} />
        </ChartCard>
        <ChartCard title="En Çok İncelenen Ürünler">
          <HBarChart data={data.topViewed} note={engagementNote} />
        </ChartCard>
        <ChartCard title="En Çok Sepete Eklenen">
          <HBarChart data={data.topCarted} color="#243845" note={engagementNote} />
        </ChartCard>
        <ChartCard title="Bakıp Almayanlar">
          <AbandonedViewsChart data={data.abandonedViews} note={engagementNote} />
        </ChartCard>
        <ChartCard title="Masa Aktivitesi (Garson Çağrısı)">
          <HBarChart data={data.tableActivity} note={engagementNote} />
        </ChartCard>
        <ChartCard title="Etkileşim Hunisi">
          <FunnelBars data={data.funnel} note={engagementNote} />
        </ChartCard>
        <ChartCard title="Yoğun Saatler">
          <PeakHoursChart data={data.peakHours} note={engagementNote} />
        </ChartCard>
        <ChartCard title="Kategori Popülerliği">
          <HBarChart data={data.categoryPopularity} color="#243845" note={engagementNote} />
        </ChartCard>
        <ChartCard title="Dil Dağılımı (en / tr)">
          <HBarChart data={data.localeSplit} note={engagementNote} />
        </ChartCard>
      </div>

      {data.bestSellers.length > 0 && (
        <ChartCard title="Gerçekte En Çok Satanlar">
          <HBarChart data={data.bestSellers.map((b) => ({ name: b.item_name, count: b.qty }))} />
        </ChartCard>
      )}
    </div>
  );
}
