"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
import { generateInsightsAction, setExcludedItemsAction } from "./actions";
import { Loader } from "@/components/Loader/components";
import { buildOverview, type OverviewTone } from "@/lib/analytics/overview";
import type { NamedCount, AbandonedView, PriceBand, LocalePref } from "@/lib/analytics/posthog";
import type { ItemConversion, HiddenGem, ItemMomentum } from "@/lib/analytics/compare";
import type { PromoPerformance } from "@/lib/analytics/promo";
import type { ItemPair } from "@/lib/analytics/basket";

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
  /** Converts views→sales well but under-exposed — promote candidates. */
  hiddenGems: HiddenGem[];
  /** Per-item view momentum vs the previous period. */
  momentum: { rising: ItemMomentum[]; fading: ItemMomentum[] };
  /** Featured-banner / suggested-rail engagement + follow-through. */
  promo: PromoPerformance;
  /** Bought-together item pairs from real orders. */
  basket: { pairs: ItemPair[]; orders: number };
  /** Behavior split by menu language (tr / en). */
  localePrefs: LocalePref[];
  /** Item names the owner chose to omit from item-level views + insights. */
  excludedItems: string[];
  /** Candidate item names for the ignore dropdown (seen this range ∪ excluded). */
  itemOptions: string[];
  /** Latest persisted AI finding set for the current range; null when none yet. */
  initialInsights: string[] | null;
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

// Sold-per-view as a ratio ("1,2×"), not a probability ("120%"). Views count
// distinct phone sessions that opened the item; sold counts real POS units — two
// different populations, so this is an index, not "% of viewers who bought".
// Framing it as a multiplier makes >1× ("sells more than it's browsed" — staples
// ordered verbally) read as a signal instead of a broken over-100% conversion.
const ratioFmt = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function saleRatio(sold: number, views: number): string {
  if (views === 0) return "—";
  if (sold === 0) return "0×";
  const r = sold / views;
  if (r < 0.1) return "<0,1×";
  return `${ratioFmt.format(r)}×`;
}

// Guest-count estimate factor: people per unique visit (menu session). Used only
// when no real covers were entered for the period. Picker persists in localStorage.
const COVERS_MULT_OPTIONS = [1.5, 2, 2.5, 3];
const COVERS_MULT_DEFAULT = 2;
const COVERS_MULT_KEY = "analytics-covers-multiplier";

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

/**
 * People-per-visit picker for the guest-count estimate. Only relevant when no
 * real covers were entered — the parent renders it in that case. Pure client
 * state persisted in localStorage (like AutoRefresh); changing it re-derives the
 * "~tahmini" Kişi / Kişi Başı cards instantly, no refetch.
 */
