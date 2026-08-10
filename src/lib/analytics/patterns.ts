import "server-only";
import { getServerClient } from "@/lib/supabase/server";
import { listSalesEntries, getSoldItemsByDay, type DateRange } from "@/lib/analytics/sales";
import { getLocalePreferences } from "@/lib/analytics/posthog";
import { getPriceBandSales, getDiscountSalesSplit } from "@/lib/analytics/price-bands";
import { canonicalItemName } from "@/lib/analytics/clean-sales";
import { getMenuCostMap, type ItemCost } from "@/lib/analytics/menu-matrix";

/**
 * Deterministic pattern miner for the analytics "Kalıplar" (Patterns) section.
 *
 * This file does the MATH — never an LLM. It reads every numeric signal the
 * system collects and computes real, statistically-grounded candidate patterns
 * (correlation, market-basket lift, weekday over-indexing, segment skews), each
 * with its supporting numbers, sample size and a strength score. The LLM's only
 * job downstream (insights.ts → validatePatterns) is to reject the obvious ones
 * and phrase the survivors — it is never the source of a pattern.
 *
 * Why compute here instead of asking the model to "find patterns" in a JSON blob:
 * an LLM cannot reliably compute a correlation by eyeballing numbers, so anything
 * it "notices" is an approximation. To surface patterns that are visible THROUGH
 * the numbers (not at a glance), the numbers have to actually be crunched.
 *
 * The single most important guard is the "busy-day" confound: on a busy day
 * everything sells more, so raw daily co-movement between two items is mostly
 * "both ride the same busy days" — obvious, not a pattern. Co-movement here is
 * therefore measured on each item's daily SHARE of the day's sales (volume
 * removed), so a pattern only survives if the two items move together beyond the
 * general tide. That is what separates "waffles genuinely track burgers" from
 * "both were up because Saturday was packed".
 *
 * The second guard is SAMPLE SIZE, and it is absolute. Every candidate declares
 * how much data it rests on in its own unit and gets a confidence tier from it
 * (see `PatternConfidence` / `SAMPLE_TIERS`); anything tiering "low" is dropped
 * in `minePatterns` before the judge, the card or the owner ever sees it, and
 * every surviving pattern carries its sample in plain Turkish for the UI to print
 * next to the claim. A widening level may loosen how STRONG a signal has to be;
 * it can never loosen how much data stands behind it.
 *
 * Once `menu_items.cost` is filled in, a fifth family opens up: margin patterns
 * (mix drift over the period, weekday margin gaps) — profit questions no
 * revenue-only signal can answer, and ones the static menu-engineering matrix
 * can't either, because it has no time axis.
 */

export type PatternKind = "co-move" | "basket" | "time" | "segment" | "margin";

/**
 * How much sample a pattern rests on, in the unit that actually matters for it.
 *
 * This exists because a strong-looking statistic over a tiny sample is the single
 * most damaging thing this feature can print. "Wednesdays run 5.3×" over a 16-day
 * range is a claim about TWO Wednesdays — an owner who acts on it once and gets
 * burned stops trusting the entire section. So every candidate declares its own
 * sample unit (days, co-orders, weekday occurrences, views), gets a tier from it,
 * and anything landing on "low" is dropped in the miner and never reaches the
 * judge, the card, or the owner.
 */
export type PatternConfidence = "high" | "medium" | "low";

/** Tier a sample against its own medium/high thresholds. */
function tier(sample: number, medium: number, high: number): PatternConfidence {
  if (sample >= high) return "high";
  if (sample >= medium) return "medium";
  return "low";
}

/** The lower of two tiers — a claim is only as sound as its thinnest sample. */
function weakest(...tiers: PatternConfidence[]): PatternConfidence {
  if (tiers.includes("low")) return "low";
  return tiers.includes("medium") ? "medium" : "high";
}

export type PatternCandidate = {
  /** Stable key from kind + subjects — used to dedupe across widening cycles. */
  id: string;
  kind: PatternKind;
  /** Item names / dimension labels the pattern is about. */
  subjects: string[];
  /** Machine-readable figures backing the claim (shown in the UI, fed to the judge). */
  metrics: Record<string, number | string>;
  /** Orders or days the pattern rests on — the honesty floor. */
  sampleSize: number;
  /** Sample tier. "low" candidates are dropped before anything sees them. */
  confidence: PatternConfidence;
  /** The sample in plain Turkish, shown verbatim next to the claim ("4 Çarşamba günü"). */
  sampleLabel: string;
  /** 0..1 normalized strength of the signal itself (not its usefulness). */
  strength: number;
  /** Ranking score = strength × sample weight; higher surfaces first. */
  score: number;
  /** Neutral, structured English description handed to the LLM judge. */
  desc: string;
  /** Templated Turkish sentence, shown only if the LLM judge is unavailable. */
  fallbackText: string;
};

/**
 * Widening levels. The action mines at level 0 first; if too few patterns survive
 * validation it re-mines at the next level with looser floors, so the search digs
 * deeper only when the strict pass came up short. Every level keeps a real
 * significance floor — loosening never means inventing.
 */
