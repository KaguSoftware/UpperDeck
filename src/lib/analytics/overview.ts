/**
 * Deterministic "AI overview" for the analytics tab.
 *
 * Unlike the Groq-backed insights (lib/analytics/insights.ts), this makes NO
 * model call: it reads the numbers already computed for the page and turns them
 * into a plain-language verdict. Because every line is derived directly from a
 * real figure, it can never invent a metric that doesn't exist — notably it
 * never talks about margins/cost, which this system doesn't track.
 *
 * Pure and side-effect free, so it runs in the client component that already
 * holds the data. Empty sections are simply omitted by the caller.
 */

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

  // 3. Push: keep leaning on proven winners…
  for (const b of bestSellers.slice(0, 2)) {
    if (b.qty <= 0) continue;
    mentioned.add(norm(b.item_name));
    push.push(`${b.item_name} güçlü satıyor — menüde ve önerilerde öne çıkarmayı sürdür.`);
  }
  // …and on high-intent items: viewed a lot, high view→cart, not already a winner.
  const highIntent = itemConversion
    .filter((r) => r.views >= MIN_VIEWS && r.convPct >= 40 && !mentioned.has(norm(r.name)))
    .sort((a, b) => b.convPct - a.convPct)
    .slice(0, 2);
  for (const r of highIntent) {
    mentioned.add(norm(r.name));
    push.push(
      `${r.name} yüksek ilgi görüyor (görüntüleyenlerin %${r.convPct}'i sepete ekliyor) — menüde üst sıraya taşımayı dene.`
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

  const dead = itemConversion
    .filter((r) => r.views >= MIN_VIEWS && r.carts === 0 && r.sold === 0 && !mentioned.has(norm(r.name)))
    .sort((a, b) => b.views - a.views);
  for (const r of dead) {
    if (watch.length >= 4) break;
    mentioned.add(norm(r.name));
    watch.push(
      `${r.name} ${tl.format(r.views)} kez görüntülendi ama hiç sepete eklenmedi/satılmadı — tanıtımını gözden geçir.`
    );
  }

  // 5. Verdict tone from the tally, then a matching headline.
  let tone: OverviewTone;
  if (ups >= 2 && ups - downs >= 2) tone = "good";
  else if (downs >= 2 && downs - ups >= 2) tone = "weak";
  else if (ups > 0 || downs > 0) tone = "mixed";
  else tone = "neutral";

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