function CoversMultiplier({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] tracking-[0.18em] font-extrabold text-green/60 uppercase"
        title="Menüyü açan her tekil ziyaret için varsayılan kişi sayısı — tahmini Kişi hesabında kullanılır"
      >
        Kişi Tahmini ×
      </span>
      <div className="flex items-center">
        {COVERS_MULT_OPTIONS.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className={[
                "px-2.5 py-1.5 font-ui font-extrabold text-[10px] tracking-[0.12em] uppercase border-2 -ml-0.5 first:ml-0 cursor-pointer transition-colors tabular-nums",
                active ? "bg-green text-white border-green" : "bg-white text-green border-green/40 hover:bg-bg-deep",
              ].join(" ")}
            >
              {o.toLocaleString("tr-TR")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function duration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}d ${s}s` : `${s}s`;
}

function Kpi({
  label,
  value,
  unit,
  delta,
  estimated,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: number | null;
  /** Renders a "~" prefix + "tahmini" note (used for the sessions-based cover estimate). */
  estimated?: boolean;
}) {
  // The Bowlby display font is very wide, so long values (e.g. "1.234.567")
  // overrun the narrow cards. Step the size down as the string grows.
  const size =
    value.length > 11 ? "text-[20px]" : value.length > 9 ? "text-[26px]" : value.length > 6 ? "text-[32px]" : "text-[40px]";
  return (
    <div className="border-2 border-green bg-white p-4 sm:p-5 min-w-0 overflow-hidden">
      <div className="text-[10px] tracking-[0.22em] font-bold text-green/70 uppercase truncate">{label}</div>
      <div className="flex items-baseline gap-1 mt-1.5 whitespace-nowrap">
        {/* "~", ₺ and % live outside the display font, which lacks those glyphs. */}
        {estimated && <span className="font-ui font-extrabold text-[16px] text-green/50">~</span>}
        {unit && <span className="font-ui font-extrabold text-[16px] text-green/70">{unit}</span>}
        <span className={`font-bowlby ${size} leading-none text-green`}>{value}</span>
      </div>
      {estimated ? (
        <div
          className="mt-1.5 text-[11px] font-extrabold text-green/40"
          title="Gerçek kişi sayısı girilmedi — menüyü açan tekil ziyaretlerden tahmin edildi"
        >
          tahmini
        </div>
      ) : (
        // vs previous period of equal length; hidden when there's no baseline
        delta != null && (
          <div
            className={`mt-1.5 text-[11px] font-extrabold ${delta > 0 ? "text-green" : delta < 0 ? "text-orange" : "text-green/50"}`}
            title="Önceki döneme göre"
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {delta > 0 ? "+" : ""}
            {delta}%
          </div>
        )
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
            <th className={th}>Satış/Görünt.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-green/15">
              <td className={`${td} text-left whitespace-nowrap max-w-45 truncate`} title={r.name}>{r.name}</td>
              <td className={td}>{tl.format(r.views)}</td>
              <td className={td}>{tl.format(r.carts)}</td>
              <td className={td}>{r.sold ? tl.format(r.sold) : "—"}</td>
              <td className={`${td} ${r.views >= 5 && r.sold === 0 ? "text-orange" : r.views > 0 && r.sold / r.views >= 1 ? "text-green" : ""}`}>{saleRatio(r.sold, r.views)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-green/50 font-bold">
        Satılan = girilen gerçek satışlardan · Satış/Görünt. = her görüntülemeye düşen satış (1× = görüntülendiği kadar satılıyor, 1×+ = menüde bakılmadan da sipariş ediliyor) · turuncu = çok görüntülenip hiç satılmayan
      </p>
    </div>
  );
}

// Verdict → chip label + colors. Literal class strings (no runtime concatenation)
// so Tailwind's JIT scanner actually generates them.
const TONE: Record<OverviewTone, { label: string; chip: string; edge: string }> = {
  good: { label: "İyi Gidiyor", chip: "bg-green text-white border-green", edge: "border-l-green" },
  mixed: { label: "Karışık", chip: "bg-orange/15 text-orange border-orange/40", edge: "border-l-orange" },
  weak: { label: "Dikkat", chip: "bg-orange text-white border-orange", edge: "border-l-orange" },
  neutral: { label: "Dengeli", chip: "bg-bg-deep text-green border-green/40", edge: "border-l-green/40" },
};

function OverviewGroup({ title, mark, markColor, lines }: { title: string; mark: string; markColor: string; lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div>
      <div className="text-[10px] tracking-[0.18em] font-extrabold text-green/60 uppercase mb-2">{title}</div>
      <ul className="flex flex-col gap-1.5">
        {lines.map((s, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink">
            <span className={`${markColor} font-extrabold shrink-0`}>{mark}</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Deterministic verdict of the selected period, derived (see lib/analytics/overview)
 * purely from the real numbers already on the page — no model call, so it can never
 * invent a metric. Empty groups are hidden; when there's nothing to say at all it
 * falls back to a gentle "not enough data yet" note.
 */
function Overview({ data }: { data: AnalyticsData }) {
  const ov = buildOverview(data);
  const tone = TONE[ov.tone];
  const hasContent = ov.strengths.length + ov.push.length + ov.watch.length > 0;

  return (
    <section className={`border-2 border-green bg-white p-5 border-l-8 ${tone.edge}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-bowlby text-[13px] text-green leading-none">AI</span>
          <h3 className="text-[11px] tracking-[0.2em] font-extrabold text-green/70 uppercase">Genel Bakış</h3>
        </div>
        <span className={`px-2.5 py-1 border-2 font-ui font-extrabold text-[10px] tracking-[0.14em] uppercase ${tone.chip}`}>
          {tone.label}
        </span>
      </div>

      <p className="text-[15px] font-bold text-ink leading-snug mb-4">{ov.headline}</p>

      {hasContent ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <OverviewGroup title="Güçlü Yanlar" mark="✓" markColor="text-green" lines={ov.strengths} />
          <OverviewGroup title="Öne Çıkar" mark="↑" markColor="text-green" lines={ov.push} />
          <OverviewGroup title="Gözden Geçir" mark="!" markColor="text-orange" lines={ov.watch} />
        </div>
      ) : (
        <p className="text-[12px] text-green/50">
          Henüz özetlenecek yeterli veri yok — gerçek satış girildikçe ve etkileşim biriktikçe burası dolacak.
        </p>
      )}

      <p className="mt-4 text-[10px] text-green/40 font-bold">
        Otomatik özet — yalnızca girilen gerçek satış ve etkileşim verilerinden çıkarılır, tahmin içermez.
      </p>
    </section>
  );
}