type Thresholds = {
  minDays: number; // recorded days needed to trust a daily correlation
  minItemDays: number; // days an item must have sold on to enter co-move
  minItemQty: number; // total qty an item needs to be worth correlating
  minShareCorr: number; // |share correlation| floor (busy-day-controlled)
  minBasketSupport: number; // co-orders needed for a basket pair
  minLift: number; // lift floor (1 = independent → obvious)
  minWeekdayQty: number; // qty on a weekday to call it an over-index
  minWeekdayIndex: number; // observed/expected share to flag a weekday skew
  // How many times that weekday must OCCUR in the recorded range. Previously
  // unchecked, which is how a 16-day range could publish a "Wednesday" pattern
  // resting on two Wednesdays. Never widens below the confidence floor below.
  minWeekdayDays: number;
  // Views floor for the price/discount skews. Counted in DISTINCT-SESSION item
  // views (one per diner per item) since the price/discount families moved to
  // real sales — a cleaner unit than the raw modal-open events the old cart-based
  // query used, so the floors below sit ~25% lower for the same confidence.
  minSegmentViews: number;
};

const LEVELS: Thresholds[] = [
  { minDays: 8, minItemDays: 4, minItemQty: 12, minShareCorr: 0.55, minBasketSupport: 5, minLift: 1.6, minWeekdayQty: 8, minWeekdayIndex: 1.7, minWeekdayDays: 6, minSegmentViews: 30 },
  { minDays: 6, minItemDays: 3, minItemQty: 8, minShareCorr: 0.5, minBasketSupport: 4, minLift: 1.45, minWeekdayQty: 6, minWeekdayIndex: 1.55, minWeekdayDays: 5, minSegmentViews: 20 },
  { minDays: 5, minItemDays: 3, minItemQty: 6, minShareCorr: 0.45, minBasketSupport: 3, minLift: 1.35, minWeekdayQty: 5, minWeekdayIndex: 1.45, minWeekdayDays: 4, minSegmentViews: 14 },
];

export const MAX_PATTERN_LEVEL = LEVELS.length;

/**
 * Sample thresholds per pattern shape: `[medium, high]`. Widening the statistical
 * levels above can loosen how STRONG a signal has to be; it can never loosen how
 * much DATA the claim rests on, because that's the part an owner can't audit and
 * the part that destroys trust when it's thin. Anything below `medium` tiers as
 * "low" and is discarded in `minePatterns`.
 */
const SAMPLE_TIERS = {
  /** Recorded days behind a daily correlation. */
  coMoveDays: [10, 21] as const,
  /** Orders containing BOTH items. */
  basketSupport: [5, 12] as const,
  /** Total orders the lift is computed over. */
  basketOrders: [15, 60] as const,
  /** Occurrences of the weekday in the recorded range — the "2 Wednesdays" guard. */
  weekdayOccurrences: [4, 8] as const,
  /** Distinct-session views / sessions behind a segment skew. */
  segmentViews: [40, 150] as const,
  /** Recorded days behind a margin-mix movement. */
  marginDays: [12, 24] as const,
} as const;

// ---------- small statistics helpers ----------

/** Pearson correlation of two equal-length numeric vectors. 0 on degenerate input. */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    syy += ys[i] * ys[i];
    sxy += xs[i] * ys[i];
  }
  const cov = n * sxy - sx * sy;
  const vx = n * sxx - sx * sx;
  const vy = n * syy - sy * sy;
  const denom = Math.sqrt(vx * vy);
  return denom > 0 ? cov / denom : 0;
}

const TR_WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

