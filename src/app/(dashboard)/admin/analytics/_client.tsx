"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  ChartCard,
  SalesVsEngagementChart,
  RevenueAreaChart,
  HBarChart,
  FunnelBars,
  PeakHoursChart,
  AbandonedViewsChart,
  ConversionBars,
  WeekHeatmapChart,
} from "./_charts";
import { generateInsightsAction } from "./actions";
import { Loader } from "@/components/Loader/components";
import type { NamedCount, AbandonedView, PriceBand } from "@/lib/analytics/posthog";
import type { ItemConversion } from "@/lib/analytics/compare";

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
  /** % change vs the previous period of equal length; null = no baseline. */
  deltas: {
    totalSales: number | null;
    totalCovers: number | null;
    avgSpendPerCover: number | null;
    views: number | null;
    avgSeconds: number | null;
    waiterCalls: number | null;
    cartConversion: number | null;
    sessions: number | null;
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
  itemConversion: ItemConversion[];
  priceBands: PriceBand[];
  weekHeatmap: { day: number; hour: number; count: number }[];
  insightsHistory: { date: string; rangeFrom: string; rangeTo: string; insights: string[] }[];
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

// Auto-refresh intervals. PostHog query results are cached server-side for
// 30s (posthog.ts), so a 1 min minimum always lands on fresh data.
const REFRESH_OPTIONS: { seconds: number; label: string }[] = [
  { seconds: 0, label: "Kapalı" },
  { seconds: 60, label: "1 dk" },
  { seconds: 120, label: "2 dk" },
  { seconds: 300, label: "5 dk" },
];
const REFRESH_STORAGE_KEY = "analytics-auto-refresh";

/**
 * Metabase-style auto-refresh: pick an interval, a countdown ticks in the
 * pill, and the dashboard silently re-fetches when it hits zero. The choice
 * persists in localStorage. Refreshes are skipped while the tab is hidden —
 * they'd be wasted work the user never sees.
 */
function AutoRefresh() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);
  const [left, setLeft] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [refreshing, startRefreshing] = useTransition();

  useEffect(() => {
    const saved = Number(localStorage.getItem(REFRESH_STORAGE_KEY));
    if (REFRESH_OPTIONS.some((o) => o.seconds === saved && saved > 0)) {
      setSeconds(saved);
      setLeft(saved);
    }
  }, []);

  const pick = (s: number) => {
    setSeconds(s);
    setLeft(s);
    localStorage.setItem(REFRESH_STORAGE_KEY, String(s));
  };

  // Countdown tick — pure state, no side effects in the updater (React may
  // re-run updaters, which made the refresh call unreliable here before).
  useEffect(() => {
    if (seconds === 0) return;
    const id = setInterval(() => setLeft((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  // Fire on zero, then rearm. Hidden tabs skip the fetch but still rearm so
  // the timer doesn't stall at 0:00 until the next visibility change.
  useEffect(() => {
    if (seconds === 0 || left > 0) return;
    if (document.visibilityState === "visible") {
      startRefreshing(() => router.refresh());
      setLastRefresh(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }
    setLeft(seconds);
  }, [left, seconds, router]);

  return (
    <div className="flex items-center gap-2">
      {lastRefresh && (
        <span className="text-[10px] font-bold text-green/50 tabular-nums" title="Son yenileme">
          Son: {lastRefresh}
        </span>
      )}
      <span className="text-[10px] tracking-[0.18em] font-extrabold text-green/60 uppercase">Oto Yenile</span>
      <div className="flex items-center">
        {REFRESH_OPTIONS.map((o) => {
          const active = seconds === o.seconds;
          return (
            <button
              key={o.seconds}
              type="button"
              onClick={() => pick(o.seconds)}
              className={[
                "px-2.5 py-1.5 font-ui font-extrabold text-[10px] tracking-[0.12em] uppercase border-2 -ml-0.5 first:ml-0 cursor-pointer transition-colors",
                active ? "bg-green text-white border-green" : "bg-white text-green border-green/40 hover:bg-bg-deep",
              ].join(" ")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {seconds > 0 && (
        <span className="text-[10px] font-extrabold text-green/60 tabular-nums w-8">
          {refreshing ? (
            <span className="text-orange animate-pulse">●</span>
          ) : (
            `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`
          )}
        </span>
      )}
    </div>
  );
}

function duration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}d ${s}s` : `${s}s`;
}

function Kpi({ label, value, unit, delta }: { label: string; value: string; unit?: string; delta?: number | null }) {
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
      {/* vs previous period of equal length; hidden when there's no baseline */}
      {delta != null && (
        <div
          className={`mt-1.5 text-[11px] font-extrabold ${delta > 0 ? "text-green" : delta < 0 ? "text-orange" : "text-green/50"}`}
          title="Önceki döneme göre"
        >
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {delta > 0 ? "+" : ""}
          {delta}%
        </div>
      )}
    </div>
  );
}

/**
 * The whole funnel per item in one place: viewed → carted → actually sold.
 * "Looked at a lot, never bought" cases stand out without cross-referencing
 * three separate charts.
 */
function ConversionTable({ rows, note }: { rows: ItemConversion[]; note: string }) {
  if (!rows.length) {
    return <div className="h-30 grid place-items-center text-[12px] text-green/50 text-center px-4">{note}</div>;
  }
  const th = "text-[10px] tracking-[0.14em] font-extrabold text-green/60 uppercase text-right py-2 px-3";
  const td = "text-[13px] font-bold text-ink text-right py-2 px-3 tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-green">
            <th className={`${th} text-left`}>Ürün</th>
            <th className={th}>Görüntüleme</th>
            <th className={th}>Sepet</th>
            <th className={th}>Satılan</th>
            <th className={th}>Görünt.→Sepet</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-green/15">
              <td className={`${td} text-left whitespace-nowrap max-w-45 truncate`} title={r.name}>{r.name}</td>
              <td className={td}>{tl.format(r.views)}</td>
              <td className={td}>{tl.format(r.carts)}</td>
              <td className={td}>{r.sold ? tl.format(r.sold) : "—"}</td>
              <td className={`${td} ${r.views >= 5 && r.convPct === 0 ? "text-orange" : ""}`}>{r.convPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-green/50 font-bold">
        Satılan = girilen gerçek satışlardan · turuncu %0 = çok bakılıp hiç sepete eklenmeyen
      </p>
    </div>
  );
}

type InsightsHistoryEntry = { date: string; rangeFrom: string; rangeTo: string; insights: string[] };

function AiInsights({ configured, history }: { configured: boolean; history: InsightsHistoryEntry[] }) {
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
          Yapay zekâ yorumu için GROQ_API_KEY ortam değişkeni gerekli.
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
          içerik sorunları. Önceki analizleri hatırlar ve takip eder.
        </p>
      )}
      {history.length > 0 && (
        <details className="mt-3 border-t-2 border-green/15 pt-3">
          <summary className="cursor-pointer text-[10px] tracking-[0.18em] font-extrabold text-green/50 uppercase select-none">
            Önceki analizler ({history.length})
          </summary>
          <div className="flex flex-col gap-4 pt-3">
            {history.map((h, i) => (
              <div key={`${h.date}-${i}`}>
                <div className="text-[10px] font-extrabold text-green/60 uppercase tracking-[0.14em] mb-1.5">
                  {h.date} · dönem {h.rangeFrom} → {h.rangeTo}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {h.insights.map((s, j) => (
                    <li key={j} className="flex gap-2 text-[12px] leading-relaxed text-ink/80">
                      <span className="text-green/40 font-extrabold shrink-0">→</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export function AnalyticsClient({ data }: { data: AnalyticsData }) {
  const router = useRouter();
  const params = useSearchParams();
  // Pending while the server component re-fetches the new range — drives the
  // loading overlay so a range click gives immediate feedback.
  const [switching, startSwitching] = useTransition();

  const setRange = useCallback(
    (preset: string) => {
      const q = new URLSearchParams(params.toString());
      q.set("range", preset);
      q.delete("from");
      q.delete("to");
      startSwitching(() => {
        router.push(`/admin/analytics?${q.toString()}`);
        // Next 16 client router cache serves the cached segment on a query-only
        // change, so force the server component to re-run with the new range.
        router.refresh();
      });
    },
    [params, router]
  );

  const onCustom = useCallback(
    (from: string, to: string) => {
      if (!from || !to) return;
      startSwitching(() => {
        router.push(`/admin/analytics?range=custom&from=${from}&to=${to}`);
        router.refresh();
      });
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
    <div className="relative flex flex-col gap-6" aria-busy={switching}>
      {/* Range-switch feedback: dim the dashboard and pin a loader while the
          server re-fetches. sticky keeps it visible however far down you are. */}
      {switching && (
        <div className="absolute inset-0 z-20 bg-bg/70">
          <div className="sticky top-0 h-screen grid place-items-center">
            <Loader size="md" label="Yükleniyor" />
          </div>
        </div>
      )}
      {/* Auto-refresh bar — stays pinned as an overlay while scrolling */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-bg/90 backdrop-blur-sm flex justify-end">
        <AutoRefresh />
      </div>

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
                disabled={switching}
                className={[
                  "px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase border-2 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-wait",
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
            disabled={switching}
            className={[
              "shrink-0 px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase border-2 cursor-pointer disabled:opacity-50 disabled:cursor-wait",
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
        <Kpi label="Gerçek Satış" value={money.format(kpis.totalSales)} unit="₺" delta={data.deltas.totalSales} />
        <Kpi label="Kişi" value={kpis.totalCovers ? tl.format(kpis.totalCovers) : "—"} delta={data.deltas.totalCovers} />
        <Kpi label="Kişi Başı" value={kpis.avgSpendPerCover ? money.format(kpis.avgSpendPerCover) : "—"} unit={kpis.avgSpendPerCover ? "₺" : undefined} delta={data.deltas.avgSpendPerCover} />
        <Kpi label="Menü Görüntüleme" value={tl.format(kpis.views)} delta={data.deltas.views} />
        <Kpi label="Medyan Süre" value={duration(kpis.avgSeconds)} delta={data.deltas.avgSeconds} />
        <Kpi label="Garson Çağrısı" value={tl.format(kpis.waiterCalls)} delta={data.deltas.waiterCalls} />
        <Kpi label="Sepet → Çağrı" value={kpis.cartConversion ? tl.format(kpis.cartConversion) : "—"} unit={kpis.cartConversion ? "%" : undefined} delta={data.deltas.cartConversion} />
      </div>

      <AiInsights configured={data.insightsConfigured} history={data.insightsHistory} />

      {/* Item funnel table — the strongest single view for menu decisions */}
      <ChartCard title="Ürün Dönüşümü (Görüntüleme → Sepet → Satış)">
        <ConversionTable rows={data.itemConversion} note={engagementNote} />
      </ChartCard>

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
        <ChartCard title="Masa Aktivitesi (Garson + Hesap Çağrısı)">
          <HBarChart data={data.tableActivity} note={engagementNote} />
        </ChartCard>
        <ChartCard title="Etkileşim Hunisi">
          <FunnelBars data={data.funnel} note={engagementNote} />
        </ChartCard>
        <ChartCard title="Yoğun Saatler">
          <PeakHoursChart data={data.peakHours} note={engagementNote} />
        </ChartCard>
        <ChartCard title="Fiyat Aralığına Göre Dönüşüm">
          <ConversionBars
            data={data.priceBands.map((b) => ({ label: b.band, views: b.views, carts: b.carts }))}
            note={engagementNote}
          />
        </ChartCard>
        <ChartCard title="Kategori Popülerliği">
          <HBarChart data={data.categoryPopularity} color="#243845" note={engagementNote} />
        </ChartCard>
        <ChartCard title="Dil Dağılımı (en / tr)">
          <HBarChart data={data.localeSplit} note={engagementNote} />
        </ChartCard>
      </div>

      <ChartCard title="Haftalık Yoğunluk Haritası (Gün × Saat)">
        <WeekHeatmapChart data={data.weekHeatmap} note={engagementNote} />
      </ChartCard>

      {data.bestSellers.length > 0 && (
        <ChartCard title="Gerçekte En Çok Satanlar">
          <HBarChart data={data.bestSellers.map((b) => ({ name: b.item_name, count: b.qty }))} />
        </ChartCard>
      )}
    </div>
  );
}
