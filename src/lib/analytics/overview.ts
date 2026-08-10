/**
 * Deterministic "AI overview" for the analytics tab.
 *
 * Unlike the Groq-backed insights (lib/analytics/insights.ts), this makes NO
 * model call: it reads the numbers already computed for the page and turns them
 * into a plain-language verdict. Because every line is derived directly from a
 * real figure, it can never invent a metric that doesn't exist.
 *
 * It now speaks in PROFIT wherever `menu_items.cost` has been filled in — the
 * menu-engineering quadrants (see lib/analytics/menu-matrix) are the highest-value
 * lines this card can carry, so they lead each group and the revenue-only lines
 * fall in behind them. With no cost entered, margin is simply never mentioned:
 * an un-costed item is unknown, not free.
 *
 * Pure and side-effect free, so it runs in the client component that already
 * holds the data. Empty sections are simply omitted by the caller.
 */

import type { MenuEngineeringItem, MenuQuadrant } from "@/lib/analytics/menu-matrix";

const tl = new Intl.NumberFormat("tr-TR");
const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

// A KPI has to move at least this many percent vs. the previous period before
// we call it out — smaller swings are treated as noise.
const MOVE = 5;
// Don't judge an individual item on a handful of views.
const MIN_VIEWS = 5;

export type OverviewTone = "good" | "mixed" | "weak" | "neutral";

export type Overview = {
  tone: OverviewTone;
  headline: string;
  /** What's going well (green). */
  strengths: string[];
  /** Lean into these (promote). */
  push: string[];
  /** Look at these (review / pull back). */
  watch: string[];
};

/** Structural subset of the analytics page data this needs (AnalyticsData satisfies it). */
export type OverviewInput = {
  preset: string;
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
  deltas: {
    totalSales: number | null;
    totalCovers: number | null;
    avgSpendPerCover: number | null;
    views: number | null;
    cartConversion: number | null;
    sessions: number | null;
  };
  itemConversion: { name: string; views: number; carts: number; sold: number; convPct: number }[];
  abandonedViews: { name: string; b5to10: number; b10to20: number; b20plus: number; total: number }[];
  bestSellers: { item_name: string; qty: number; revenue: number }[];
  /**
   * Cost-derived profit picture. Absent/`hasData: false` whenever no cost has been
   * entered, and every margin line below is then skipped entirely rather than
   * computed from a zero cost.
   */
  menuEngineering?: {
    hasData: boolean;
    items: MenuEngineeringItem[];
    avgUnitMargin: number;
    totals: { qty: number; revenue: number; cost: number; profit: number; marginPct: number };
    counts: Record<MenuQuadrant, number>;
    coverage: { costedItems: number; soldItems: number; revenueRatio: number; reliable: boolean };
  } | null;
};

// Metrics where "up" is unambiguously good — the ones we tally for the verdict.
// avgSeconds (dwell) and waiterCalls are intentionally excluded: their direction
// is ambiguous, so we never spin them as good or bad.
const UP_IS_GOOD: { key: keyof OverviewInput["deltas"]; label: string }[] = [
  { key: "totalSales", label: "Satışlar" },
  { key: "avgSpendPerCover", label: "Kişi başı harcama" },
  { key: "totalCovers", label: "Müşteri sayısı" },
  { key: "cartConversion", label: "Sepet → çağrı dönüşümü" },
  { key: "views", label: "Menü görüntülenmeleri" },
  { key: "sessions", label: "Ziyaret sayısı" },
];

const norm = (s: string) => s.trim().toLocaleLowerCase("tr");
const capFirst = (s: string) => (s ? s[0].toLocaleUpperCase("tr") + s.slice(1) : s);

function periodLabel(preset: string): string {
  switch (preset) {
    case "today":
      return "bugün";
    case "7d":
      return "son 7 günde";
    case "30d":
      return "son 30 günde";
    case "90d":
      return "son 90 günde";
    default:
      return "seçili dönemde";
  }
}