/** JS weekday (0=Sun..6=Sat) for a yyyy-mm-dd string, anchored at UTC noon (DST-safe). */
function weekdayOf(dateISO: string): number {
  return new Date(`${dateISO}T12:00:00Z`).getUTCDay();
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => Math.round(n * 100);
const idKey = (kind: string, subjects: string[]) =>
  `${kind}:${subjects.map((s) => s.toLocaleLowerCase("tr")).sort().join("|")}`;

type OrderItem = { name_tr?: string; name_en?: string };

// ---------- family 1: item co-movement (busy-day-controlled) ----------

/**
 * Items whose daily SHARE of sales rises and falls together across the range.
 * Correlating shares (not raw quantities) removes the "everything sells more on
 * busy days" tide, so a surviving correlation means the two items genuinely track
 * each other — the "waffles move with burgers" pattern the owner asked for.
 */
function mineCoMovement(
  soldByDay: { name: string; date: string; qty: number }[],
  recordedDays: string[],
  t: Thresholds
): PatternCandidate[] {
  if (recordedDays.length < t.minDays) return [];

  const dayIndex = new Map(recordedDays.map((d, i) => [d, i]));
  const n = recordedDays.length;

  // Per-item daily quantity vector over the shared day axis (0 on days it didn't sell).
  const qtyByItem = new Map<string, number[]>();
  const totalByDay = new Array(n).fill(0);
  const daysActive = new Map<string, number>();
  const totalQty = new Map<string, number>();
  for (const row of soldByDay) {
    const di = dayIndex.get(row.date);
    if (di == null || row.qty <= 0) continue;
    const name = canonicalItemName(row.name);
    let vec = qtyByItem.get(name);
    if (!vec) {
      vec = new Array(n).fill(0);
      qtyByItem.set(name, vec);
    }
    vec[di] += row.qty;
    totalByDay[di] += row.qty;
    daysActive.set(name, (daysActive.get(name) ?? 0) + 1);
    totalQty.set(name, (totalQty.get(name) ?? 0) + row.qty);
  }

  // Keep only items with a usable footprint, then convert to daily shares.
  const items = [...qtyByItem.keys()].filter(
    (name) => (daysActive.get(name) ?? 0) >= t.minItemDays && (totalQty.get(name) ?? 0) >= t.minItemQty
  );
  const shareByItem = new Map<string, number[]>();
  for (const name of items) {
    const qty = qtyByItem.get(name)!;
    shareByItem.set(
      name,
      qty.map((q, di) => (totalByDay[di] > 0 ? q / totalByDay[di] : 0))
    );
  }

  const out: PatternCandidate[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      const shareCorr = pearson(shareByItem.get(a)!, shareByItem.get(b)!);
      // Require the co-movement to survive de-trending: strong share correlation.
      if (Math.abs(shareCorr) < t.minShareCorr) continue;
      const rawCorr = pearson(qtyByItem.get(a)!, qtyByItem.get(b)!);
      // A share correlation that flips sign vs raw is an artifact — demand both agree.
      if (Math.sign(shareCorr) !== Math.sign(rawCorr) || rawCorr === 0) continue;

      const positive = shareCorr > 0;
      const strength = Math.min(1, Math.abs(shareCorr));
      const subjects = [a, b];
      out.push({
        id: idKey("co-move", subjects),
        kind: "co-move",
        subjects,
        metrics: {
          shareCorrelation: round1(shareCorr),
          rawCorrelation: round1(rawCorr),
          days: n,
          direction: positive ? "together" : "inverse",
        },
        sampleSize: n,
        confidence: tier(n, ...SAMPLE_TIERS.coMoveDays),
        sampleLabel: `${n} gün`,
        strength,
        score: strength * Math.log2(n + 2),
        desc:
          `Daily-share correlation between "${a}" and "${b}" over ${n} recorded days is ` +
          `${round1(shareCorr)} (${positive ? "move together" : "move inversely"}), measured on each ` +
          `item's share of the day's sales so overall busy/slow days are already controlled for. ` +
          `Raw quantity correlation ${round1(rawCorr)}.`,
        fallbackText: positive
          ? `${a} ve ${b} aynı günlerde birlikte hareket ediyor (pay korelasyonu ${round1(shareCorr)}, ${n} gün) — birini alan güne diğerini önerin.`
          : `${a} çok satan günlerde ${b} geriliyor (ters korelasyon ${round1(shareCorr)}, ${n} gün) — biri diğerinin yerini alıyor olabilir.`,
      });
    }
  }
  return out;
}

// ---------- family 2: market-basket lift ----------

/**
 * Pairs bought together far more than chance would predict. Lift = P(B|A)/P(B):
 * lift ≈ 1 means independent (the "everyone-adds-cola" case — obvious, dropped),
 * lift ≫ 1 means a genuine association. This is the numeric answer to "is this a
 * real combo or just two popular items?".
 */
async function mineBasketLift(range: DateRange, keep: (n: string) => boolean, t: Thresholds): Promise<PatternCandidate[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await getServerClient()) as any;
  const { data, error } = await supabase
    .from("orders")
    .select("items")
    .neq("status", "cancelled")
    .gte("created_at", `${range.from}T00:00:00`)
    .lte("created_at", `${range.to}T23:59:59`);
  if (error || !data?.length) return [];

  const solo = new Map<string, number>();
  const pairs = new Map<string, Map<string, number>>();
  let orders = 0;
  for (const row of data as { items: OrderItem[] }[]) {
    const names = [
      ...new Set(
        (row.items ?? [])
          .map((it) => canonicalItemName((it.name_tr || it.name_en || "").trim()))
          .filter((nm) => nm && keep(nm))
      ),
    ].sort();
    if (names.length < 2) {
      if (names.length === 1) {
        orders++;
        solo.set(names[0], (solo.get(names[0]) ?? 0) + 1);
      }
      continue;
    }
    orders++;
    for (const nm of names) solo.set(nm, (solo.get(nm) ?? 0) + 1);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const inner = pairs.get(names[i]) ?? new Map<string, number>();
        inner.set(names[j], (inner.get(names[j]) ?? 0) + 1);
        pairs.set(names[i], inner);
      }
    }
  }
  if (orders < 4) return [];

  const out: PatternCandidate[] = [];
  for (const [x, inner] of pairs) {
    for (const [y, count] of inner) {
      if (count < t.minBasketSupport) continue;
      const cx = solo.get(x) ?? count;
      const cy = solo.get(y) ?? count;
      const lift = (count * orders) / (cx * cy);
      if (lift < t.minLift) continue; // near/below 1 → obvious co-occurrence

      // Report confidence from the rarer item's side — the higher, more actionable rate.
      const [a, b, base] = cx <= cy ? [x, y, cx] : [y, x, cy];
      const confidence = base > 0 ? count / base : 0;
      const strength = Math.min(1, (lift - 1) / 3); // lift 4 → ~1.0
      const subjects = [a, b];
      out.push({
        id: idKey("basket", subjects),
        kind: "basket",
        subjects,
        metrics: {
          lift: round1(lift),
          support: count,
          confidencePct: pct(confidence),
          orders,
        },
        sampleSize: count,
        // Both sides have to hold: enough co-orders to see the pair AND enough
        // total orders for "more likely than chance" to mean anything.
        confidence: weakest(
          tier(count, ...SAMPLE_TIERS.basketSupport),
          tier(orders, ...SAMPLE_TIERS.basketOrders)
        ),
        sampleLabel: `${count} / ${orders} sipariş`,
        strength,
        score: strength * Math.log2(count + 2),
        desc:
          `"${a}" and "${b}" appear together in ${count} of ${orders} orders. Lift ${round1(lift)} ` +
          `(1 = independent): buying "${a}" makes "${b}" ${round1(lift)}× more likely than its baseline. ` +
          `Of orders with "${a}", ${pct(confidence)}% also had "${b}".`,
        fallbackText: `${a} alanların %${pct(confidence)}'i ${b} de alıyor (şansın ${round1(lift)} katı, ${count} sipariş) — birlikte menü/çapraz satış fırsatı.`,
      });
    }
  }
  return out;
}

