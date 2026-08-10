"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ChartCard,
  SalesVsEngagementChart,
  HBarChart,
  FunnelBars,
  AbandonedViewsChart,
  ConversionBars,
  WeekHeatmapChart,
} from "./_charts";
import {
  generateInsightsAction,
  generatePatternsAction,
  setExcludedItemsAction,
  setAutoExcludeOffMenuAction,
  setOffMenuOverridesAction,
  setBusinessDayStartAction,
  type PatternItem,
} from "./actions";
import { ConversionTable } from "./_conversion-table";
import { Loader } from "@/components/Loader/components";
import { buildOverview, type OverviewTone } from "@/lib/analytics/overview";
import { BUSINESS_DAY_START_OPTIONS, businessDayLabel } from "@/lib/analytics/business-day";
import type { SalesCoverage, CompareBasis } from "@/lib/analytics/range";
import { COMPARE_BASES } from "@/lib/analytics/range";
import type { MenuEngineering, MenuQuadrant } from "@/lib/analytics/menu-matrix";
import { describeBasis, isThinPeriod, thinWeekdays, type DataBasis } from "@/lib/analytics/confidence";
import type { NamedCount, AbandonedView, LocalePref, EngagementWindow } from "@/lib/analytics/posthog";
import type { PriceBandSales } from "@/lib/analytics/price-bands";
import type { ItemConversion, HiddenGem, ItemMomentum, MomentumResult } from "@/lib/analytics/compare";
import type { PromoPerformance } from "@/lib/analytics/promo";
import type { ItemPair } from "@/lib/analytics/basket";

export type AnalyticsData = {
  preset: string;
  range: { from: string; to: string };
  /**
   * What every % badge on the page is measured against, and its window. The basis
   * is the owner's choice (`cmp` in the URL): the preceding period, four weeks
   * earlier, or the same weekdays last year. `hasData` is false when the baseline
   * window holds no POS entries at all, which is why the badges are blank.
   */
  compare: {
    basis: CompareBasis;
    label: string;
    range: { from: string; to: string };
    hasData: boolean;
  };
  /** How much of the range the POS log covers — drives the banner + muted badges. */
  salesCoverage: SalesCoverage;
  /**
   * Popularity × margin per item, from `menu_items.cost`. `hasData: false` until a
   * cost is entered anywhere, in which case the card shows a setup prompt and no
   * margin figure appears anywhere on the page.
   */
  menuEngineering: MenuEngineering;
  /**
   * The sample every claim on this page rests on. Printed under the AI card so a
   * reader sees the basis at the same moment as the claim, and used server-side to
   * reject findings whose sample can't support them.
   */
  dataBasis: DataBasis;
  /** False when either window is missing enough days to make a % change fiction. */
  salesDeltaReliable: boolean;
  /** Hour a business day starts (0 = calendar day). Stated on the page. */
  businessDayStart: number;
  /**
   * True while the range still reaches the current business day — i.e. its
   * numbers can still change. Computed on the server so the client never has to
   * derive "today" and risk a hydration mismatch across a date boundary.
   */
  live: boolean;
  posthogConfigured: boolean;
  insightsConfigured: boolean;
  /**
   * The sub-window of `range` that engagement metrics actually cover — shorter
   * than `range` when it reaches back past the tracking data floor.
   */
  engagement: EngagementWindow;
  kpis: {
    totalSales: number;
    totalCovers: number;
    avgSpendPerCover: number;
    /** `totalSales` restricted to `engagement` — the only figure safe to divide by a session-derived count. */
    salesInEngagementWindow: number;
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
  priceBands: PriceBandSales[];
  weekHeatmap: { day: number; hour: number; count: number }[];
  /** Converts views→sales well but under-exposed — promote candidates. */
  hiddenGems: HiddenGem[];
  /** Per-item view momentum vs the previous period, and whether it's comparable. */
  momentum: MomentumResult;
  /** Featured-banner / suggested-rail engagement + follow-through. */
  promo: PromoPerformance;
  /** Whether that promo real estate is set up at all — "0 clicks" needs it. */
  promoConfig: { featured: boolean; suggested: boolean };
  /** Bought-together item pairs from real orders. */
  basket: { pairs: ItemPair[]; orders: number };
  /** Behavior split by menu language (tr / en). */
  localePrefs: LocalePref[];
  /** Item names the owner chose to omit from item-level views + insights. */
  excludedItems: string[];
  /** "Also ignore anything no longer on the menu" rule — owner toggle. */
  autoExcludeOffMenu: boolean;
  /** Names that rule reads as off-menu this range, INCLUDING overridden ones. */
  offMenuItems: string[];
  /** Off-menu names the owner put back into the analysis by hand. */
  offMenuOverrides: string[];
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

// "8 Tem" / "8 Tem 2026" — for the engagement-window note. yyyy-mm-dd is parsed
// at UTC noon so no timezone can slide the rendered day.
const dayMonth = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const dayMonthYear = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
function trDate(iso: string, withYear = false): string {
  return (withYear ? dayMonthYear : dayMonth).format(new Date(`${iso}T12:00:00Z`));
}

// Guest-count estimate factor: people per unique visit (menu session). Used only
// when no real covers were entered for the period. Picker persists in localStorage.
//
// Quarter steps between 1 and 2, plus a 1,1 notch: in practice one phone gets
// scanned per TABLE, not per guest, so the realistic range is "one diner scanned
// for a party of two" — the old 2,5 / 3 options were multiplying an already
// table-level count. A previously saved 2,5 / 3 no longer matches the list and
// falls back to the default, which is the intended outcome — those values are
// off the scale now.
//
// Default is 1,1: a session count already lands close to the guest count, so the
// estimate only nudges it up ~10% instead of doubling it. The storage key is
// versioned so browsers holding the old 2 pick the new default up too — a saved
// 2 is still a valid option, so it would otherwise stick forever.
const COVERS_MULT_OPTIONS = [1, 1.1, 1.25, 1.5, 1.75, 2];
const COVERS_MULT_DEFAULT = 1.1;
const COVERS_MULT_KEY = "analytics-covers-multiplier-v2";

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
 *
 * Only offered on a LIVE range. A countdown ticking over a finished period
 * (5–20 July) is polling for a number that can no longer change, and the
 * re-render it triggers interrupts reading for nothing. `live` is false for every
 * range whose last day is in the past.
 */
function AutoRefresh({ live }: { live: boolean }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);
  const [left, setLeft] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [refreshing, startRefreshing] = useTransition();

  useEffect(() => {
    if (!live) {
      // Historical range: hold the stored preference, just don't run it.
      setSeconds(0);
      setLeft(0);
      return;
    }
    const saved = Number(localStorage.getItem(REFRESH_STORAGE_KEY));
    if (REFRESH_OPTIONS.some((o) => o.seconds === saved && saved > 0)) {
      setSeconds(saved);
      setLeft(saved);
    }
  }, [live]);

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

  if (!live) {
    return (
      <span
        className="text-[10px] tracking-[0.18em] font-extrabold text-green/40 uppercase"
        title="Bu dönem sona erdi — verisi değişmeyeceği için otomatik yenileme kapalı"
      >
        Oto Yenile · geçmiş dönem
      </span>
    );
  }

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
 * "Compared to" picker — what every % badge on the page is measured against.
 *
 * "The period before this one" was the only option, and it is the wrong default
 * for most restaurant questions: the 30 days before a 30-day window are a
 * different part of the season, and on short windows they aren't even the same
 * days of the week, so a Sat+Sun window compared against Tue+Wed reads as a
 * collapse that never happened. Both alternatives are weekday-aligned (28 and 364
 * days back), which is what makes them answer "is this normal for us?".
 *
 * Lives in the URL (`cmp`), not local state: the deltas are computed on the server
 * and the AI card must cite the same baseline the badges show.
 */
function ComparePicker({
  basis,
  hasData,
  onChange,
  disabled,
}: {
  basis: CompareBasis;
  hasData: boolean;
  onChange: (b: CompareBasis) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] tracking-[0.18em] font-extrabold text-green/60 uppercase"
        title="Yüzde değişimlerin karşılaştırıldığı dönem"
      >
        Karşılaştır
      </span>
      <div className="flex items-center">
        {COMPARE_BASES.map((b) => {
          const active = basis === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => onChange(b.key)}
              disabled={disabled}
              title={b.hint}
              className={[
                "px-2.5 py-1.5 font-ui font-extrabold text-[10px] tracking-[0.12em] uppercase border-2 -ml-0.5 first:ml-0 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-wait",
                active ? "bg-green text-white border-green" : "bg-white text-green border-green/40 hover:bg-bg-deep",
              ].join(" ")}
            >
              {b.short}
            </button>
          );
        })}
      </div>
      {/* An empty baseline is why the badges vanished — say so instead of leaving
          the owner to wonder whether the numbers broke. */}
      {!hasData && (
        <span className="text-[10px] font-extrabold text-orange" title="Karşılaştırma döneminde POS satış verisi yok">
          veri yok
        </span>
      )}
    </div>
  );
}