type InsightsHistoryEntry = { date: string; rangeFrom: string; rangeTo: string; insights: string[] };

type Finding = { text: string; isNew: boolean };

/**
 * LLM findings for the period. Auto-generates on load when nothing is stored for
 * the range, then reuses the stored set so repeated visits stay consistent rather
 * than surfacing fresh random findings. "Tekrar Kontrol Et" runs a validation pass
 * that keeps still-true findings, drops resolved ones, and adds genuinely new ones.
 *
 * The parent remounts this per range (key={rangeKey}), so `initial` seeds state
 * directly and a same-range router.refresh() (from a recheck) won't reset it.
 */
function AiInsights({
  configured,
  initial,
  history,
}: {
  configured: boolean;
  initial: string[] | null;
  history: InsightsHistoryEntry[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [findings, setFindings] = useState<Finding[] | null>(() =>
    initial && initial.length ? initial.map((t) => ({ text: t, isNew: false })) : null
  );
  const [resolved, setResolved] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (mode: "load" | "recheck") => {
      setError(false);
      startTransition(async () => {
        const res = await generateInsightsAction({
          range: params.get("range") ?? undefined,
          from: params.get("from") ?? undefined,
          to: params.get("to") ?? undefined,
          mode,
        });
        if (res.ok) {
          setFindings(res.findings);
          setResolved(res.resolved);
          // A recheck also re-derives the deterministic overview + KPIs from fresh
          // data. Same range → same key here, so our own state survives the refresh.
          if (mode === "recheck") router.refresh();
        } else {
          setError(true);
        }
      });
    },
    [params, router]
  );

  // Auto-generate on first mount when nothing is stored for this range yet.
  const didAuto = useRef(false);
  useEffect(() => {
    if (!configured || findings !== null || didAuto.current) return;
    didAuto.current = true;
    run("load");
  }, [configured, findings, run]);

  const hasFindings = findings !== null && findings.length > 0;
  const buttonLabel = pending ? "Kontrol ediliyor…" : hasFindings ? "Tekrar Kontrol Et" : "Yorum Oluştur";

  // Newest (recheck-added) findings float to the top so they aren't hidden below
  // the fold; the rest keep their order. Collapsed to the first 4 with a toggle.
  const VISIBLE_LIMIT = 4;
  const sorted = findings ? [...findings].sort((a, b) => Number(b.isNew) - Number(a.isNew)) : [];
  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_LIMIT);

  return (
    <section className="border-2 border-green bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="text-[11px] tracking-[0.2em] font-extrabold text-green/70 uppercase">Yapay Zekâ Yorumu</h3>
        {configured && (
          <button
            type="button"
            onClick={() => run(hasFindings ? "recheck" : "load")}
            disabled={pending}
            className={[
              "px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase border-2 cursor-pointer transition-colors",
              pending
                ? "bg-bg-deep text-green/50 border-green/30 cursor-wait"
                : "bg-orange text-white border-orange hover:bg-orange/90",
            ].join(" ")}
          >
            {buttonLabel}
          </button>
        )}
      </div>
      {!configured ? (
        <p className="text-[12px] text-green/50 py-3">
          Yapay zekâ yorumu için GROQ_API_KEY ortam değişkeni gerekli.
        </p>
      ) : error ? (
        <p className="text-[12px] text-orange font-bold py-3">Yorum oluşturulamadı — tekrar deneyin.</p>
      ) : hasFindings ? (
        <>
          <ul className="flex flex-col gap-2 pt-2">
            {visible.map((f, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink">
                <span className="text-orange font-extrabold shrink-0">→</span>
                <span>
                  {f.text}
                  {f.isNew && (
                    <span className="ml-2 px-1.5 py-0.5 align-middle bg-green text-white font-ui font-extrabold text-[9px] tracking-[0.14em] uppercase">
                      Yeni
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {sorted.length > VISIBLE_LIMIT && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-3 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase text-orange hover:text-orange/70 cursor-pointer transition-colors"
            >
              {expanded ? "Daha az göster" : `Daha fazla göster (+${sorted.length - VISIBLE_LIMIT})`}
            </button>
          )}
          {resolved.length > 0 && (
            <div className="mt-4 border-t-2 border-green/15 pt-3">
              <div className="text-[10px] tracking-[0.18em] font-extrabold text-green/50 uppercase mb-2">
                Çözüldü / artık geçerli değil
              </div>
              <ul className="flex flex-col gap-1.5">
                {resolved.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-green/60 line-through decoration-green/30">
                    <span className="text-green/40 font-extrabold shrink-0 no-underline">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : pending ? (
        <p className="text-[12px] text-green/50 py-3">Veriler yoruma çevriliyor…</p>
      ) : (
        <p className="text-[12px] text-green/50 py-3">
          Seçili dönemin verilerini Türkçe bulgulara çevirir: en çok/az satanlar, bakılıp alınmayanlar,
          içerik sorunları. Bulgular kalıcıdır; “Tekrar Kontrol Et” mevcut bulguları doğrular ve yenilerini ekler.
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

/**
 * "Ignore items" dropdown. Lets the owner tick menu entries that should be left
 * out of the item-level analysis (top viewed/carted, conversion, abandoned,
 * best-sellers → and therefore the Overview + AI insights) — e.g. an upsell that
 * tops every chart but carries no signal. Money/amount totals are unaffected.
 *
 * The selection persists server-side (settings table); each toggle saves and
 * refreshes the dashboard so the charts and insights update immediately.
 */
function IgnoreItemsMenu({ options, excluded }: { options: string[]; excluded: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(excluded);
  const [saving, startSaving] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const selectedKeys = new Set(selected.map((s) => s.trim().toLocaleLowerCase("tr")));
  const isOn = (name: string) => selectedKeys.has(name.trim().toLocaleLowerCase("tr"));

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const save = (next: string[]) => {
    setSelected(next); // optimistic — checkbox reacts instantly
    startSaving(async () => {
      const res = await setExcludedItemsAction(next);
      // Re-derive the whole dashboard (charts + Overview) with the new exclusions.
      if (res.ok) router.refresh();
    });
  };

  const toggle = (name: string) =>
    save(isOn(name) ? selected.filter((s) => s.trim().toLocaleLowerCase("tr") !== name.trim().toLocaleLowerCase("tr")) : [...selected, name]);

  const count = selected.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "flex items-center gap-1.5 px-2.5 py-1.5 font-ui font-extrabold text-[10px] tracking-[0.14em] uppercase border-2 cursor-pointer transition-colors",
          count > 0 ? "bg-green text-white border-green" : "bg-white text-green border-green/40 hover:bg-bg-deep",
        ].join(" ")}
        title="Analiz ve yapay zekâ yorumundan ürün çıkar (satış/tutar toplamları etkilenmez)"
      >
        <span>Ürün Yoksay</span>
        {count > 0 && (
          <span className="px-1.5 py-0.5 bg-white text-green font-ui font-extrabold text-[9px] leading-none tabular-nums">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-72 max-w-[80vw] border-2 border-green bg-white shadow-lg">
          <div className="px-3 py-2 border-b-2 border-green/20 flex items-center justify-between gap-2">
            <span className="text-[10px] tracking-[0.14em] font-extrabold text-green/70 uppercase">
              İçgörüden çıkar
            </span>
            {count > 0 && (
              <button
                type="button"
                onClick={() => save([])}
                className="text-[10px] font-extrabold text-orange hover:text-orange/70 uppercase tracking-[0.1em] cursor-pointer"
              >
                Temizle
              </button>
            )}
          </div>
          <p className="px-3 pt-2 text-[10px] leading-relaxed text-green/50 font-bold">
            Seçilenler en çok satan / incelenen listelerinden ve yapay zekâ yorumundan çıkarılır. Satış ve tutar toplamları değişmez.
          </p>
          <div className="max-h-64 overflow-y-auto py-1.5">
            {options.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-green/50">Henüz ürün verisi yok.</p>
            ) : (
              options.map((name) => (
                <label
                  key={name}
                  className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-ink hover:bg-bg-deep cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isOn(name)}
                    disabled={saving}
                    onChange={() => toggle(name)}
                    className="size-3.5 accent-green shrink-0"
                  />
                  <span className="truncate" title={name}>{name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Shared scaffold for the compact stat sections below: a divided list of
 *  "name on the left, metrics on the right" rows. Each caller supplies its own
 *  right-hand span so per-section spacing/figures stay exactly as they were. */
function StatList({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col divide-y divide-green/10">{children}</ul>;
}
function StatRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="text-[13px] font-bold text-ink truncate min-w-0" title={name}>{name}</span>
      {children}
    </li>
  );
}

/** Converts views into real sales at a high rate, but few diners see it → promote. */
function HiddenGems({ items }: { items: HiddenGem[] }) {
  if (!items.length) return null;
  return (
    <ChartCard title="Gizli Cevherler (az görülüyor, çok satıyor)">
      <StatList>
        {items.map((g) => (
          <StatRow key={g.name} name={g.name}>
            <span className="flex items-center gap-3 shrink-0 text-[12px] tabular-nums">
              <span className="text-green/50">{tl.format(g.views)} görüntüleme</span>
              <span className="text-green/50">{tl.format(g.sold)} satış</span>
              <span className="font-bowlby text-green text-[15px] leading-none">{g.convPct}%</span>
            </span>
          </StatRow>
        ))}
      </StatList>
      <p className="mt-2 text-[10px] text-green/50 font-bold">
        Görüntüleyenlerin büyük kısmı satın alıyor ama az kişi görüyor — menüde üst sıraya taşı / öne çıkar.
      </p>
    </ChartCard>
  );
}

/** Rising and fading items by view momentum vs the previous period. */
function Momentum({ rising, fading }: { rising: ItemMomentum[]; fading: ItemMomentum[] }) {
  if (!rising.length && !fading.length) return null;
  const Row = ({ m, up }: { m: ItemMomentum; up: boolean }) => (
    <StatRow name={m.name}>
      <span className="flex items-center gap-2 shrink-0 text-[12px] tabular-nums">
        <span className="text-green/40">{tl.format(m.previous)}→{tl.format(m.current)}</span>
        <span className={`font-extrabold ${up ? "text-green" : "text-orange"}`}>
          {m.isNew ? "YENİ" : `${(m.deltaPct ?? 0) > 0 ? "▲ +" : "▼ "}${m.deltaPct}%`}
        </span>
      </span>
    </StatRow>
  );
  return (
    <ChartCard title="Yükselenler / Düşenler (görüntülenme ivmesi)">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <div>
          <div className="text-[10px] tracking-[0.18em] font-extrabold text-green/60 uppercase mb-1">Yükselenler</div>
          {rising.length ? (
            <StatList>{rising.map((m) => <Row key={m.name} m={m} up />)}</StatList>
          ) : (
            <p className="text-[11px] text-green/40 py-2">—</p>
          )}
        </div>
        <div>
          <div className="text-[10px] tracking-[0.18em] font-extrabold text-orange/70 uppercase mb-1">Düşenler</div>
          {fading.length ? (
            <StatList>{fading.map((m) => <Row key={m.name} m={m} up={false} />)}</StatList>
          ) : (
            <p className="text-[11px] text-green/40 py-2">—</p>
          )}
        </div>
      </div>
      <p className="mt-2 text-[10px] text-green/50 font-bold">
        Önceki döneme göre görüntülenme değişimi. “Yeni” = geçen dönem yokken bu dönem öne çıkan.
      </p>
    </ChartCard>
  );
}

/** Which items get ordered together — combo / upsell / suggested-rail fuel. */
function BoughtTogether({ pairs, orders }: { pairs: ItemPair[]; orders: number }) {
  if (orders === 0) return null;
  return (
    <ChartCard title="Birlikte Alınanlar">
      {pairs.length === 0 ? (
        <div className="h-24 grid place-items-center text-[12px] text-green/50 text-center px-4">
          {tl.format(orders)} siparişte belirgin bir ikili örüntü yok.
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {pairs.map((p) => (
              <li key={`${p.a}__${p.b}`} className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-ink min-w-0 truncate">
                  <span className="font-extrabold">{p.a}</span>
                  <span className="text-green/40 mx-1.5">+</span>
                  <span className="font-bold">{p.b}</span>
                </span>
                <span className="flex items-center gap-3 shrink-0 text-[12px] tabular-nums">
                  <span className="text-green/50">{tl.format(p.count)} sipariş</span>
                  <span className="font-bowlby text-green text-[15px] leading-none">{p.confidencePct}%</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[10px] text-green/50 font-bold">
            “%” = ilk ürünü sipariş edenlerin ikinciyi de alma oranı · {tl.format(orders)} sipariş üzerinden · kombin/öneri fırsatı.
          </p>
        </>
      )}
    </ChartCard>
  );
}

/** Is the featured banner / suggested rail earning its prime menu real estate? */
function PromoPerformance({ promo }: { promo: PromoPerformance }) {
  if (!promo.hasData) return null;
  const Block = ({ label, s }: { label: string; s: { clicks: number; sessions: number; convPct: number } }) => (
    <div className="border-2 border-green/30 p-3">
      <div className="text-[10px] tracking-[0.16em] font-extrabold text-green/60 uppercase truncate">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="font-bowlby text-[26px] text-green leading-none">{tl.format(s.clicks)}</span>
        <span className="text-[11px] font-bold text-green/50">tıklama</span>
      </div>
      <div className="mt-1.5 text-[11px] font-bold text-green/60">
        {tl.format(s.sessions)} oturum · <span className="text-orange">{s.convPct}%</span> sepete ekledi
      </div>
    </div>
  );
  return (
    <ChartCard title="Öne Çıkan / Öneri Performansı">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Block label="Öne Çıkan (Başlık)" s={promo.featured} />
        <Block label="Öneri Rayı" s={promo.suggested} />
      </div>
      {promo.topSuggested.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] tracking-[0.16em] font-extrabold text-green/60 uppercase mb-1.5">En Çok Tıklanan Öneriler</div>
          <StatList>
            {promo.topSuggested.map((t) => (
              <li key={t.name} className="flex items-center justify-between py-1.5 text-[12px]">
                <span className="font-bold text-ink truncate min-w-0" title={t.name}>{t.name}</span>
                <span className="tabular-nums text-green/50 shrink-0">{tl.format(t.clicks)}</span>
              </li>
            ))}
          </StatList>
        </div>
      )}
      <p className="mt-2 text-[10px] text-green/50 font-bold">
        “%” = o alana tıklayan oturumların sepete ekleme oranı — alanın işe yarayıp yaramadığını gösterir.
      </p>
    </ChartCard>
  );
}

/** Per-locale (tr / en) sessions, dwell and top items — tourist vs local tastes. */
function LocalePrefs({ locales }: { locales: LocalePref[] }) {
  if (!locales.length) return null;
  const label = (l: string) => (l === "tr" ? "🇹🇷 Türkçe menü" : l === "en" ? "🇬🇧 İngilizce menü" : l);
  return (
    <ChartCard title="Turist vs Yerli (menü diline göre)">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {locales.map((l) => (
          <div key={l.locale}>
            <div className="flex items-center justify-between gap-2 mb-1.5 pb-1.5 border-b-2 border-green/15">
              <span className="text-[12px] font-extrabold text-green">{label(l.locale)}</span>
              <span className="text-[11px] font-bold text-green/50 tabular-nums">
                {tl.format(l.sessions)} oturum · {duration(l.medianSeconds)}
              </span>
            </div>
            {l.topItems.length ? (
              <ol className="flex flex-col gap-1">
                {l.topItems.map((it, i) => (
                  <li key={it.name} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-ink truncate min-w-0">
                      <span className="text-green/40 font-bold mr-1.5">{i + 1}</span>
                      {it.name}
                    </span>
                    <span className="tabular-nums text-green/50 shrink-0">{tl.format(it.count)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[11px] text-green/40">Veri yok.</p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-green/50 font-bold">
        Her dil için en çok görüntülenen ürünler ve oturum/süre — dile göre öne çıkarmayı şekillendirir.
      </p>
    </ChartCard>
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

  // Guest-count estimate factor (people per unique visit) — client-side + persisted,
  // like the auto-refresh interval. Changing it re-derives the cards instantly.
  const [coversMult, setCoversMult] = useState(COVERS_MULT_DEFAULT);
  useEffect(() => {
    const saved = Number(localStorage.getItem(COVERS_MULT_KEY));
    if (COVERS_MULT_OPTIONS.includes(saved)) setCoversMult(saved);
  }, []);
  const pickCoversMult = (v: number) => {
    setCoversMult(v);
    localStorage.setItem(COVERS_MULT_KEY, String(v));
  };

  // Covers: real entered figures win; otherwise fall back to the sessions-based
  // estimate (flagged "~tahmini"). Per-cover spend follows the same rule.
  const coversReal = kpis.totalCovers > 0;
  const coversEst = !coversReal && kpis.sessions > 0;
  const estimatedCovers = coversEst ? Math.round(kpis.sessions * coversMult) : null;
  const estimatedSpendPerCover =
    estimatedCovers && kpis.totalSales > 0 ? kpis.totalSales / estimatedCovers : null;
  const spendReal = coversReal && kpis.avgSpendPerCover > 0;
  const spendEst = coversEst && (estimatedSpendPerCover ?? 0) > 0;

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
      {/* Controls bar — ignore-items menu + covers-estimate + auto-refresh, pinned */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-bg/90 backdrop-blur-sm flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <IgnoreItemsMenu options={data.itemOptions} excluded={data.excludedItems} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Only shown when Kişi is running on the estimate (no real covers entered) */}
          {coversEst && <CoversMultiplier value={coversMult} onChange={pickCoversMult} />}
          <AutoRefresh />
        </div>
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3 sm:gap-4">
        <Kpi label="Gerçek Satış" value={money.format(kpis.totalSales)} unit="₺" delta={data.deltas.totalSales} />
        <Kpi
          label="Kişi"
          value={coversReal ? tl.format(kpis.totalCovers) : estimatedCovers != null ? tl.format(estimatedCovers) : "—"}
          delta={coversReal ? data.deltas.totalCovers : undefined}
          estimated={coversEst}
        />
        <Kpi
          label="Kişi Başı"
          value={spendReal ? money.format(kpis.avgSpendPerCover) : spendEst ? money.format(estimatedSpendPerCover as number) : "—"}
          unit={spendReal || spendEst ? "₺" : undefined}
          delta={spendReal ? data.deltas.avgSpendPerCover : undefined}
          estimated={spendEst}
        />
        <Kpi label="Tekil Ziyaret" value={kpis.sessions ? tl.format(kpis.sessions) : "—"} delta={data.deltas.sessions} />
        <Kpi label="Menü Görüntüleme" value={tl.format(kpis.views)} delta={data.deltas.views} />
        <Kpi label="Medyan Süre" value={duration(kpis.avgSeconds)} delta={data.deltas.avgSeconds} />
        <Kpi label="Garson Çağrısı" value={tl.format(kpis.waiterCalls)} delta={data.deltas.waiterCalls} />
        <Kpi label="Sepet → Çağrı" value={kpis.cartConversion ? tl.format(kpis.cartConversion) : "—"} unit={kpis.cartConversion ? "%" : undefined} delta={data.deltas.cartConversion} />
      </div>

      {/* Deterministic verdict of the period — always on, derived from real numbers */}
      <Overview data={data} />

      {/* key remounts per range so stored findings seed cleanly and a same-range
          refresh (from a recheck) doesn't wipe the component's own state */}
      <AiInsights
        key={`${data.range.from}_${data.range.to}`}
        configured={data.insightsConfigured}
        initial={data.initialInsights}
        history={data.insightsHistory}
      />

      {/* Item funnel table — the strongest single view for menu decisions */}
      <ChartCard title="Ürün Dönüşümü (Görüntüleme → Sepet → Satış)">
        <ConversionTable rows={data.itemConversion} note={engagementNote} />
      </ChartCard>

      {/* Actionable menu-decision insights: hidden gems + momentum */}
      {(data.hiddenGems.length > 0 || data.momentum.rising.length > 0 || data.momentum.fading.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <HiddenGems items={data.hiddenGems} />
          <Momentum rising={data.momentum.rising} fading={data.momentum.fading} />
        </div>
      )}

      {/* Basket affinity + promo real-estate performance */}
      {(data.basket.orders > 0 || data.promo.hasData) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <BoughtTogether pairs={data.basket.pairs} orders={data.basket.orders} />
          <PromoPerformance promo={data.promo} />
        </div>
      )}

      {/* Headline comparison */}
      <ChartCard title="Gerçek Satış vs Menü Etkileşimi">
        <SalesVsEngagementChart data={data.comparison} />
      </ChartCard>

      {/* items-start so each card hugs its chart — a short chart (e.g. the sales
          area) no longer stretches to a taller neighbor and show phantom padding. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <ChartCard title="Satış (Zaman İçinde)">
          <RevenueAreaChart data={data.revenueOverTime} />
        </ChartCard>
        <ChartCard title="En Çok İncelenen Ürünler">
          <HBarChart data={data.topViewed} note={engagementNote} />
        </ChartCard>
        <ChartCard title="En Çok Satılan">
          <HBarChart
            data={data.bestSellers.map((b) => ({ name: b.item_name, count: b.qty }))}
            color="#243845"
            note="Henüz gerçek satış girilmedi. Sağ üstten “Gerçek Satış Gir”."
          />
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

      <LocalePrefs locales={data.localePrefs} />

      <ChartCard title="Haftalık Yoğunluk Haritası (Gün × Saat)">
        <WeekHeatmapChart data={data.weekHeatmap} note={engagementNote} />
      </ChartCard>
    </div>
  );
}