// ---------- family 3: weekday over-indexing ----------

/**
 * Items that sell disproportionately on a given weekday, RELATIVE TO the whole
 * restaurant's weekday rhythm. The baseline is the house's own share of sales on
 * that weekday, not the calendar — otherwise every item "over-indexes" on the
 * busiest day just because that day is busy (a side like fries at 2.6× on Friday
 * is only telling you Fridays are busy). Here an item flags only when it does MORE
 * of its business on the day than the restaurant as a whole does — a real skew.
 */
function mineWeekdaySkew(
  soldByDay: { name: string; date: string; qty: number }[],
  recordedDays: string[],
  t: Thresholds
): PatternCandidate[] {
  // How many of each weekday exist in the range (used only as a sample-size guard).
  const weekdayCount = new Array(7).fill(0);
  for (const d of recordedDays) weekdayCount[weekdayOf(d)]++;
  const totalDays = recordedDays.length;
  if (totalDays < t.minDays) return [];

  // Per-item qty per weekday + item total, AND the house-wide weekday totals that
  // form the de-trended baseline.
  const byItem = new Map<string, { perDay: number[]; total: number }>();
  const housePerDay = new Array(7).fill(0);
  let houseTotal = 0;
  const recorded = new Set(recordedDays);
  for (const row of soldByDay) {
    if (!recorded.has(row.date) || row.qty <= 0) continue;
    const name = canonicalItemName(row.name);
    const wd = weekdayOf(row.date);
    const rec = byItem.get(name) ?? { perDay: new Array(7).fill(0), total: 0 };
    rec.perDay[wd] += row.qty;
    rec.total += row.qty;
    byItem.set(name, rec);
    housePerDay[wd] += row.qty;
    houseTotal += row.qty;
  }
  if (houseTotal <= 0) return [];

  const out: PatternCandidate[] = [];
  for (const [name, rec] of byItem) {
    if (rec.total < t.minItemQty) continue;
    for (let wd = 0; wd < 7; wd++) {
      // The range has to contain enough of THIS weekday, not just enough days.
      // A 16-day range holds two Wednesdays; an index computed off two days is
      // noise wearing a decimal point, so it never becomes a candidate.
      if (weekdayCount[wd] < t.minWeekdayDays || rec.perDay[wd] < t.minWeekdayQty) continue;
      // Baseline = share of ALL sales that land on this weekday (busy-day effect
      // baked in), so the index is "vs the house", not "vs a flat calendar".
      const baselineShare = housePerDay[wd] / houseTotal;
      if (baselineShare <= 0) continue;
      const observedShare = rec.perDay[wd] / rec.total;
      const index = observedShare / baselineShare;
      if (index < t.minWeekdayIndex) continue;
      const strength = Math.min(1, (index - 1) / 2); // index 3 → ~1.0
      const subjects = [name, TR_WEEKDAYS[wd]];
      out.push({
        id: idKey("time", subjects),
        kind: "time",
        subjects,
        metrics: {
          weekday: TR_WEEKDAYS[wd],
          index: round1(index),
          itemDayPct: pct(observedShare),
          houseDayPct: pct(baselineShare),
          itemTotal: rec.total,
        },
        sampleSize: weekdayCount[wd],
        confidence: tier(weekdayCount[wd], ...SAMPLE_TIERS.weekdayOccurrences),
        sampleLabel: `${weekdayCount[wd]} ${TR_WEEKDAYS[wd]} günü`,
        strength,
        score: strength * Math.log2(rec.total + 2),
        desc:
          `"${name}" skews to ${TR_WEEKDAYS[wd]} ABOVE the restaurant's own rhythm: ${pct(observedShare)}% of its ` +
          `${rec.total} units sell on ${TR_WEEKDAYS[wd]}, vs ${pct(baselineShare)}% of ALL sales that fall on that ` +
          `day — ${round1(index)}× the house level (${weekdayCount[wd]} such days). The general busy-day effect is ` +
          `already removed by baselining against the house weekday mix, so this is item-specific, not "the day is busy".`,
        fallbackText: `${name} ${TR_WEEKDAYS[wd]} günleri restoran ortalamasının üstünde: satışlarının %${pct(observedShare)}'i o gün, tüm satışların %${pct(baselineShare)}'i o güne düşerken (evin düzeyinin ${round1(index)} katı, ${weekdayCount[wd]} ${TR_WEEKDAYS[wd]} günü üzerinden). Bu güne özel, ürüne özgü bir eğilim.`,
      });
    }
  }
  return out;
}

// ---------- family 4: segment skews (price band / discount / locale) ----------