/**
 * "Business day starts at" picker. Sits next to the range controls because it
 * silently redefines what a "day" is for every figure below — a restaurant
 * serving past midnight needs to know whether a 01:30 order lands on Friday or
 * Saturday, and until this existed nothing on the page said.
 */
function BusinessDayPicker({ value }: { value: number }) {
  const router = useRouter();
  const [hour, setHour] = useState(value);
  const [saving, startSaving] = useTransition();

  const pick = (h: number) => {
    const prevHour = hour;
    setHour(h);
    startSaving(async () => {
      const res = await setBusinessDayStartAction(h);
      if (res.ok) router.refresh();
      else setHour(prevHour);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] tracking-[0.18em] font-extrabold text-green/60 uppercase"
        title="Gün hangi saatte başlasın — gece yarısını geçen siparişler bir önceki güne yazılır. Günlük, haftalık ve saat bazlı tüm dağılımları etkiler."
      >
        Gün Başlangıcı
      </span>
      <select
        value={hour}
        disabled={saving}
        onChange={(e) => pick(Number(e.target.value))}
        className="border-2 border-green/40 bg-white px-2 py-1.5 text-[11px] font-extrabold text-green tabular-nums cursor-pointer disabled:opacity-50"
      >
        {BUSINESS_DAY_START_OPTIONS.map((h) => (
          <option key={h} value={h}>
            {businessDayLabel(h)}
          </option>
        ))}
      </select>
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

/**
 * "2 dk 21 sn", never "2d 21s" — the short form is ambiguous in Turkish (dakika
 * vs. gün) and reads as "2 days" to an English speaker.
 */
function duration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} dk ${s} sn` : `${s} sn`;
}

function Kpi({
  label,
  value,
  unit,
  delta,
  deltaNote,
  muted,
  mutedReason,
  estimated,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: number | null;
  /** What the delta is measured against, printed under it — e.g. "19 Haz – 4 Tem". */
  deltaNote?: string;
  /** Grey the delta out: the underlying period is missing days, so it isn't real. */
  muted?: boolean;
  mutedReason?: string;
  /** Renders a "~" prefix + "tahmini" note (used for the sessions-based cover estimate). */
  estimated?: boolean;
}) {
  // The Bowlby display font is very wide, so long values (e.g. "1.234.567")
  // overrun the narrow cards. The "~"/₺ prefix eats width too, so fold it into
  // the effective length. Step the size down as the string grows.
  const eff = value.length + (unit ? 2 : 0) + (estimated ? 2 : 0);
  const size =
    eff > 11 ? "text-[18px]" : eff > 9 ? "text-[22px]" : eff > 6 ? "text-[28px]" : "text-[40px]";
  return (
    <div className="border-2 border-green bg-white p-4 sm:p-5 min-w-0 overflow-hidden shadow-hard text-center">
      {/* title so a label the card is too narrow to show ("Menü Görüntüleme")
          is still readable instead of ending in a dead ellipsis. */}
      <div className="text-[10px] tracking-[0.22em] font-bold text-green/70 uppercase truncate" title={label}>
        {label}
      </div>
      <div className="flex items-baseline justify-center gap-1 mt-1.5 whitespace-nowrap">
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
        delta != null && (
          <div
            className={`mt-1.5 text-[11px] font-extrabold ${
              muted
                ? "text-green/30"
                : delta > 0
                  ? "text-green"
                  : delta < 0
                    ? "text-orange"
                    : "text-green/50"
            }`}
            title={muted ? mutedReason : deltaNote ? `${deltaNote} dönemine göre` : "Önceki döneme göre"}
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {delta > 0 ? "+" : ""}
            {delta}%
            {/* Never leave a percentage without saying what it is a percentage OF. */}
            {deltaNote && (
              <span className="block mt-0.5 text-[9px] font-bold text-green/40 leading-tight normal-case">
                {muted ? "eksik veri" : `vs ${deltaNote}`}
              </span>
            )}
          </div>
        )
      )}
    </div>
  );
}

// Verdict → chip label + colors. Literal class strings (no runtime concatenation)
// so Tailwind's JIT scanner actually generates them.
// `edge` is a TOP accent (not a side-stripe): it reads as a header rule and the
// verdict tone is already carried by the chip, so it stays decorative-but-tied.
const TONE: Record<OverviewTone, { label: string; chip: string; edge: string }> = {
  good: { label: "İyi Gidiyor", chip: "bg-green text-white border-green", edge: "border-t-green" },
  mixed: { label: "Karışık", chip: "bg-orange/15 text-orange border-orange/40", edge: "border-t-orange" },
  weak: { label: "Dikkat", chip: "bg-orange text-white border-orange", edge: "border-t-orange" },
  neutral: { label: "Dengeli", chip: "bg-bg-deep text-green border-green/40", edge: "border-t-green/40" },
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
    <section className={`border-2 border-t-[6px] border-green bg-white p-5 shadow-hard ${tone.edge}`}>
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
  basis,
}: {
  configured: boolean;
  initial: string[] | null;
  history: InsightsHistoryEntry[];
  /** The sample these findings rest on — printed with them, not behind a tooltip. */
  basis: DataBasis;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [findings, setFindings] = useState<Finding[] | null>(() =>
    initial && initial.length ? initial.map((t) => ({ text: t, isNew: false })) : null
  );
  const [resolved, setResolved] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (mode: "load" | "recheck") => {
      setError(false);
      startTransition(async () => {
        const res = await generateInsightsAction({
          range: params.get("range") ?? undefined,
          from: params.get("from") ?? undefined,
          to: params.get("to") ?? undefined,
          // Same baseline the KPI badges show, so a finding can't cite one window
          // while the cards above it show another.
          cmp: params.get("cmp") ?? undefined,
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

  // The server already caps and ranks the set by money at stake (see
  // rankFindings), so everything it returns is shown — no "show more" toggle,
  // which is what used to reflow the whole column on click. Newest
  // (recheck-added) findings float to the top; the rest keep their ranking.
  const visible = findings ? [...findings].sort((a, b) => Number(b.isNew) - Number(a.isNew)) : [];

  return (
    <section className="border-2 border-green bg-white p-5 shadow-hard">
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
      {/* Height floor for the state that swaps in place (placeholder → "üretiliyor"
          → findings). Without it the card grew by ~200px the moment generation
          finished and shoved everything below it down mid-read. */}
      <div className="min-h-40">
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
          Seçili dönemin verilerinden en fazla <b>5 bulgu</b> çıkarır — para etkisi en büyük olandan başlayarak,
          her biri tahmini aylık ₺ karşılığıyla. Yukarıdaki Genel Bakış’ta yazan şeyleri tekrar etmez. Bulgular
          kalıcıdır; “Tekrar Kontrol Et” mevcut bulguları doğrular ve yenilerini ekler.
        </p>
      )}
      </div>

      {/* DATA BASIS — the sample behind the sentences above, printed at the same
          size as they are. A reader who can see "3/30 gün satış verisi" under a
          confident finding can judge it for themselves; one who can't has to take
          it on faith, and gets burned once before never trusting the card again.
          The same numbers gate what the model may claim (lib/analytics/confidence). */}
      {configured && (
        <div className="mt-3 border-t-2 border-green/15 pt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[10px] tracking-[0.16em] font-extrabold text-green/50 uppercase">Veri temeli</span>
          <span className="text-[11px] font-bold text-green/60 tabular-nums">{describeBasis(basis)}</span>
          {isThinPeriod(basis) && (
            <span
              className="px-1.5 py-0.5 bg-orange/12 text-orange font-ui font-extrabold text-[9px] tracking-[0.14em] uppercase"
              title="Bu dönemde satış verisi az — bulgular eğilim değil, ilk sinyal olarak okunmalı"
            >
              Sınırlı veri
            </span>
          )}
          {thinWeekdays(basis).length > 0 && thinWeekdays(basis).length < 7 && (
            <span
              className="text-[10px] font-bold text-green/40"
              title="Bu günler dönemde yeterince tekrar etmiyor — o günlere dair bulgular üretilmez"
            >
              {thinWeekdays(basis).join(", ")} için gün sayısı yetersiz
            </span>
          )}
        </div>
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

const PATTERN_KIND: Record<PatternItem["kind"], { label: string; chip: string }> = {
  "co-move": { label: "Birlikte Satış", chip: "bg-green text-white" },
  basket: { label: "Sepet İlişkisi", chip: "bg-orange text-white" },
  time: { label: "Zaman Kalıbı", chip: "bg-ink text-white" },
  segment: { label: "Segment", chip: "bg-green/70 text-white" },
  margin: { label: "Kâr Marjı", chip: "bg-orange/80 text-white" },
};

/** Compact "the numbers behind it" line, phrased per pattern kind. */
function patternEvidence(p: PatternItem): string {
  const m = p.metrics;
  switch (p.kind) {
    case "co-move":
      return `pay korelasyonu ${m.shareCorrelation} · ${m.days} gün`;
    case "basket":
      return `lift ${m.lift} · ${m.support} sipariş · %${m.confidencePct}`;
    case "time":
      return `${m.weekday} · normalin ${m.index}×`;
    case "margin":
      // Margin patterns come in two shapes (period shift, weekday gap); show the
      // point movement when it's there, else fall back to the leading figures.
      return m.shiftPoints != null
        ? `%${m.earlyMarginPct} → %${m.lateMarginPct} · ${m.days} gün`
        : Object.values(m).slice(0, 2).join(" · ");
    case "segment": {
      // Prefer the rate/percentage metrics (keys ending in "Pct") so locale/price/
      // discount patterns read as comparable rates, not raw counts.
      const rates = Object.entries(m).filter(([k]) => /pct$/i.test(k));
      if (rates.length) return rates.map(([, v]) => `%${v}`).join(" · ");
      return Object.values(m).slice(0, 2).join(" · ");
    }
  }
}

/**
 * "Kalıplar" — computed, validated patterns across every numeric signal.
 *
 * Unlike the AI Yorumu card (which asks the model to read a data blob), these are
 * mined deterministically in patterns.ts — real correlation, market-basket lift,
 * weekday over-indexing, segment skews — with the "busy-day" confound controlled
 * for. The LLM only acts as a taste gate: it rejects the obvious ones and phrases
 * the survivors. Auto-runs a cached "load" on mount; "Yeniden Tara" re-mines and
 * widens the search. Remounted per range by the parent (key), like AiInsights.
 */
function PatternsCard({ aiConfigured }: { aiConfigured: boolean }) {
  const params = useSearchParams();
  const [patterns, setPatterns] = useState<PatternItem[] | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (mode: "load" | "rescan") => {
      setError(false);
      startTransition(async () => {
        const res = await generatePatternsAction({
          range: params.get("range") ?? undefined,
          from: params.get("from") ?? undefined,
          to: params.get("to") ?? undefined,
          mode,
        });
        if (res.ok) setPatterns(res.patterns);
        else setError(true);
      });
    },
    [params]
  );

  const didAuto = useRef(false);
  useEffect(() => {
    if (patterns !== null || didAuto.current) return;
    didAuto.current = true;
    run("load");
  }, [patterns, run]);

  const has = patterns !== null && patterns.length > 0;
  const buttonLabel = pending ? "Taranıyor…" : patterns !== null ? "Yeniden Tara" : "Kalıpları Bul";

  return (
    <section className="border-2 border-ink bg-white p-5 shadow-hard">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="text-[11px] tracking-[0.2em] font-extrabold text-ink/70 uppercase">Kalıplar</h3>
        <button
          type="button"
          onClick={() => run(has ? "rescan" : "load")}
          disabled={pending}
          className={[
            "px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase border-2 cursor-pointer transition-colors",
            pending ? "bg-bg-deep text-ink/40 border-ink/30 cursor-wait" : "bg-ink text-white border-ink hover:bg-ink/90",
          ].join(" ")}
        >
          {buttonLabel}
        </button>
      </div>

      {error ? (
        <p className="text-[12px] text-orange font-bold py-3">Kalıplar oluşturulamadı — tekrar deneyin.</p>
      ) : has ? (
        <>
          <ul className="flex flex-col gap-3 pt-2">
            {patterns!.map((p) => (
              <li key={p.id} className="flex gap-2 text-[13px] leading-relaxed text-ink">
                <span className="text-ink/40 font-extrabold shrink-0">◆</span>
                <div className="flex flex-col gap-1">
                  <span>{p.text}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`px-1.5 py-0.5 font-ui font-extrabold text-[9px] tracking-[0.14em] uppercase ${PATTERN_KIND[p.kind].chip}`}>
                      {PATTERN_KIND[p.kind].label}
                    </span>
                    {/* SAMPLE, next to the claim. "Çarşamba 5,3×" means nothing
                        until you know whether it's four Wednesdays or two — and the
                        thin ones never get here at all (patterns.ts drops them),
                        so this chip separates "solid" from "early signal". */}
                    {p.confidence && p.sampleLabel && (
                      <span
                        className={[
                          "px-1.5 py-0.5 font-ui font-extrabold text-[9px] tracking-[0.14em] uppercase border",
                          p.confidence === "high"
                            ? "border-green/40 bg-green/10 text-green"
                            : "border-orange/40 bg-orange/8 text-orange",
                        ].join(" ")}
                        title={
                          p.confidence === "high"
                            ? `Sağlam örneklem: ${p.sampleLabel}`
                            : `Sınırlı örneklem (${p.sampleLabel}) — erken sinyal olarak okuyun, geri dönüşü zor kararlar için bekleyin`
                        }
                      >
                        {p.sampleLabel}
                        {p.confidence === "medium" && " · erken"}
                      </span>
                    )}
                    <span className="text-[11px] text-ink/45 font-mono">{patternEvidence(p)}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {!aiConfigured && (
            <p className="mt-3 text-[11px] text-ink/40 leading-relaxed">
              Yapay zekâ eleyicisi kapalı (GROQ_API_KEY yok) — kalıplar yalnızca istatistiksel eşiklerle
              süzülüyor. Açıldığında bariz olanlar da elenir.
            </p>
          )}
        </>
      ) : pending ? (
        <p className="text-[12px] text-ink/50 py-3">Veriler taranıyor, kalıplar aranıyor…</p>
      ) : (
        <p className="text-[12px] text-ink/50 py-3">
          Tüm satış/etkileşim verisini tarayıp sayılarla görünen gerçek kalıpları bulur: birlikte hareket eden
          ürünler (yoğun gün etkisi arındırılmış), beklentinin üstünde birlikte alınan çiftler, güne özel satışlar
          ve segment farkları. Bariz olanlar ({aiConfigured ? "yapay zekâ + " : ""}istatistik eşikleriyle) elenir.
          Her kalıp, dayandığı veri miktarıyla birlikte gösterilir; örneklemi yetersiz olanlar hiç gösterilmez.
        </p>
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
 * Above the list sits the AUTO rule: one switch that ignores every product no
 * longer on the menu, so delisted dishes stop occupying the charts without the
 * owner re-ticking them by hand after each menu change. Auto-hidden rows stay
 * visible in the list with a "menü dışı" tag, and stay UNTICKABLE — the name match
 * is fuzzy, so the owner has to be able to say "no, we still sell that" for the one
 * it got wrong. Those exceptions are wiped whenever the switch is flipped, so off
 * and on re-applies the rule from scratch.
 *
 * All three settings persist server-side (settings table); each change saves and
 * refreshes the dashboard so the charts and insights update immediately.
 *
 * `options` is the FULL set of products seen in the range (not just the ones the
 * charts show), because Kalıplar mines the whole tail and can name any of them —
 * so the list is long by design and gets a search box. Ticked items sort to the
 * top so an existing selection never gets lost in the tail.
 */
function IgnoreItemsMenu({
  options,
  excluded,
  autoOn,
  offMenu,
  overrides,
}: {
  options: string[];
  excluded: string[];
  autoOn: boolean;
  offMenu: string[];
  overrides: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(excluded);
  const [auto, setAuto] = useState(autoOn);
  const [included, setIncluded] = useState<string[]>(overrides);
  const [query, setQuery] = useState("");
  const [saving, startSaving] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const nameKey = (s: string) => s.trim().toLocaleLowerCase("tr");
  const selectedKeys = new Set(selected.map(nameKey));
  const isOn = (name: string) => selectedKeys.has(nameKey(name));

  // Server-computed for the CURRENT rule state, so an optimistic switch flip has
  // no names to show yet — the refreshed props fill them in a moment later.
  const offMenuKeys = new Set(offMenu.map(nameKey));
  const includedKeys = new Set(included.map(nameKey));
  /** Matched as off-menu — whether or not it's currently being dropped. */
  const isOffMenu = (name: string) => auto && offMenuKeys.has(nameKey(name));
  /** Off-menu but kept in the analysis by an explicit override. */
  const isKept = (name: string) => isOffMenu(name) && includedKeys.has(nameKey(name));
  /** Actually dropped by the rule right now. */
  const isAuto = (name: string) => isOffMenu(name) && !includedKeys.has(nameKey(name));

  const needle = query.trim().toLocaleLowerCase("tr");
  const shown = options
    .filter((n) => !needle || n.toLocaleLowerCase("tr").includes(needle))
    // Ignored first (ticked or auto-hidden), then the incoming alphabetical order
    // (sort is stable). Overridden items rank with them so the exception stays
    // next to the rule that caught it.
    .sort((a, b) => Number(isOn(b) || isOffMenu(b)) - Number(isOn(a) || isOffMenu(a)));

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

  const saveOverrides = (next: string[]) => {
    setIncluded(next); // optimistic — checkbox reacts instantly
    startSaving(async () => {
      const res = await setOffMenuOverridesAction(next);
      if (res.ok) router.refresh();
    });
  };

  const saveAuto = (next: boolean) => {
    // Flipping the switch drops the exceptions server-side; mirror that here so the
    // list doesn't show stale "dahil" markers until the refresh lands.
    setAuto(next);
    setIncluded([]);
    startSaving(async () => {
      const res = await setAutoExcludeOffMenuAction(next);
      if (res.ok) router.refresh();
      else {
        setAuto(!next); // save failed — don't leave the switch lying
        setIncluded(overrides);
      }
    });
  };

  const toggle = (name: string) => {
    // Off-menu rows toggle the RULE's exception, not the manual ignore list:
    // unticking one means "we still sell this, keep analysing it".
    if (isOffMenu(name)) {
      saveOverrides(
        isKept(name) ? included.filter((s) => nameKey(s) !== nameKey(name)) : [...included, name]
      );
      return;
    }
    save(isOn(name) ? selected.filter((s) => nameKey(s) !== nameKey(name)) : [...selected, name]);
  };

  const autoHidden = auto ? offMenu.filter((n) => !includedKeys.has(nameKey(n))).length : 0;
  // Everything currently left out, so the badge matches what the charts dropped.
  const count = selected.length + autoHidden;

  return (
    <div className="flex flex-col items-start gap-1">
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
            {selected.length > 0 && (
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

          {/* AUTO rule — one switch instead of re-ticking every delisted product */}
          <label className="mt-2 flex items-start gap-2 px-3 py-2 bg-bg-deep border-y-2 border-green/15 cursor-pointer">
            <input
              type="checkbox"
              checked={auto}
              disabled={saving}
              onChange={(e) => saveAuto(e.target.checked)}
              className="mt-0.5 size-3.5 accent-orange shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-extrabold text-ink leading-tight">
                Menüde olmayan ürünleri otomatik yoksay
              </span>
              <span className="block mt-0.5 text-[10px] leading-relaxed text-green/50 font-bold">
                {auto
                  ? autoHidden > 0
                    ? `Menüde bulunmayan ${autoHidden} ürün bu dönemde gizlendi. Hâlâ satılan bir ürün varsa işaretini kaldırıp geri alabilirsin.`
                    : included.length > 0
                      ? `Menü dışı ürünlerin hepsi elle geri alındı (${included.length}).`
                      : "Bu dönemde menü dışı ürün bulunamadı."
                  : "Menüden kaldırılan ürünler listelerde kalmaya devam eder."}
              </span>
            </span>
          </label>

          {options.length > 0 && (
            <div className="px-3 pt-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ürün ara…"
                className="w-full px-2 py-1.5 border-2 border-green/30 bg-white text-[12px] text-ink placeholder:text-green/40 focus:outline-none focus:border-green"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1.5">
            {options.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-green/50">Henüz ürün verisi yok.</p>
            ) : shown.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-green/50">Eşleşen ürün yok.</p>
            ) : (
              shown.map((name) => {
                // Rows the rule caught stay tickable: unticking one overrides the
                // rule for that product ("we still sell this"), reticking hands it
                // back to the rule.
                const byRule = isAuto(name);
                const kept = isKept(name);
                return (
                  <label
                    key={name}
                    className={[
                      "flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-bg-deep cursor-pointer",
                      kept ? "text-ink/70" : "text-ink",
                    ].join(" ")}
                    title={
                      byRule
                        ? `${name} — menüde bulunamadı, yoksayıldı. Hâlâ satılıyorsa işareti kaldır.`
                        : kept
                          ? `${name} — menüde bulunamadı ama analize dahil edildi`
                          : name
                    }
                  >
                    <input
                      type="checkbox"
                      checked={byRule || isOn(name)}
                      disabled={saving}
                      onChange={() => toggle(name)}
                      className="size-3.5 accent-green shrink-0"
                    />
                    <span className="truncate">{name}</span>
                    {(byRule || kept) && (
                      <span
                        className={[
                          "ml-auto shrink-0 px-1 py-0.5 font-ui font-extrabold text-[8px] tracking-[0.1em] uppercase",
                          kept ? "bg-green/10 text-green/70" : "bg-orange/10 text-orange",
                        ].join(" ")}
                      >
                        {kept ? "menü dışı · dahil" : "menü dışı"}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
      </div>
      <p className="max-w-68 text-[9px] leading-snug text-green/50 font-bold">
        Seçilen{auto ? " ve menüde olmayan" : ""} ürünleri grafiklerden ve tüm yapay zekâ analizlerinden
        (Yorum + Kalıplar) çıkarır; satış ve tutar toplamları etkilenmez.
      </p>
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

/**
 * Menu engineering matrix — popularity × margin, the framework restaurant owners
 * already think in. Four quadrants, each with the one action it implies.
 *
 * This is the payoff of a single database column. Every other card on this page
 * measures attention and revenue; only this one answers "does it make money", which
 * is the question the buyer actually asks. Each quadrant carries its instruction in
 * the header rather than in a legend below, because the instruction IS the product:
 * an owner who sees "çok satıyor, kâr bırakmıyor" next to three item names knows
 * what to do this afternoon.
 */
/** Matrix reading order: protect, fix, promote, cut. */
const QUADRANTS_ORDER: MenuQuadrant[] = ["star", "plowhorse", "puzzle", "dog"];

const QUADRANT_META: Record<
  MenuQuadrant,
  { mark: string; title: string; action: string; border: string; chip: string }
> = {
  star: {
    mark: "★",
    title: "Yıldızlar",
    action: "Koru — indirime sokma, porsiyonu küçültme",
    border: "border-green",
    chip: "bg-green text-white",
  },
  plowhorse: {
    mark: "◆",
    title: "Yük Atları",
    action: "Çok satıyor, kâr bırakmıyor — fiyatı ayarla ya da maliyeti düşür",
    border: "border-orange",
    chip: "bg-orange text-white",
  },
  puzzle: {
    mark: "?",
    title: "Bilmeceler",
    action: "Kârlı ama az satıyor — menüde öne çıkar, personele hatırlat",
    border: "border-green/50",
    chip: "bg-green/70 text-white",
  },
  dog: {
    mark: "×",
    title: "Yorgunlar",
    action: "Az satıyor, az kâr — menüden çıkarmayı değerlendir",
    border: "border-ink/40",
    chip: "bg-ink/70 text-white",
  },
};

function MenuMatrix({ me }: { me: MenuEngineering }) {
  // No cost anywhere yet: say what the field unlocks and where to enter it, rather
  // than rendering an empty grid that looks broken.
  if (!me.hasData) {
    return (
      <ChartCard title="Menü Kârlılık Matrisi (Popülerlik × Kâr Marjı)">
        <div className="py-2">
          <p className="text-[13px] text-ink leading-relaxed">
            Ürün <b>maliyetleri</b> girildiğinde bu bölüm her ürünü popülerlik ve kâr marjına göre dört gruba
            ayırır: <b>koru</b>, <b>fiyatı ayarla</b>, <b>öne çıkar</b>, <b>menüden çıkar</b>. Ciro değil{" "}
            <b>kâr</b> üzerinden okunur.
          </p>
          <p className="mt-2 text-[12px] text-green/60 font-bold leading-relaxed">
            {me.coverage.soldItems > 0
              ? `Bu dönemde ${tl.format(me.coverage.soldItems)} ürün satıldı, hiçbirinin maliyeti girilmemiş.`
              : "Bu dönem için ürün bazında gerçek satış verisi yok."}{" "}
            <a href="/admin/menu" className="text-orange underline font-extrabold">
              Menüden maliyet gir →
            </a>
          </p>
        </div>
      </ChartCard>
    );
  }

  const cell = (q: MenuQuadrant) => {
    const meta = QUADRANT_META[q];
    const items = me.items.filter((i) => i.quadrant === q);
    const profit = items.reduce((s, i) => s + i.profit, 0);
    return (
      <div key={q} className={`border-2 ${meta.border} p-3 min-w-0`}>
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              className={`px-1.5 py-0.5 font-ui font-extrabold text-[10px] leading-none ${meta.chip}`}
              aria-hidden
            >
              {meta.mark}
            </span>
            <span className="text-[11px] tracking-[0.14em] font-extrabold text-ink uppercase truncate">
              {meta.title}
            </span>
            <span className="text-[11px] font-bold text-green/40 tabular-nums shrink-0">({items.length})</span>
          </span>
          <span className="text-[11px] font-extrabold text-green/60 tabular-nums shrink-0">
            {money.format(Math.round(profit))} ₺
          </span>
        </div>
        <p className="text-[10px] leading-snug text-green/55 font-bold mb-2">{meta.action}</p>
        {items.length === 0 ? (
          <p className="text-[11px] text-green/35">—</p>
        ) : (
          <ul className="flex flex-col divide-y divide-green/10">
            {items.slice(0, 6).map((i) => (
              <li key={i.name} className="flex items-center justify-between gap-2 py-1">
                <span className="text-[12px] font-bold text-ink truncate min-w-0" title={i.name}>
                  {i.losingMoney && (
                    <span className="text-orange mr-1" title="Maliyetinin altında satılıyor">
                      ⚠
                    </span>
                  )}
                  {i.name}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums">
                  <span className="text-green/45">{tl.format(i.qty)} ad.</span>
                  <span className={`ml-2 font-extrabold ${i.unitMargin < 0 ? "text-orange" : "text-green"}`}>
                    {money.format(Math.round(i.unitMargin))} ₺
                  </span>
                </span>
              </li>
            ))}
            {items.length > 6 && (
              <li className="pt-1 text-[10px] font-bold text-green/40">
                +{tl.format(items.length - 6)} ürün daha
              </li>
            )}
          </ul>
        )}
      </div>
    );
  };

  return (
    <ChartCard title="Menü Kârlılık Matrisi (Popülerlik × Kâr Marjı)">
      {/* Profit headline first: the whole point is restating the period in profit
          rather than revenue, so the ₺ kâr figure leads. */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mb-3 pb-3 border-b-2 border-green/15">
        <div>
          <div className="text-[10px] tracking-[0.18em] font-extrabold text-green/60 uppercase">Brüt Kâr</div>
          <div className="flex items-baseline gap-1">
            <span className="font-ui font-extrabold text-[15px] text-green/70">₺</span>
            <span className="font-bowlby text-[26px] leading-none text-green">
              {money.format(Math.round(me.totals.profit))}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-[0.18em] font-extrabold text-green/60 uppercase">Kâr Marjı</div>
          <div className="flex items-baseline gap-1">
            <span className="font-bowlby text-[26px] leading-none text-green">{me.totals.marginPct}</span>
            <span className="font-ui font-extrabold text-[15px] text-green/70">%</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-[0.18em] font-extrabold text-green/60 uppercase">Ortalama Birim Kâr</div>
          <div className="flex items-baseline gap-1">
            <span className="font-ui font-extrabold text-[15px] text-green/70">₺</span>
            <span className="font-bowlby text-[26px] leading-none text-green">
              {money.format(Math.round(me.avgUnitMargin))}
            </span>
          </div>
        </div>
        {/* Coverage, always stated: a matrix over a fifth of the revenue is a
            sample, and presenting it as the menu would be the dishonest version
            of this feature. */}
        <div className="min-w-0">
          <div className="text-[10px] tracking-[0.18em] font-extrabold text-green/60 uppercase">Kapsam</div>
          <div
            className={`text-[12px] font-extrabold tabular-nums ${me.coverage.reliable ? "text-green/70" : "text-orange"}`}
            title="Maliyeti girili ürünlerin, dönemin gerçek cirosundaki payı"
          >
            {tl.format(me.coverage.costedItems)}/{tl.format(me.coverage.soldItems)} ürün · cironun %
            {Math.round(me.coverage.revenueRatio * 100)}’i
          </div>
        </div>
      </div>

      {!me.coverage.reliable && (
        <p className="mb-3 text-[11px] font-bold text-orange leading-relaxed">
          Maliyeti girilmemiş ürünler bu matriste yok — rakamlar tüm menüyü değil, yalnızca yukarıdaki kapsamı
          anlatır.{" "}
          <a href="/admin/menu" className="underline font-extrabold">
            Eksik maliyetleri gir →
          </a>
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{QUADRANTS_ORDER.map(cell)}</div>

      <p className="mt-3 text-[10px] text-green/50 font-bold leading-relaxed">
        “Popüler” = satış adedinin menü ortalamasının %70’i ve üzeri · “Yüksek marj” = birim kârı menü
        ortalamasının üzerinde · birim kâr, ürünün gerçek satış tutarından (indirimler dâhil) maliyeti
        çıkarılarak bulunur · ⚠ = maliyetinin altında satılıyor.
      </p>
    </ChartCard>
  );
}

/** The period's biggest profit contributors — revenue rank is not profit rank. */
function TopProfit({ me }: { me: MenuEngineering }) {
  if (!me.hasData || me.items.length < 3) return null;
  const top = me.items.slice(0, 8);
  return (
    <ChartCard title="En Kârlı Ürünler">
      <StatList>
        {top.map((i) => (
          <StatRow key={i.name} name={i.name}>
            <span className="flex items-center gap-3 shrink-0 text-[12px] tabular-nums">
              <span className="text-green/45">{tl.format(i.qty)} adet</span>
              <span className="text-green/45">%{i.marginPct} marj</span>
              <span className="font-bowlby text-green text-[15px] leading-none">
                {money.format(Math.round(i.profit))}
              </span>
            </span>
          </StatRow>
        ))}
      </StatList>
      <p className="mt-2 text-[10px] text-green/50 font-bold">
        Ciro sıralaması değil <b>kâr</b> sıralaması — en çok satan ürün genellikle en çok kazandıran ürün
        değildir.
      </p>
    </ChartCard>
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

/**
 * Rising and fading items by view momentum vs the comparison period.
 *
 * Refuses to render a comparison it can't make. When the baseline window has no
 * engagement data (a custom range whose predecessor predates tracking, most
 * often), every item's "previous" is 0 — so every single product came out as
 * "0→X YENİ" and nothing could ever fade. Six fake rising stars is worse than an
 * empty module, so the module says why instead.
 */
function Momentum({ momentum }: { momentum: MomentumResult }) {
  const { rising, fading, comparable, previous } = momentum;

  if (!comparable) {
    return (
      <ChartCard title="Yükselenler / Düşenler (görüntülenme ivmesi)">
        <div className="min-h-24 grid place-items-center px-4 text-center">
          <p className="text-[12px] text-green/60 leading-relaxed">
            Karşılaştırma dönemi ({trDate(previous.from)} – {trDate(previous.to)}) için etkileşim verisi yok,
            bu yüzden ivme hesaplanamıyor — her ürün “yeni” görünürdü. Etkileşim takibinin başladığı tarihten
            sonrasını kapsayan bir dönem seçin.
          </p>
        </div>
      </ChartCard>
    );
  }

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
        {trDate(previous.from)} – {trDate(previous.to)} dönemine göre görüntülenme değişimi. “Yeni” = geçen
        dönem yokken bu dönem öne çıkan.
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

/**
 * Is the featured banner / suggested rail earning its prime menu real estate?
 *
 * "0 tıklama · %0 sepete ekledi" describes two opposite situations — a banner
 * nobody clicks, and a banner that was never set up — and used to render both
 * identically. `configured` separates them: an unconfigured slot gets a
 * set-it-up prompt instead of a zero that looks like failure.
 */
function PromoPerformance({
  promo,
  config,
}: {
  promo: PromoPerformance;
  config: { featured: boolean; suggested: boolean };
}) {
  // Nothing configured and nothing recorded — there is genuinely nothing to say.
  if (!promo.hasData && !config.featured && !config.suggested) return null;

  const Block = ({
    label,
    s,
    configured,
    setupHref,
    setupLabel,
  }: {
    label: string;
    s: { clicks: number; sessions: number; convPct: number };
    configured: boolean;
    setupHref: string;
    setupLabel: string;
  }) => (
    <div className="border-2 border-green/30 p-3">
      <div className="text-[10px] tracking-[0.16em] font-extrabold text-green/60 uppercase truncate">{label}</div>
      {!configured ? (
        <>
          <div className="mt-1 text-[13px] font-extrabold text-green/50">Kurulmadı</div>
          <a
            href={setupHref}
            className="mt-1.5 inline-block text-[11px] font-extrabold text-orange hover:text-orange/70 underline"
          >
            {setupLabel}
          </a>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="font-bowlby text-[26px] text-green leading-none">{tl.format(s.clicks)}</span>
            <span className="text-[11px] font-bold text-green/50">tıklama</span>
          </div>
          <div className="mt-1.5 text-[11px] font-bold text-green/60">
            {s.clicks === 0 ? (
              // Configured but untouched — say so in those words, and give the
              // denominator, which is the number that makes it actionable.
              <>Kurulu ama bu dönemde hiç tıklanmadı.</>
            ) : (
              <>
                {tl.format(s.sessions)} oturum · <span className="text-orange">{s.convPct}%</span> sepete ekledi
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
  return (
    <ChartCard title="Öne Çıkan / Öneri Performansı">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Block
          label="Öne Çıkan (Başlık)"
          s={promo.featured}
          configured={config.featured}
          setupHref="/admin/settings"
          setupLabel="Öne çıkan ürün seç →"
        />
        <Block
          label="Öneri Rayı"
          s={promo.suggested}
          configured={config.suggested}
          setupHref="/admin/suggested"
          setupLabel="Öneri grubu oluştur →"
        />
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
      {/* Ratio explainer up top: raw counts across locales aren't comparable
          because almost no one switches language — so we show penetration rate. */}
      <p className="mb-3 text-[10px] text-green/60 font-bold leading-relaxed">
        Yüzdeler <span className="text-green">penetrasyon oranı</span>: o dilin oturumlarının yüzde kaçı ürüne
        baktı. Diller arasında karşılaştırılabilir olması için ham görüntülenme değil oran kullanılır
        (İngilizce trafik çok daha az). Parantez içi ham görüntülenme.
      </p>
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
                    <span className="shrink-0 tabular-nums">
                      <span className="font-extrabold text-green">%{Math.round(it.rate * 100)}</span>
                      <span className="text-green/40 ml-1.5">({tl.format(it.count)})</span>
                    </span>
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
        Her dil için en çok görüntülenen ürünler (kendi oturum oranına göre) ve oturum/süre — dile göre öne
        çıkarmayı şekillendirir.
      </p>
    </ChartCard>
  );
}

/**
 * Section divider. Groups the ~24 flat cards into a handful of indexed, ruled
 * zones so the page reads as a structured report, not an endless stack. Pure
 * layout — it wraps existing content and touches no data.
 */
function Zone({
  index,
  title,
  desc,
  children,
}: {
  index: string;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-5">
        <span className="font-bowlby text-[13px] leading-none text-white bg-green px-2 py-1.5 tabular-nums shrink-0">
          {index}
        </span>
        <h2 className="font-bowlby text-[17px] leading-none text-green uppercase tracking-[-0.3px] shrink-0">{title}</h2>
        {desc && (
          <span className="hidden sm:block text-[10px] tracking-[0.18em] font-bold text-green/45 uppercase truncate">
            {desc}
          </span>
        )}
        <span aria-hidden className="h-0.5 flex-1 min-w-4 bg-green/15" />
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

/**
 * Responsive card grid. Cards sit two-up on wide screens and collapse to one on
 * narrow. Two properties make it robust where the old layouts failed:
 *   • the last / only card GROWS to fill its row, so a null sibling never leaves
 *     an orphaned empty cell (the "one full, one empty" bug), and
 *   • cards size to their CONTENT rather than to their tallest neighbour.
 * Children stay in one flat flex container (never re-parented between columns),
 * so cards with mount effects — AiInsights, PatternsCard — never remount.
 *
 * `items-start` replaced `items-stretch`: matching a 3-row price-band card to a
 * 10-row table beside it padded roughly half the page with empty white. A short
 * card is now short, and the row's own height is the taller card's — no
 * staircase, no filler.
 *
 * This replaces a CSS multi-column masonry that couldn't balance columns when a
 * tall unbreakable card was present, stranding a large empty gap below the short
 * column.
 */
function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-6 items-start *:grow *:basis-[calc(50%-0.75rem)] *:min-w-[min(20rem,100%)]">
      {children}
    </div>
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
      // Preserve the comparison basis: switching to a custom window shouldn't
      // silently reset "geçen yıl" back to "önceki dönem".
      const cmp = params.get("cmp");
      const q = new URLSearchParams({ range: "custom", from, to });
      if (cmp) q.set("cmp", cmp);
      startSwitching(() => {
        router.push(`/admin/analytics?${q.toString()}`);
        router.refresh();
      });
    },
    [params, router]
  );

  /** Change what the % badges compare against; the server recomputes every delta. */
  const setCompare = useCallback(
    (basis: CompareBasis) => {
      const q = new URLSearchParams(params.toString());
      if (basis === "prev") q.delete("cmp");
      else q.set("cmp", basis);
      startSwitching(() => {
        router.push(`/admin/analytics?${q.toString()}`);
        router.refresh();
      });
    },
    [params, router]
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
  // Sales from the SAME days the sessions came from — see page.tsx. Dividing the
  // full-period total by a floor-clipped session count overstated this.
  const estimatedSpendPerCover =
    estimatedCovers && kpis.salesInEngagementWindow > 0
      ? kpis.salesInEngagementWindow / estimatedCovers
      : null;
  const spendReal = coversReal && kpis.avgSpendPerCover > 0;
  const spendEst = coversEst && (estimatedSpendPerCover ?? 0) > 0;

  // Distinguish "not configured" from "configured but no events yet".
  const engagementNote = data.posthogConfigured
    ? "Bu dönemde menü etkileşimi kaydedilmedi."
    : "Etkileşim verisi yok (PostHog gerekli).";

  // What every % badge is measured against, printed under each one.
  const compareNote = `${trDate(data.compare.range.from)} – ${trDate(data.compare.range.to)}`;
  const coverageReason = `Seçili dönemin ${data.salesCoverage.days - data.salesCoverage.daysWithData} gününde POS verisi yok — bu yüzdeler eksik veri üzerinden hesaplanıyor.`;


  // Scope key for the AI cards: range + every ignore rule (the auto rule folds in
  // the names it caught and the ones overridden back in, so a menu edit or a new
  // exception counts as a change). Any of these remounts the cards so they
  // regenerate over the same filtered data the charts already show.
  const aiScopeKey = `${data.range.from}_${data.range.to}__${[...data.excludedItems]
    .sort()
    .join("|")}__${
    data.autoExcludeOffMenu
      ? `${[...data.offMenuItems].sort().join("|")}__keep:${[...data.offMenuOverrides].sort().join("|")}`
      : "off"
  }`;

  return (
    <div className="relative" aria-busy={switching}>
      {/* Range-switch feedback: dim the dashboard and pin a loader while the
          server re-fetches. sticky keeps it visible however far down you are. */}
      {switching && (
        <div className="absolute inset-0 z-20 bg-bg/70">
          <div className="sticky top-0 h-screen grid place-items-center">
            <Loader size="md" label="Yükleniyor" />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-12">
        {/* CONTROL DECK — one pinned panel: date range (primary scope control) over
            a hairline, then the utilities. Keeps every control reachable however
            far you scroll, instead of two loose bars. */}
        <div className="sticky top-0 z-10 -mx-1 px-1 pt-1 pb-2 bg-bg/90 backdrop-blur-sm">
          <div className="border-2 border-green bg-white shadow-hard">
            {/* Row 1 — date range */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3">
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

            <div aria-hidden className="h-0.5 bg-green/12" />

            {/* Row 2 — utilities: ignore items / covers estimate / auto-refresh */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3">
              <IgnoreItemsMenu
                options={data.itemOptions}
                excluded={data.excludedItems}
                autoOn={data.autoExcludeOffMenu}
                offMenu={data.offMenuItems}
                overrides={data.offMenuOverrides}
              />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <ComparePicker
                  basis={data.compare.basis}
                  hasData={data.compare.hasData}
                  onChange={setCompare}
                  disabled={switching}
                />
                {/* Only shown when Kişi is running on the estimate (no real covers entered) */}
                {coversEst && <CoversMultiplier value={coversMult} onChange={pickCoversMult} />}
                <BusinessDayPicker value={data.businessDayStart} />
                <AutoRefresh live={data.live} />
              </div>
            </div>
          </div>
        </div>

        {/* MISSING-DATA BANNER — first thing on the page, because it invalidates
            everything under it. A range that silently spans days with no POS
            import under-reports every total and turns each % badge into a
            comparison between two different numbers of days. */}
        {data.salesCoverage.missing.length > 0 && (
          <div className="border-2 border-orange bg-orange/8 px-4 py-3">
            <p className="text-[12px] font-extrabold text-ink leading-relaxed">
              Seçili {tl.format(data.salesCoverage.days)} günün{" "}
              <span className="text-orange">
                {tl.format(data.salesCoverage.days - data.salesCoverage.daysWithData)} gününde
              </span>{" "}
              POS satış verisi yok. Toplamlar eksik, dönem karşılaştırmaları güvenilir değil.
            </p>
            <p className="mt-1 text-[11px] font-bold text-green/70 leading-relaxed">
              Eksik günler:{" "}
              {data.salesCoverage.missing.slice(0, 12).map((d) => trDate(d)).join(", ")}
              {data.salesCoverage.missing.length > 12 &&
                ` … (+${tl.format(data.salesCoverage.missing.length - 12)} gün daha)`}
              .{" "}
              <a href="/admin/analytics/sales" className="text-orange underline font-extrabold">
                Eksik günleri girin →
              </a>
            </p>
          </div>
        )}

        {/* 01 — the pulse: headline metrics for the period */}
        <Zone index="01" title="Nabız" desc="dönem metrikleri">
          {!data.posthogConfigured && (
            <div className="bg-bg-deep border-2 border-green/30 text-green text-[11px] font-bold uppercase tracking-[0.1em] px-4 py-3">
              Menü etkileşim takibi henüz bağlı değil — etkileşim grafikleri şimdilik boş görünecek.
            </div>
          )}
          {/* Engagement tracking starts later than the sales history, so a range
              reaching further back mixes two spans in one row. Say which cards
              cover which, instead of letting them read as one period. */}
          {data.posthogConfigured && data.engagement.clipped && (
            <div className="bg-bg-deep border-2 border-green/30 text-green text-[11px] font-bold px-4 py-3 leading-relaxed">
              Etkileşim takibi {trDate(data.engagement.from, true)} tarihinde başladı.{" "}
              {data.engagement.empty ? (
                <>
                  Seçilen dönem tamamen bundan önce kaldığı için Tekil Ziyaret, Menü Görüntüleme, Medyan
                  Süre, Garson Çağrısı ve Sepet → Çağrı boş. Gerçek Satış seçilen dönemin tamamını kapsar.
                </>
              ) : (
                <>
                  Tekil Ziyaret, Menü Görüntüleme, Medyan Süre, Garson Çağrısı, Sepet → Çağrı ve tahmini
                  Kişi / Kişi Başı yalnızca {trDate(data.engagement.from)} – {trDate(data.engagement.to)}{" "}
                  aralığını kapsar ({tl.format(data.engagement.days)} gün). Gerçek Satış seçilen dönemin
                  tamamını kapsar.
                </>
              )}
            </div>
          )}
          {/* One line saying what a "day" is here, because it silently decides
              which day a 01:30 order belongs to and therefore every weekday and
              daily figure below. */}
          <p className="text-[10px] font-bold text-green/50 -mt-2">
            İş günü {businessDayLabel(data.businessDayStart)}’da başlar
            {data.businessDayStart > 0
              ? ` — gece yarısından sonraki siparişler bir önceki güne yazılır.`
              : ` — takvim günü; gece 00:00’dan sonraki siparişler ertesi güne yazılır.`}{" "}
            Değişimler {data.compare.label.toLocaleLowerCase("tr")} ({compareNote}) ile karşılaştırılır.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 sm:gap-4">
            {/* Sales-derived deltas are muted when either window is missing days:
                the number would be a gap in the log, not a change in business. */}
            <Kpi
              label="Gerçek Satış"
              value={money.format(kpis.totalSales)}
              unit="₺"
              delta={data.deltas.totalSales}
              deltaNote={compareNote}
              muted={!data.salesDeltaReliable}
              mutedReason={coverageReason}
            />
            <Kpi
              label="Kişi"
              value={coversReal ? tl.format(kpis.totalCovers) : estimatedCovers != null ? tl.format(estimatedCovers) : "—"}
              delta={coversReal ? data.deltas.totalCovers : undefined}
              deltaNote={compareNote}
              muted={!data.salesDeltaReliable}
              mutedReason={coverageReason}
              estimated={coversEst}
            />
            <Kpi
              label="Kişi Başı"
              value={spendReal ? money.format(kpis.avgSpendPerCover) : spendEst ? money.format(estimatedSpendPerCover as number) : "—"}
              unit={spendReal || spendEst ? "₺" : undefined}
              delta={spendReal ? data.deltas.avgSpendPerCover : undefined}
              deltaNote={compareNote}
              muted={!data.salesDeltaReliable}
              mutedReason={coverageReason}
              estimated={spendEst}
            />
            <Kpi label="Tekil Ziyaret" value={kpis.sessions ? tl.format(kpis.sessions) : "—"} delta={data.deltas.sessions} deltaNote={compareNote} />
            <Kpi label="Menü Görüntüleme" value={tl.format(kpis.views)} delta={data.deltas.views} deltaNote={compareNote} />
            <Kpi label="Medyan Süre" value={duration(kpis.avgSeconds)} delta={data.deltas.avgSeconds} deltaNote={compareNote} />
            <Kpi label="Garson Çağrısı" value={tl.format(kpis.waiterCalls)} delta={data.deltas.waiterCalls} deltaNote={compareNote} />
            <Kpi label="Sepet → Çağrı" value={kpis.cartConversion ? tl.format(kpis.cartConversion) : "—"} unit={kpis.cartConversion ? "%" : undefined} delta={data.deltas.cartConversion} deltaNote={compareNote} />
          </div>
        </Zone>

        {/* 02 — what it means: deterministic verdict + LLM findings + mined patterns */}
        <Zone index="02" title="Yapay Zekâ" desc="otomatik yorum & kalıplar">
          {/* Deterministic verdict of the period — always on, derived from real numbers */}
          <Overview data={data} />
          <CardGrid>
            {/* key remounts per range so stored findings seed cleanly and a same-range
                refresh (from a recheck) doesn't wipe the component's own state */}
            <AiInsights
              key={`${aiScopeKey}`}
              configured={data.insightsConfigured}
              initial={data.initialInsights}
              history={data.insightsHistory}
              basis={data.dataBasis}
            />
            {/* Computed + validated patterns across every numeric signal. Keyed by range
                AND the ignore list, so excluding an item remounts the card and it
                regenerates without that item (matching the charts + Overview). */}
            <PatternsCard key={`p_${aiScopeKey}`} aiConfigured={data.insightsConfigured} />
          </CardGrid>
        </Zone>

        {/* 03 — menu decisions: item-level, the most actionable views */}
        <Zone index="03" title="Menü Kararları" desc="ürün bazında">
          {/* Per-item menu engagement beside real POS sales — the strongest single
              view for menu decisions. Deliberately NOT titled as a funnel: the two
              halves come from different populations (see _conversion-table). */}
          {/* Profit before attention: the matrix leads the zone because "does it
              make money" outranks every engagement question below it, and because
              its four quadrants each name the action to take. Full width — it's a
              2×2 grid that can't survive a half-column. */}
          <MenuMatrix me={data.menuEngineering} />
          <ChartCard title="Ürün Performansı — Menü Etkileşimi & Kasa Satışı">
            <ConversionTable rows={data.itemConversion} note={engagementNote} range={data.range} />
          </ChartCard>
          {/* A card that renders null (no data) simply drops out — the survivors
              re-flow and grow, so there's never an orphaned empty half-row. */}
          <CardGrid>
            <TopProfit me={data.menuEngineering} />
            <HiddenGems items={data.hiddenGems} />
            <Momentum momentum={data.momentum} />
            <BoughtTogether pairs={data.basket.pairs} orders={data.basket.orders} />
            <PromoPerformance promo={data.promo} config={data.promoConfig} />
          </CardGrid>
        </Zone>

        {/* 04 — sales & engagement: the chart wall */}
        <Zone index="04" title="Satış & Etkileşim" desc="grafikler">
          {/* Headline comparison — full width */}
          <ChartCard title="Gerçek Satış vs Menü Etkileşimi">
            <SalesVsEngagementChart data={data.comparison} />
          </ChartCard>
          {/* "Satış (Zaman İçinde)", "En Çok İncelenen", "Yoğun Saatler" and
              "Dil Dağılımı" were removed as duplicates: their exact data lives in
              (respectively) the combo chart above, the Ürün Dönüşümü table, the
              weekly heatmap, and "Turist vs Yerli". Their source fields are still
              fetched and still feed the AI Overview / insights. */}
          <CardGrid>
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
            <ChartCard title="Fiyat Aralığına Göre Satış Dönüşümü">
              <ConversionBars
                data={data.priceBands.map((b) => ({
                  label: b.band,
                  views: b.views,
                  sold: b.sold,
                  revenue: b.revenue,
                  // Drill-down: a three-row card said "400₺+ converts badly" and
                  // left nowhere to go. The items are the decision.
                  items: b.items,
                }))}
                note={engagementNote}
              />
            </ChartCard>
            <ChartCard title="Kategori Popülerliği">
              <HBarChart data={data.categoryPopularity} color="#243845" note={engagementNote} />
            </ChartCard>
          </CardGrid>
        </Zone>

        {/* 05 — time & language: wide layouts that need the full width */}
        <Zone index="05" title="Zaman & Dil" desc="yoğunluk & dağılım">
          <LocalePrefs locales={data.localePrefs} />
          <ChartCard title="Haftalık Yoğunluk Haritası (Gün × Saat)">
            <WeekHeatmapChart data={data.weekHeatmap} note={engagementNote} />
          </ChartCard>
        </Zone>
      </div>
    </div>
  );
}