export function buildOverview(data: OverviewInput): Overview {
  const { kpis, deltas, itemConversion, abandonedViews, bestSellers, preset } = data;

  const strengths: string[] = [];
  const push: string[] = [];
  const watch: string[] = [];
  const metricDeclines: string[] = [];
  // Item names already named in push/watch, so nothing is flagged twice.
  const mentioned = new Set<string>();

  // ---- profit first: the quadrant lines outrank every revenue-only line here ----
  const me = data.menuEngineering?.hasData ? data.menuEngineering : null;
  // A matrix covering a sliver of the revenue can't speak for the menu, so its
  // lines say which items they're about instead of generalizing.
  const partial = me != null && !me.coverage.reliable;
  const scope = partial ? " (maliyeti girili ürünler arasında)" : "";

  if (me) {
    strengths.push(
      `Kâr marjı %${me.totals.marginPct} — ${money.format(Math.round(me.totals.profit))} ₺ brüt kâr${
        partial
          ? `, cironun %${Math.round(me.coverage.revenueRatio * 100)}'ini kapsayan ${me.coverage.costedItems} ürün üzerinden`
          : ""
      }.`
    );

    // Sold below cost — the single most urgent thing this dashboard can say.
    const below = me.items.filter((i) => i.losingMoney).sort((a, b) => a.profit - b.profit);
    if (below.length) {
      for (const i of below.slice(0, 2)) mentioned.add(norm(i.name));
      const lost = Math.abs(below.reduce((s, i) => s + i.profit, 0));
      watch.push(
        below.length === 1
          ? `${below[0].name} maliyetinin altında satılıyor (birim ${money.format(Math.round(below[0].unitMargin))} ₺) — dönem boyunca ${money.format(Math.round(lost))} ₺ zarar; fiyatı veya porsiyon maliyetini hemen düzelt.`
          : `${below.length} ürün maliyetinin altında satılıyor (${below.slice(0, 2).map((i) => i.name).join(", ")}…) — dönem boyunca ${money.format(Math.round(lost))} ₺ zarar; fiyat/porsiyon maliyetini hemen düzelt.`
      );
    }

    // Plowhorses: carry the traffic, earn little. Usually where the money is.
    const plowhorse = me.items
      .filter((i) => i.quadrant === "plowhorse" && !i.losingMoney && !mentioned.has(norm(i.name)))
      .sort((a, b) => b.qty - a.qty)[0];
    if (plowhorse) {
      mentioned.add(norm(plowhorse.name));
      watch.push(
        `${plowhorse.name} çok satıyor ama kâr bırakmıyor: birim kâr ${money.format(Math.round(plowhorse.unitMargin))} ₺, menü ortalaması ${money.format(Math.round(me.avgUnitMargin))} ₺${scope} — porsiyon maliyetini düşür ya da fiyatı bir miktar yukarı çek.`
      );
    }

    // Puzzles: profitable but nobody finds them — the cheapest lever on the page.
    const puzzles = me.items
      .filter((i) => i.quadrant === "puzzle" && !mentioned.has(norm(i.name)))
      .sort((a, b) => b.unitMargin - a.unitMargin)
      .slice(0, 2);
    for (const p of puzzles) {
      mentioned.add(norm(p.name));
      push.push(
        `${p.name} birim ${money.format(Math.round(p.unitMargin))} ₺ kâr bırakıyor ama az satıyor (${tl.format(p.qty)} adet) — menüde üste taşı, personele hatırlat; en ucuz kâr artışı burada.`
      );
    }

    // Dogs: only worth a line as a group, and only when there are enough to matter.
    const dogs = me.items.filter((i) => i.quadrant === "dog" && !i.losingMoney);
    if (dogs.length >= 3) {
      watch.push(
        `${dogs.length} ürün hem az satıyor hem az kâr bırakıyor (toplam ${money.format(Math.round(dogs.reduce((s, d) => s + d.profit, 0)))} ₺) — menüden çıkarmayı değerlendir, mutfak da sadeleşir.`
      );
    }
  }

  // 1. Period-over-period movement — the backbone of the verdict.
  let ups = 0;
  let downs = 0;
  for (const { key, label } of UP_IS_GOOD) {
    const d = deltas[key];
    if (d == null) continue;
    if (d >= MOVE) {
      ups++;
      strengths.push(`${label} %${d} arttı.`);
    } else if (d <= -MOVE) {
      downs++;
      metricDeclines.push(`${label} %${Math.abs(d)} geriledi.`);
    }
  }

  // 2. Real best seller — a fact, not a projection.
  const top = bestSellers[0];
  if (top && top.qty > 0) {
    strengths.push(
      `En çok satan ürün: ${top.item_name} (${tl.format(top.qty)} adet${
        top.revenue ? `, ${money.format(top.revenue)} ₺` : ""
      }).`
    );
  }

  // Only trust sales-based judgments when per-item sales were actually entered for
  // the period — otherwise every item reads as "sold 0" and would be mis-flagged.
  const hasSalesData = itemConversion.some((r) => r.sold > 0) || bestSellers.some((b) => b.qty > 0);

  // 3. Push: keep leaning on proven winners…
  for (const b of bestSellers.slice(0, 2)) {
    if (b.qty <= 0) continue;
    mentioned.add(norm(b.item_name));
    push.push(`${b.item_name} güçlü satıyor — menüde ve önerilerde öne çıkarmayı sürdür.`);
  }
  // …and on items that convert views into real SALES (not just cart adds): viewed a
  // lot, high view→sale rate, not already named as a top seller.
  const highIntent = itemConversion
    .filter((r) => r.views >= MIN_VIEWS && r.sold > 0 && r.convPct >= 40 && !mentioned.has(norm(r.name)))
    .sort((a, b) => b.convPct - a.convPct)
    .slice(0, 2);
  for (const r of highIntent) {
    mentioned.add(norm(r.name));
    push.push(
      `${r.name} görüntülenince satışa dönüşüyor (her 10 görüntülemeye ~${Math.round(r.convPct / 10)} satış) — menüde üst sıraya taşımayı dene.`
    );
  }

  // 4. Watch: declining KPIs first (capped), then problem items.
  for (const line of metricDeclines.slice(0, 2)) watch.push(line);

  for (const a of abandonedViews.slice(0, 2)) {
    if (a.total < 3 || mentioned.has(norm(a.name))) continue;
    mentioned.add(norm(a.name));
    const detail =
      a.b20plus >= 2
        ? `özellikle ${tl.format(a.b20plus)} kişi 20 sn+ okuyup vazgeçti — açıklama veya fiyat sorunlu olabilir`
        : `çoğu birkaç saniyede kapatıyor — fotoğraf veya ilk izlenim zayıf olabilir`;
    watch.push(`${a.name} çok inceleniyor ama alınmıyor (${tl.format(a.total)} kez); ${detail}.`);
  }

  // "Viewed a lot but never actually sold" — the real waste. Only judged when we
  // have sales data for the period; otherwise sold===0 is meaningless.
  const dead = hasSalesData
    ? itemConversion
        .filter((r) => r.views >= MIN_VIEWS && r.sold === 0 && !mentioned.has(norm(r.name)))
        .sort((a, b) => b.views - a.views)
    : [];
  for (const r of dead) {
    if (watch.length >= 4) break;
    mentioned.add(norm(r.name));
    watch.push(
      `${r.name} ${tl.format(r.views)} kez görüntülendi ama hiç satılmadı — tanıtımını gözden geçir.`
    );
  }

  // 5. Verdict tone from the tally, then a matching headline.
  let tone: OverviewTone;
  if (ups >= 2 && ups - downs >= 2) tone = "good";
  else if (downs >= 2 && downs - ups >= 2) tone = "weak";
  else if (ups > 0 || downs > 0) tone = "mixed";
  else tone = "neutral";

  // Rising revenue with items sold below cost is not "going well" — the verdict
  // can't be greener than the profit underneath it.
  if (tone === "good" && me?.items.some((i) => i.losingMoney)) tone = "mixed";

  const period = periodLabel(preset);
  const headline =
    tone === "good"
      ? `İşler ${period} yolunda görünüyor — göstergelerin çoğu yükselişte.`
      : tone === "weak"
        ? `${capFirst(period)} bazı göstergeler geriledi — aşağıdakilere göz atmakta fayda var.`
        : tone === "mixed"
          ? `${capFirst(period)} karışık bir tablo — bazı şeyler iyi giderken bazıları dikkat istiyor.`
          : `${capFirst(period)} tablo dengeli — belirgin bir yükseliş ya da düşüş yok.`;

  return {
    tone,
    headline,
    strengths: strengths.slice(0, 4),
    push: push.slice(0, 3),
    watch: watch.slice(0, 4),
  };
}