/**
 * Aggregate skews that don't fit the item×item shape: price cliffs, discount lift,
 * locale divergence.
 *
 * The price and discount families are measured on views → REAL SALES, never
 * views → add-to-cart. With no checkout in this menu the cart is an optional
 * scratchpad, so a cart-based "conversion" says which items get tapped, not which
 * ones get sold — and a price band that sells fine could read as a disaster.
 */
async function mineSegmentSkews(range: DateRange, keep: (n: string) => boolean, t: Thresholds): Promise<PatternCandidate[]> {
  const [priceBands, discount, locales] = await Promise.all([
    getPriceBandSales(range, keep),
    getDiscountSalesSplit(range, keep),
    getLocalePreferences(range),
  ]);
  const out: PatternCandidate[] = [];
  /** Views → real sold quantity, the only demand rate this system can trust. */
  const conv = (v: { views: number; sold: number }) => (v.views > 0 ? v.sold / v.views : 0);

  // Price cliff: best- vs worst-selling band with enough traffic. Requires actual
  // sales somewhere — without entered POS items every band converts 0 and the
  // "cliff" would be pure noise.
  const bands = priceBands.filter((b) => b.views >= t.minSegmentViews);
  if (bands.length >= 2 && bands.some((b) => b.sold > 0)) {
    const best = bands.reduce((m, b) => (conv(b) > conv(m) ? b : m));
    const worst = bands.reduce((m, b) => (conv(b) < conv(m) ? b : m));
    const ratio = conv(worst) > 0 ? conv(best) / conv(worst) : Infinity;
    if (best.band !== worst.band && conv(best) > 0 && (ratio >= 1.5 || conv(worst) === 0)) {
      const subjects = ["price", best.band, worst.band];
      out.push({
        id: idKey("segment", subjects),
        kind: "segment",
        subjects: [best.band, worst.band],
        metrics: {
          bestBand: best.band,
          bestSalesPerViewPct: pct(conv(best)),
          bestSold: best.sold,
          worstBand: worst.band,
          worstSalesPerViewPct: pct(conv(worst)),
          worstSold: worst.sold,
        },
        sampleSize: best.views + worst.views,
        confidence: tier(best.views + worst.views, ...SAMPLE_TIERS.segmentViews),
        sampleLabel: `${best.views + worst.views} görüntüleme`,
        strength: Math.min(1, (isFinite(ratio) ? ratio : 3) / 4),
        score: Math.min(1, (isFinite(ratio) ? ratio : 3) / 4) * Math.log2(best.views + worst.views + 2),
        desc:
          `Price-band view→SALE conversion (real POS quantities, not cart adds): "${best.band}" turns ` +
          `${pct(conv(best))}% of its views into sales (${best.sold} sold on ${best.views} views) vs "${worst.band}" ` +
          `at ${pct(conv(worst))}% (${worst.sold} sold on ${worst.views} views). Diners act on price band.`,
        fallbackText: `${best.band} ürünleri her 100 görüntülemede ${pct(conv(best))} satışa dönüşürken ${worst.band} yalnızca ${pct(conv(worst))} — fiyat bandı gerçek satışı değiştiriyor.`,
      });
    }
  }

  // Discount lift: does a discount actually SELL more (not just get carted more)?
  const disc = discount.find((d) => d.group === "discounted");
  const reg = discount.find((d) => d.group === "regular");
  if (
    disc && reg &&
    disc.views >= t.minSegmentViews && reg.views >= t.minSegmentViews &&
    disc.sold + reg.sold > 0
  ) {
    const dc = conv(disc), rc = conv(reg);
    const ratio = rc > 0 ? dc / rc : Infinity;
    if (ratio >= 1.4 || ratio <= 0.7) {
      const subjects = ["discount"];
      const better = ratio >= 1.4;
      out.push({
        id: idKey("segment", subjects),
        kind: "segment",
        subjects: ["İndirim"],
        metrics: {
          discountedSalesPerViewPct: pct(dc),
          discountedSold: disc.sold,
          regularSalesPerViewPct: pct(rc),
          regularSold: reg.sold,
          ratio: round1(isFinite(ratio) ? ratio : 0),
        },
        sampleSize: disc.views + reg.views,
        confidence: tier(disc.views + reg.views, ...SAMPLE_TIERS.segmentViews),
        sampleLabel: `${disc.views + reg.views} görüntüleme`,
        strength: Math.min(1, Math.abs(Math.log2(isFinite(ratio) && ratio > 0 ? ratio : 2))),
        score: Math.min(1, Math.abs(Math.log2(isFinite(ratio) && ratio > 0 ? ratio : 2))) * Math.log2(disc.views + reg.views + 2),
        desc:
          `Discounted items turn ${pct(dc)}% of views into real SALES (${disc.sold} sold on ${disc.views} views) vs ` +
          `${pct(rc)}% for full-price (${reg.sold} sold on ${reg.views} views) — discounts ` +
          `${better ? "clearly lift" : "do NOT lift (and may hurt)"} actual sales.`,
        fallbackText: better
          ? `İndirimli ürünler her 100 görüntülemede ${pct(dc)} satışa dönüşüyor, normal fiyatlılar ${pct(rc)} — indirim gerçekten satış getiriyor, seçici kullanın.`
          : `İndirim satışı artırmıyor (indirimlide 100 görüntülemede ${pct(dc)} satış, normalde ${pct(rc)}) — indirim yerine sunumu gözden geçirin.`,
      });
    }
  }

  // Locale divergence — judged by PENETRATION RATE, never raw views. Since almost
  // every diner stays on the default language, the EN audience is tiny and its raw
  // counts can't be compared to TR's. Each item's rate is its share of that
  // locale's OWN sessions, so the two audiences are finally on the same scale.
  const MIN_LOCALE_RATE = 0.15; // item must reach ≥15% penetration in its locale to matter
  const tr = locales.find((l) => l.locale === "tr");
  const en = locales.find((l) => l.locale === "en");
  if (tr && en && tr.sessions >= 8 && en.sessions >= 8) {
    const key = (n: string) => canonicalItemName(n).toLocaleLowerCase("tr");
    const enTop = new Set(en.topItems.map((i) => key(i.name)));
    const trTop = new Set(tr.topItems.map((i) => key(i.name)));
    // topItems are already sorted by rate (== by count within a locale).
    const onlyTr = tr.topItems.find((i) => keep(i.name) && i.rate >= MIN_LOCALE_RATE && !enTop.has(key(i.name)));
    const onlyEn = en.topItems.find((i) => keep(i.name) && i.rate >= MIN_LOCALE_RATE && !trTop.has(key(i.name)));
    if (onlyTr && onlyEn) {
      const subjects = ["locale", onlyTr.name, onlyEn.name];
      const strength = Math.min(1, (onlyTr.rate + onlyEn.rate) / 2 + 0.2);
      out.push({
        id: idKey("segment", subjects),
        kind: "segment",
        subjects: [onlyTr.name, onlyEn.name],
        metrics: {
          trFavorite: onlyTr.name,
          trPenetrationPct: pct(onlyTr.rate),
          enFavorite: onlyEn.name,
          enPenetrationPct: pct(onlyEn.rate),
        },
        sampleSize: tr.sessions + en.sessions,
        // Tiered on the SMALLER audience: the EN side is what limits the claim,
        // and TR's thousands of sessions can't vouch for a 9-session EN sample.
        confidence: tier(Math.min(tr.sessions, en.sessions), ...SAMPLE_TIERS.segmentViews),
        sampleLabel: `${tr.sessions} TR / ${en.sessions} EN oturum`,
        strength,
        score: strength * Math.log2(tr.sessions + en.sessions + 2),
        desc:
          `Menu-language divergence by PENETRATION RATE (share of each locale's own sessions, so the far ` +
          `smaller EN audience is comparable — raw view counts are deliberately NOT used): Turkish-menu diners ` +
          `gravitate to "${onlyTr.name}" (${pct(onlyTr.rate)}% of TR sessions viewed it, absent from the EN top ` +
          `list), while English-menu diners gravitate to "${onlyEn.name}" (${pct(onlyEn.rate)}% of EN sessions).`,
        fallbackText: `Türkçe menü kullananların %${pct(onlyTr.rate)}'i ${onlyTr.name}, İngilizce menü kullananların %${pct(onlyEn.rate)}'i ${onlyEn.name} inceliyor (her dil kendi oturum oranına göre) — dile göre öne çıkan ürünü değiştirin.`,
      });
    }
  }

  return out;
}

