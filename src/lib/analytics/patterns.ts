import "server-only";
import { getServerClient } from "@/lib/supabase/server";
import { listSalesEntries, getSoldItemsByDay, type DateRange } from "@/lib/analytics/sales";
import { getPriceBands, getDiscountSplit, getLocalePreferences } from "@/lib/analytics/posthog";
import { canonicalItemName } from "@/lib/analytics/clean-sales";

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
 */

export type PatternKind = "co-move" | "basket" | "time" | "segment";

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
  /** 0..1 normalized confidence in the signal itself (not its usefulness). */
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
  minSegmentViews: number; // views floor for price/discount/locale skews
};

const LEVELS: Thresholds[] = [
  { minDays: 8, minItemDays: 4, minItemQty: 12, minShareCorr: 0.55, minBasketSupport: 5, minLift: 1.6, minWeekdayQty: 8, minWeekdayIndex: 1.7, minSegmentViews: 40 },
  { minDays: 6, minItemDays: 3, minItemQty: 8, minShareCorr: 0.5, minBasketSupport: 4, minLift: 1.45, minWeekdayQty: 6, minWeekdayIndex: 1.55, minSegmentViews: 25 },
  { minDays: 5, minItemDays: 3, minItemQty: 6, minShareCorr: 0.45, minBasketSupport: 3, minLift: 1.35, minWeekdayQty: 5, minWeekdayIndex: 1.45, minSegmentViews: 18 },
];

export const MAX_PATTERN_LEVEL = LEVELS.length;

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
      if (weekdayCount[wd] === 0 || rec.perDay[wd] < t.minWeekdayQty) continue;
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
        strength,
        score: strength * Math.log2(rec.total + 2),
        desc:
          `"${name}" skews to ${TR_WEEKDAYS[wd]} ABOVE the restaurant's own rhythm: ${pct(observedShare)}% of its ` +
          `${rec.total} units sell on ${TR_WEEKDAYS[wd]}, vs ${pct(baselineShare)}% of ALL sales that fall on that ` +
          `day — ${round1(index)}× the house level (${weekdayCount[wd]} such days). The general busy-day effect is ` +
          `already removed by baselining against the house weekday mix, so this is item-specific, not "the day is busy".`,
        fallbackText: `${name} ${TR_WEEKDAYS[wd]} günleri restoran ortalamasının üstünde: satışlarının %${pct(observedShare)}'i o gün, tüm satışların %${pct(baselineShare)}'i o güne düşerken (evin düzeyinin ${round1(index)} katı). Bu güne özel, ürüne özgü bir eğilim.`,
      });
    }
  }
  return out;
}

// ---------- family 4: segment skews (price band / discount / locale) ----------

/** Aggregate skews that don't fit the item×item shape: price cliffs, discount lift, locale divergence. */
async function mineSegmentSkews(range: DateRange, keep: (n: string) => boolean, t: Thresholds): Promise<PatternCandidate[]> {
  const [priceBands, discount, locales] = await Promise.all([
    getPriceBands(range),
    getDiscountSplit(range),
    getLocalePreferences(range),
  ]);
  const out: PatternCandidate[] = [];
  const conv = (v: { views: number; carts: number }) => (v.views > 0 ? v.carts / v.views : 0);

  // Price cliff: best- vs worst-converting band with enough traffic.
  const bands = priceBands.filter((b) => b.views >= t.minSegmentViews);
  if (bands.length >= 2) {
    const best = bands.reduce((m, b) => (conv(b) > conv(m) ? b : m));
    const worst = bands.reduce((m, b) => (conv(b) < conv(m) ? b : m));
    const ratio = conv(worst) > 0 ? conv(best) / conv(worst) : Infinity;
    if (best.band !== worst.band && (ratio >= 1.5 || conv(worst) === 0)) {
      const subjects = ["price", best.band, worst.band];
      out.push({
        id: idKey("segment", subjects),
        kind: "segment",
        subjects: [best.band, worst.band],
        metrics: { bestBand: best.band, bestConvPct: pct(conv(best)), worstBand: worst.band, worstConvPct: pct(conv(worst)) },
        sampleSize: best.views + worst.views,
        strength: Math.min(1, (isFinite(ratio) ? ratio : 3) / 4),
        score: Math.min(1, (isFinite(ratio) ? ratio : 3) / 4) * Math.log2(best.views + worst.views + 2),
        desc:
          `Price-band view→cart conversion: "${best.band}" converts ${pct(conv(best))}% vs "${worst.band}" ` +
          `at ${pct(conv(worst))}% (${best.views}/${worst.views} views). Diners act on price band.`,
        fallbackText: `${best.band} ürünleri sepete %${pct(conv(best))} oranında eklenirken ${worst.band} yalnızca %${pct(conv(worst))} — fiyat bandı davranışı değiştiriyor.`,
      });
    }
  }

  // Discount lift: does a discount actually change view→cart conversion?
  const disc = discount.find((d) => d.group === "discounted");
  const reg = discount.find((d) => d.group === "regular");
  if (disc && reg && disc.views >= t.minSegmentViews && reg.views >= t.minSegmentViews) {
    const dc = conv(disc), rc = conv(reg);
    const ratio = rc > 0 ? dc / rc : Infinity;
    if (ratio >= 1.4 || ratio <= 0.7) {
      const subjects = ["discount"];
      const better = ratio >= 1.4;
      out.push({
        id: idKey("segment", subjects),
        kind: "segment",
        subjects: ["İndirim"],
        metrics: { discountedConvPct: pct(dc), regularConvPct: pct(rc), ratio: round1(isFinite(ratio) ? ratio : 0) },
        sampleSize: disc.views + reg.views,
        strength: Math.min(1, Math.abs(Math.log2(isFinite(ratio) && ratio > 0 ? ratio : 2))),
        score: Math.min(1, Math.abs(Math.log2(isFinite(ratio) && ratio > 0 ? ratio : 2))) * Math.log2(disc.views + reg.views + 2),
        desc:
          `Discounted items convert ${pct(dc)}% view→cart vs ${pct(rc)}% for full-price ` +
          `(${disc.views}/${reg.views} views) — discounts ${better ? "clearly lift" : "do NOT lift (and may hurt)"} intent.`,
        fallbackText: better
          ? `İndirimli ürünler sepete %${pct(dc)} eklenirken normal fiyatlılar %${pct(rc)} — indirim işe yarıyor, seçici kullanın.`
          : `İndirim sepete ekleme oranını artırmıyor (indirimli %${pct(dc)} vs normal %${pct(rc)}) — indirim yerine sunumu gözden geçirin.`,
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

  const [soldByDay, entries] = await Promise.all([getSoldItemsByDay(range), listSalesEntries(range)]);
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
  ];

  // Dedupe by id (a pair can qualify under two levels) and rank.
  const byId = new Map<string, PatternCandidate>();
  for (const c of all) if (!byId.has(c.id)) byId.set(c.id, c);
  return [...byId.values()].sort((a, b) => b.score - a.score);
}