// ---------- family 5: margin patterns (needs menu_items.cost) ----------

/** Per-day covered revenue and profit, over the items whose cost is known. */
type MarginDay = { date: string; revenue: number; profit: number };

/**
 * Day-level margin series, plus each item's profit contribution per day.
 *
 * Only costed items count, and a day with no costed sales is skipped rather than
 * recorded as zero profit — otherwise a gap in the cost table would read as a
 * collapse in profitability.
 */
function marginSeries(
  soldByDay: { name: string; date: string; qty: number; revenue: number }[],
  recordedDays: string[],
  costs: Map<string, ItemCost>
): { days: MarginDay[]; profitByItemDay: Map<string, Map<string, number>> } {
  const recorded = new Set(recordedDays);
  const byDay = new Map<string, MarginDay>();
  const profitByItemDay = new Map<string, Map<string, number>>();

  for (const row of soldByDay) {
    if (!recorded.has(row.date) || row.qty <= 0) continue;
    const name = canonicalItemName(row.name);
    const entry = costs.get(name.toLocaleLowerCase("tr"));
    if (!entry) continue;
    // Same rule as the matrix: what it actually sold for, list price as fallback.
    const unitPrice = row.revenue > 0 ? row.revenue / row.qty : entry.price;
    if (unitPrice <= 0) continue;
    const revenue = unitPrice * row.qty;
    const profit = (unitPrice - entry.cost) * row.qty;

    const day = byDay.get(row.date) ?? { date: row.date, revenue: 0, profit: 0 };
    day.revenue += revenue;
    day.profit += profit;
    byDay.set(row.date, day);

    const perDay = profitByItemDay.get(name) ?? new Map<string, number>();
    perDay.set(row.date, (perDay.get(row.date) ?? 0) + profit);
    profitByItemDay.set(name, perDay);
  }

  return {
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    profitByItemDay,
  };
}

const MIN_MARGIN_SHIFT_POINTS = 3; // percentage points — below this it's noise
const MIN_HALF_REVENUE = 2000; // ₺ of costed sales each half needs to be readable

/**
 * Two margin patterns, both invisible in the menu-engineering matrix because the
 * matrix has no time axis:
 *
 *  1. **Mix drift** — the same menu earning a different margin over the period.
 *     Revenue can hold perfectly steady while the mix rotates toward cheaper-margin
 *     items, and nothing else on the dashboard would show it. Names the item whose
 *     profit share moved most, so the drift has an address.
 *  2. **Weekday margin gap** — the busiest day is often the thinnest one (deal
 *     hunters, promo traffic, family orders). "Saturday sells the most and earns
 *     the least per lira" is a scheduling and promotion decision, and it can only
 *     be seen once cost exists.
 */
function mineMarginPatterns(
  soldByDay: { name: string; date: string; qty: number; revenue: number }[],
  recordedDays: string[],
  costs: Map<string, ItemCost>,
  t: Thresholds
): PatternCandidate[] {
  if (costs.size === 0 || recordedDays.length < t.minDays) return [];
  const { days, profitByItemDay } = marginSeries(soldByDay, recordedDays, costs);
  if (days.length < t.minDays) return [];

  const out: PatternCandidate[] = [];
  const marginPct = (d: MarginDay[]) => {
    const rev = d.reduce((s, x) => s + x.revenue, 0);
    const prof = d.reduce((s, x) => s + x.profit, 0);
    return { rev, prof, pct: rev > 0 ? (prof / rev) * 100 : 0 };
  };

  // --- 1. mix drift: first half vs second half of the recorded days ---
  const mid = Math.floor(days.length / 2);
  const early = marginPct(days.slice(0, mid));
  const late = marginPct(days.slice(mid));
  const shift = late.pct - early.pct;
  if (
    days.length >= SAMPLE_TIERS.marginDays[0] &&
    early.rev >= MIN_HALF_REVENUE &&
    late.rev >= MIN_HALF_REVENUE &&
    Math.abs(shift) >= MIN_MARGIN_SHIFT_POINTS
  ) {
    // Whose profit share moved the most in the same direction as the drift?
    const earlyDays = new Set(days.slice(0, mid).map((d) => d.date));
    let driver = "";
    let driverDelta = 0;
    for (const [name, perDay] of profitByItemDay) {
      let e = 0;
      let l = 0;
      for (const [date, profit] of perDay) (earlyDays.has(date) ? (e += profit) : (l += profit));
      const eShare = early.prof !== 0 ? e / early.prof : 0;
      const lShare = late.prof !== 0 ? l / late.prof : 0;
      const delta = lShare - eShare;
      if (Math.sign(delta) === Math.sign(shift) && Math.abs(delta) > Math.abs(driverDelta)) {
        driver = name;
        driverDelta = delta;
      }
    }

    const up = shift > 0;
    const subjects = driver ? ["margin-mix", driver] : ["margin-mix"];
    const strength = Math.min(1, Math.abs(shift) / 8); // 8 points → ~1.0
    out.push({
      id: idKey("margin", subjects),
      kind: "margin",
      subjects: driver ? [driver] : ["Kâr marjı"],
      metrics: {
        earlyMarginPct: round1(early.pct),
        lateMarginPct: round1(late.pct),
        shiftPoints: round1(shift),
        days: days.length,
        ...(driver ? { driver, driverShareShiftPct: pct(driverDelta) } : {}),
      },
      sampleSize: days.length,
      confidence: tier(days.length, ...SAMPLE_TIERS.marginDays),
      sampleLabel: `${days.length} gün`,
      strength,
      score: strength * Math.log2(days.length + 2),
      desc:
        `Gross margin on the costed part of the menu moved from ${round1(early.pct)}% in the first half of the ` +
        `period to ${round1(late.pct)}% in the second (${round1(shift)} points over ${days.length} recorded days). ` +
        `Revenue is NOT the driver here — this is the sales MIX rotating toward ${up ? "higher" : "lower"}-margin ` +
        `items.${driver ? ` Largest single mover: "${driver}", ${pct(Math.abs(driverDelta))}% ${up ? "more" : "less"} of total profit.` : ""}`,
      fallbackText: up
        ? `Kâr marjı dönemin ilk yarısında %${round1(early.pct)} iken ikinci yarısında %${round1(late.pct)}'e çıktı (${days.length} gün)${driver ? ` — en büyük katkı ${driver}` : ""}. Satış cirosu değil ürün karması değişti; bu karmayı koruyun.`
        : `Kâr marjı dönemin ilk yarısında %${round1(early.pct)} iken ikinci yarısında %${round1(late.pct)}'e düştü (${days.length} gün)${driver ? ` — kaymanın merkezinde ${driver} var` : ""}. Ciro aynı kalsa bile kâr eriyor; düşük marjlı ürünlere kayışı durdurun.`,
    });
  }

  // --- 2. weekday margin gap: busiest weekday vs the best-margin weekday ---
  const perWeekday = new Map<number, { revenue: number; profit: number; days: number }>();
  for (const d of days) {
    const wd = weekdayOf(d.date);
    const cur = perWeekday.get(wd) ?? { revenue: 0, profit: 0, days: 0 };
    cur.revenue += d.revenue;
    cur.profit += d.profit;
    cur.days++;
    perWeekday.set(wd, cur);
  }
  // Only weekdays with enough occurrences AND enough money to compare.
  const usable = [...perWeekday.entries()].filter(
    ([, v]) => v.days >= t.minWeekdayDays && v.revenue >= MIN_HALF_REVENUE / 2
  );
  if (usable.length >= 2) {
    const rate = ([, v]: [number, { revenue: number; profit: number }]) =>
      v.revenue > 0 ? (v.profit / v.revenue) * 100 : 0;
    const best = usable.reduce((m, x) => (rate(x) > rate(m) ? x : m));
    const worst = usable.reduce((m, x) => (rate(x) < rate(m) ? x : m));
    const gap = rate(best) - rate(worst);
    if (best[0] !== worst[0] && gap >= MIN_MARGIN_SHIFT_POINTS) {
      const busiest = usable.reduce((m, x) => (x[1].revenue / x[1].days > m[1].revenue / m[1].days ? x : m));
      const worstIsBusiest = busiest[0] === worst[0];
      const sample = Math.min(best[1].days, worst[1].days);
      const strength = Math.min(1, gap / 10);
      const subjects = ["margin-weekday", TR_WEEKDAYS[best[0]], TR_WEEKDAYS[worst[0]]];
      out.push({
        id: idKey("margin", subjects),
        kind: "margin",
        subjects: [TR_WEEKDAYS[worst[0]], TR_WEEKDAYS[best[0]]],
        metrics: {
          bestDay: TR_WEEKDAYS[best[0]],
          bestMarginPct: round1(rate(best)),
          worstDay: TR_WEEKDAYS[worst[0]],
          worstMarginPct: round1(rate(worst)),
          gapPoints: round1(gap),
          // Metrics are number|string (they're persisted as JSON and read by the
          // judge), so the flag travels as a word rather than a bare boolean.
          worstIsBusiest: worstIsBusiest ? "yes" : "no",
        },
        sampleSize: sample,
        confidence: tier(sample, ...SAMPLE_TIERS.weekdayOccurrences),
        sampleLabel: `${best[1].days} ${TR_WEEKDAYS[best[0]]} / ${worst[1].days} ${TR_WEEKDAYS[worst[0]]}`,
        strength,
        score: strength * Math.log2(sample + 2),
        desc:
          `Margin differs by DAY on the costed menu: ${TR_WEEKDAYS[best[0]]} earns ${round1(rate(best))}% of its ` +
          `revenue as profit (${best[1].days} such days) vs ${TR_WEEKDAYS[worst[0]]} at ${round1(rate(worst))}% ` +
          `(${worst[1].days} such days) — a ${round1(gap)}-point gap on the same menu.` +
          (worstIsBusiest
            ? ` The thin day is also the BUSIEST day by revenue, so the restaurant's biggest day is its least profitable per lira.`
            : ""),
        fallbackText: worstIsBusiest
          ? `${TR_WEEKDAYS[worst[0]]} en çok ciro yapılan gün ama kâr marjı en düşük (%${round1(rate(worst))}, ${TR_WEEKDAYS[best[0]]} %${round1(rate(best))}; ${worst[1].days} ${TR_WEEKDAYS[worst[0]]} günü üzerinden). O günün karmasını yüksek marjlı ürünlere kaydırın.`
          : `${TR_WEEKDAYS[worst[0]]} günleri kâr marjı %${round1(rate(worst))}, ${TR_WEEKDAYS[best[0]]} günleri %${round1(rate(best))} (${worst[1].days}/${best[1].days} gün). Aynı menü, ${round1(gap)} puan fark — zayıf günün ürün karmasına bakın.`,
      });
    }
  }

  return out;
}

/**
 * Mine every family at a given widening level and return candidates ranked by
 * score (strongest first). Pure of the LLM — this is the numeric ground truth the
 * judge then filters. `keep` is the owner's ignore-list filter.
 */
export async function minePatterns(
  range: DateRange,
  keep: (name: string) => boolean = () => true,
  level = 0
): Promise<PatternCandidate[]> {
  const t = LEVELS[Math.min(level, LEVELS.length - 1)];

  const [soldByDay, entries, costs] = await Promise.all([
    getSoldItemsByDay(range),
    listSalesEntries(range),
    // Empty map when no cost is entered — the margin family then mines nothing,
    // and every other family behaves exactly as before.
    getMenuCostMap(),
  ]);
  const filteredSold = soldByDay.filter((r) => keep(r.name));
  const recordedDays = [...new Set(entries.map((e) => e.entry_date))].sort();

  const [basket, segments] = await Promise.all([
    mineBasketLift(range, keep, t),
    mineSegmentSkews(range, keep, t),
  ]);

  const all = [
    ...mineCoMovement(filteredSold, recordedDays, t),
    ...basket,
    ...mineWeekdaySkew(filteredSold, recordedDays, t),
    ...segments,
    ...mineMarginPatterns(filteredSold, recordedDays, costs, t),
  ];

  // Dedupe by id (a pair can qualify under two levels) and rank.
  const byId = new Map<string, PatternCandidate>();
  for (const c of all) if (!byId.has(c.id)) byId.set(c.id, c);
  return (
    [...byId.values()]
      // The confidence gate, applied before ANYTHING downstream sees a candidate:
      // the judge can't reject a thin claim it finds persuasive, and the owner
      // certainly can't audit one. A statistic that rests on too little data is
      // simply not a pattern here, however strong it looks. See SAMPLE_TIERS.
      .filter((c) => c.confidence !== "low")
      .sort((a, b) => b.score - a.score)
  );
}
