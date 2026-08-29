import "server-only";
import { getServerClient } from "@/lib/supabase/server";
import { canonicalItemName } from "@/lib/analytics/clean-sales";
import { getRealBestSellers, type DateRange } from "@/lib/analytics/sales";
import type { SoldItemTotals } from "@/lib/analytics/menu-matrix";

/**
 * Menu position vs. real sales — does being near the top actually sell more?
 *
 * Every other item-level module here asks what sold. This one asks WHY, against
 * the one lever the owner pulls for free: the order items appear in on the phone
 * menu. Reprinting a menu costs money; dragging a row in /admin/menu costs
 * nothing, so if position moves units it is the highest-leverage edit available.
 *
 * The reading is a RANK CORRELATION (Spearman's ρ) between an item's slot and its
 * units sold, not a raw average, because both axes are ordinal and wildly
 * non-normal: one runaway best-seller in slot 9 would drag a Pearson r around by
 * itself, while ρ only cares that it outsold its neighbours.
 *
 * ── The honesty problem this file exists to NOT paper over ───────────────────
 *
 * `menu_items.sort_order` is the position RIGHT NOW. Sales are historical. There
 * is no position-history table (see supabase/migrations — none writes one), so if
 * the owner reordered the menu inside the window, every sale before that reorder
 * is attributed to a slot it was never in. That failure is invisible: the chart
 * still renders, still looks authoritative, and is quietly wrong.
 *
 * Nothing here can detect a past reorder. So instead of inventing confidence,
 * this module reports `positionAsOf` (now) alongside the range it correlates, and
 * the UI states the assumption in the card itself. Same rule as menu-matrix's
 * "a missing cost is unknown, never zero": the limit is surfaced, never hidden.
 *
 * ── Why the comparison is WITHIN a category ─────────────────────────────────
 *
 * Comparing global slot 3 (a starter) to slot 40 (a dessert) measures the
 * difference between courses, not between positions: nobody orders four desserts
 * because they were listed first. Diners scan within a section, so rank is
 * computed per category and the correlations are pooled. This is also what makes
 * the finding actionable — "move it up" is a within-section instruction.
 */

/** Shared join key — matches menu-matrix / compare / price-bands so sides line up. */
const nameKey = (name: string) => canonicalItemName(name).toLocaleLowerCase("tr");

/** One menu item's current slot, as shown to diners. */
export type MenuSlot = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  /** 1-based rank WITHIN its category, in the order diners actually see. */
  rank: number;
  /** How many items share this item's category — rank N of `categorySize`. */
  categorySize: number;
  price: number;
};

export type PositionItem = MenuSlot & {
  /** Real POS units sold in the range. */
  qty: number;
  /** Real POS revenue (₺) in the range. */
  revenue: number;
  /** Units as a share of its own category's units, 0–1 — the comparable figure. */
  shareOfCategory: number;
  /**
   * Units sold relative to its category's median item (1 = exactly typical).
   * Median, not mean: one runaway seller must not define "normal" for its section.
   */
  vsCategoryMedian: number;
  /** Rank by units WITHIN the category, 1 = best seller of that section. */
  salesRank: number;
  /**
   * salesRank − rank. Negative = outsells its slot (buried winner);
   * positive = underperforms the prime real estate it occupies.
   */
  rankGap: number;
};

/** A category with enough costed, sold items to read a correlation from. */
export type CategoryPosition = {
  categoryId: string | null;
  categoryName: string;
  items: PositionItem[];
  /** Spearman's ρ, −1…1. Negative = higher on the menu sells more. */
  rho: number;
  /** Two-sided p-value for ρ. Below 0.05 the pattern is unlikely to be chance. */
  pValue: number;
  significant: boolean;
  /** Units sold by the top third of slots vs the bottom third. */
  topThirdQty: number;
  bottomThirdQty: number;
};

export type MenuPositionAnalysis = {
  categories: CategoryPosition[];
  /** Pooled ρ across categories, weighted by item count. */
  overallRho: number;
  overallP: number;
  /** True when the pooled reading clears significance on a usable sample. */
  significant: boolean;
  /**
   * Direction, stated plainly for the UI:
   *  - "top-sells"  : higher on the menu → more units (the common hypothesis)
   *  - "bottom-sells": lower on the menu → more units (worth knowing!)
   *  - "none"       : no detectable relationship
   */
  direction: "top-sells" | "bottom-sells" | "none";
  /** Items that sell far better than their slot — the promote-by-moving list. */
  buriedWinners: PositionItem[];
  /** Items holding prime slots they don't earn — the demote candidates. */
  squatters: PositionItem[];
  /** The date the POSITIONS were read (always now) vs the sales range. */
  positionAsOf: string;
  coverage: {
    /** Menu items matched to POS sales rows. */
    matchedItems: number;
    /** Distinct sold items in the range after the ignore rules. */
    soldItems: number;
    /** Categories with enough items to correlate. */
    usableCategories: number;
    /** 0–1 share of range revenue the analysis can speak for. */
    revenueRatio: number;
    reliable: boolean;
  };
  hasData: boolean;
};

/**
 * A category needs this many sold items before a rank correlation means anything.
 * Below 4, ρ can only take a handful of values and hits ±1 on pure coincidence.
 */
const MIN_ITEMS_PER_CATEGORY = 4;

/**
 * ...but 4 items is enough to COMPUTE ρ, not to believe it. A perfectly ordered
 * 4-item category yields ρ = −1 and p ≈ 0 from the t-approximation, which is an
 * artifact of the approximation, not evidence: there are only 24 possible
 * orderings, so a perfect one happens by chance about 8% of the time. Under this
 * count a category still shows its bars and its ρ, but never claims significance.
 */
const MIN_ITEMS_FOR_SIGNIFICANCE = 6;

/** Pooled sample below this is reported, but never called significant. */
const MIN_TOTAL_ITEMS = 8;

/** Standard two-sided threshold. */
const ALPHA = 0.05;

/** Below this share of range revenue the reading is a sample, not the menu. */
export const RELIABLE_POSITION_COVERAGE = 0.5;

/** An item this far ahead of its slot is worth surfacing by name. */
const GAP_THRESHOLD = 3;

/**
 * ...but a rank gap alone is not evidence, and this is the trap the whole
 * buried-winner idea walks into.
 *
 * Rank is ordinal: in a drinks section where six items sell 80–95 units, the
 * ordering is decided by a handful of units and reshuffles week to week. An item
 * can sit 4 places "ahead of its slot" while selling 3% more than the section's
 * median — a gap that is pure jitter. Surfacing it tells the owner to rearrange
 * the menu over noise, which is worse than saying nothing.
 *
 * So a named item must ALSO clear a material distance from its category's median:
 * +35% to be called a buried winner, −25% to be called a wasted slot. Both are
 * differences a person would notice on a sales sheet, which is the right bar for
 * advice that costs real effort to act on.
 */
const WINNER_MEDIAN_RATIO = 1.35;
const SQUATTER_MEDIAN_RATIO = 0.75;

/**
 * Spearman's ρ over two equal-length arrays, with tie-corrected ranks.
 *
 * Ties are real here (three items can all sell 12 units), and the naive
 * "sort and index" ranking silently biases ρ when they occur, so tied values
 * share their average rank — the standard correction.
 */
export function spearman(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return 0;

  const rank = (vals: number[]): number[] => {
    const order = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const out = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && order[j + 1].v === order[i].v) j++;
      // Average rank across the tied block (1-based).
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) out[order[k].i] = avg;
      i = j + 1;
    }
    return out;
  };

  const rx = rank(xs);
  const ry = rank(ys);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/**
 * Two-sided p-value for ρ via the t approximation, t = ρ√((n−2)/(1−ρ²)).
 *
 * Exact for large n and adequate from n≈8; below that this file refuses to call
 * anything significant anyway, so the approximation is never load-bearing.
 */
export function spearmanP(rho: number, n: number): number {
  if (n < 4) return 1;
  const r = Math.min(0.999999, Math.max(-0.999999, rho));
  const t = Math.abs(r) * Math.sqrt((n - 2) / (1 - r * r));
  return 2 * (1 - studentTCdf(t, n - 2));
}

/** Student-t CDF via the regularized incomplete beta function. */
function studentTCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  return 1 - 0.5 * incompleteBeta(x, df / 2, 0.5);
}

/**
 * Regularized incomplete beta I_x(a,b) — Lentz continued fraction.
 *
 * The fraction converges quickly for x < (a+1)/(a+b+2), so that test gates the
 * computation and mirrors FIRST via I_x(a,b) = 1 − I_{1−x}(b,a). Mirroring after
 * evaluating recurses forever, because the mirrored call re-fails the same test.
 *
 * The comparison is STRICTLY greater for a reason: on the symmetric boundary
 * (a = b, x = 0.5 — exactly the t-distribution's midpoint, so a routine input)
 * both x and 1−x sit on the threshold, and a `>=` test mirrors each call straight
 * back into an identical one until the stack dies. `>` evaluates the boundary
 * directly, where the fraction is still perfectly well behaved.
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Mirror before doing any work — the guard, not an afterthought.
  if (x > (a + 1) / (a + b + 2)) return 1 - incompleteBeta(1 - x, b, a);

  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b + lbeta) / a;

  let f = 1;
  let c = 1;
  let d = 0;
  for (let i = 0; i <= 200; i++) {
    const m = Math.floor(i / 2);
    let num: number;
    if (i === 0) num = 1;
    else if (i % 2 === 0) num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else num = -(((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1)));

    d = 1 + num * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + num / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    const cd = c * d;
    f *= cd;
    if (Math.abs(1 - cd) < 1e-10) break;
  }
  return front * (f - 1);
}

/** Lanczos approximation for log Γ(z). */
function logGamma(z: number): number {
  const g = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/**
 * Current menu slots, in the exact order the diner sees them.
 *
 * Mirrors `lib/menu/queries.ts`: categories by `sort_order`, items by
 * `sort_order` then name. Only items a diner can actually reach are ranked —
 * an unavailable item occupies no slot, and counting it would shift every
 * position below it away from what was really on screen.
 */
export async function getMenuSlots(): Promise<MenuSlot[]> {
  const supabase = await getServerClient();
  const [{ data: cats, error: ce }, { data: items, error: ie }] = await Promise.all([
    supabase.from("categories").select("id, name_tr, name_en, sort_order, parent_id"),
    supabase
      .from("menu_items")
      .select("id, name_tr, name_en, price, category_id, sort_order, is_available")
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
  ]);
  if (ce || ie) {
    console.error("[analytics:menu-position] slot read failed", ce?.message ?? ie?.message);
    return [];
  }

  type Cat = { id: string; name_tr: string; name_en: string; sort_order: number | null; parent_id: string | null };
  const catById = new Map<string, Cat>(((cats ?? []) as Cat[]).map((c) => [c.id, c]));

  type Row = {
    id: string;
    name_tr: string;
    name_en: string;
    price: number;
    category_id: string | null;
    sort_order: number | null;
    is_available: boolean;
  };
  const visible = ((items ?? []) as Row[]).filter((r) => r.is_available !== false);

  // Group by category, preserving the query's sort_order/name ordering.
  const byCat = new Map<string, Row[]>();
  for (const r of visible) {
    const key = r.category_id ?? "__none__";
    const list = byCat.get(key) ?? [];
    list.push(r);
    byCat.set(key, list);
  }

  const slots: MenuSlot[] = [];
  for (const [catKey, rows] of byCat) {
    const cat = catKey === "__none__" ? null : catById.get(catKey);
    const categoryName = cat ? cat.name_tr || cat.name_en || "—" : "Kategorisiz";
    rows.forEach((r, i) => {
      slots.push({
        id: r.id,
        name: canonicalItemName(r.name_tr || r.name_en || ""),
        categoryId: cat?.id ?? null,
        categoryName,
        rank: i + 1,
        categorySize: rows.length,
        price: Number(r.price) || 0,
      });
    });
  }
  return slots;
}

/** Median of a numeric array (0 for empty). */
function median(vals: number[]): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const EMPTY: MenuPositionAnalysis = {
  categories: [],
  overallRho: 0,
  overallP: 1,
  significant: false,
  direction: "none",
  buriedWinners: [],
  squatters: [],
  positionAsOf: "",
  coverage: { matchedItems: 0, soldItems: 0, usableCategories: 0, revenueRatio: 0, reliable: false },
  hasData: false,
};

/**
 * Correlate current menu position against real sales for a range.
 *
 * `keep` is the owner's ignore-list filter, applied exactly as in every other
 * item-level view so this card agrees with the charts. `sold` can be handed in
 * when the caller already read the deep sold list (the analytics page does), so
 * this costs one small menu read rather than another pass over every sale row.
 */
export async function getMenuPositionAnalysis(
  range: DateRange,
  keep: (name: string) => boolean = () => true,
  opts: { slots?: MenuSlot[]; sold?: SoldItemTotals[] } = {}
): Promise<MenuPositionAnalysis> {
  const [slots, sold] = await Promise.all([
    opts.slots ?? getMenuSlots(),
    opts.sold ?? getRealBestSellers(range, Number.MAX_SAFE_INTEGER),
  ]);

  const positionAsOf = new Date().toISOString().slice(0, 10);
  const kept = sold.filter((s) => keep(s.item_name) && s.qty > 0);
  const totalRevenue = kept.reduce((sum, s) => sum + s.revenue, 0);
  if (!slots.length || !kept.length) {
    return { ...EMPTY, positionAsOf, coverage: { ...EMPTY.coverage, soldItems: kept.length } };
  }

  // Sold totals keyed for the join. Both locale names already fold to one
  // canonical name upstream, so a single key per sold row is enough.
  const soldByKey = new Map<string, { qty: number; revenue: number }>();
  for (const s of kept) {
    const k = nameKey(s.item_name);
    const cur = soldByKey.get(k) ?? { qty: 0, revenue: 0 };
    cur.qty += s.qty;
    cur.revenue += s.revenue;
    soldByKey.set(k, cur);
  }

  // Join slots → sales. A menu item with no POS row sold nothing we can see; it
  // is left OUT rather than entered as 0, because "absent from the export" and
  // "genuinely sold zero" are indistinguishable here and zero would fabricate the
  // strongest possible datapoint at the bottom of every category.
  const matched: PositionItem[] = [];
  let matchedRevenue = 0;
  for (const slot of slots) {
    const hit = soldByKey.get(nameKey(slot.name));
    if (!hit) continue;
    matchedRevenue += hit.revenue;
    matched.push({
      ...slot,
      qty: hit.qty,
      revenue: hit.revenue,
      shareOfCategory: 0, // filled per category below
      vsCategoryMedian: 0,
      salesRank: 0,
      rankGap: 0,
    });
  }

  if (matched.length < MIN_TOTAL_ITEMS) {
    return {
      ...EMPTY,
      positionAsOf,
      coverage: {
        matchedItems: matched.length,
        soldItems: kept.length,
        usableCategories: 0,
        revenueRatio: totalRevenue > 0 ? matchedRevenue / totalRevenue : 0,
        reliable: false,
      },
      hasData: false,
    };
  }

  // Per category: derived fields, then the correlation.
  const byCat = new Map<string, PositionItem[]>();
  for (const m of matched) {
    const key = m.categoryId ?? "__none__";
    const list = byCat.get(key) ?? [];
    list.push(m);
    byCat.set(key, list);
  }

  const categories: CategoryPosition[] = [];
  for (const [, items] of byCat) {
    const catQty = items.reduce((s, i) => s + i.qty, 0);
    const med = median(items.map((i) => i.qty));
    // Sales rank within the category, best seller first.
    const bySales = [...items].sort((a, b) => b.qty - a.qty);
    bySales.forEach((i, idx) => {
      i.salesRank = idx + 1;
    });
    for (const i of items) {
      i.shareOfCategory = catQty > 0 ? i.qty / catQty : 0;
      i.vsCategoryMedian = med > 0 ? i.qty / med : 0;
      i.rankGap = i.salesRank - i.rank;
    }

    if (items.length < MIN_ITEMS_PER_CATEGORY) continue;

    const rho = spearman(
      items.map((i) => i.rank),
      items.map((i) => i.qty)
    );
    const p = spearmanP(rho, items.length);

    // Top vs bottom third by SLOT, for the plain-language contrast in the UI.
    const bySlot = [...items].sort((a, b) => a.rank - b.rank);
    const third = Math.max(1, Math.floor(bySlot.length / 3));
    const topThirdQty = bySlot.slice(0, third).reduce((s, i) => s + i.qty, 0);
    const bottomThirdQty = bySlot.slice(-third).reduce((s, i) => s + i.qty, 0);

    categories.push({
      categoryId: items[0].categoryId,
      categoryName: items[0].categoryName,
      items: bySlot,
      rho,
      pValue: p,
      significant: p < ALPHA && items.length >= MIN_ITEMS_FOR_SIGNIFICANCE,
      topThirdQty,
      bottomThirdQty,
    });
  }

  // Pooled reading: item-count-weighted mean ρ across usable categories, tested
  // at the pooled n. Weighting by items stops a 4-item category from carrying the
  // same authority as a 20-item one.
  const pooledN = categories.reduce((s, c) => s + c.items.length, 0);
  const overallRho =
    pooledN > 0 ? categories.reduce((s, c) => s + c.rho * c.items.length, 0) / pooledN : 0;
  const overallP = spearmanP(overallRho, pooledN);
  const significant = categories.length > 0 && pooledN >= MIN_TOTAL_ITEMS && overallP < ALPHA;

  // Buried winners / squatters: only ever drawn from categories big enough to
  // have a meaningful notion of "up" and "down". A 4-item section can throw a
  // "gap of 3" from one slow week, and naming an item there tells the owner to
  // rearrange the menu over noise — so these lists use the significance floor,
  // not the (lower) correlation floor.
  const usable = categories
    .filter((c) => c.items.length >= MIN_ITEMS_FOR_SIGNIFICANCE)
    .flatMap((c) => c.items);
  // Both lists need a rank gap AND a material sales difference — see the ratio
  // constants. Either test alone produces confident advice built on noise.
  const buriedWinners = usable
    .filter((i) => i.rankGap <= -GAP_THRESHOLD && i.vsCategoryMedian >= WINNER_MEDIAN_RATIO)
    .sort((a, b) => a.rankGap - b.rankGap || b.qty - a.qty)
    .slice(0, 5);
  const squatters = usable
    .filter(
      (i) =>
        i.rankGap >= GAP_THRESHOLD &&
        i.rank <= Math.ceil(i.categorySize / 2) &&
        i.vsCategoryMedian <= SQUATTER_MEDIAN_RATIO
    )
    .sort((a, b) => b.rankGap - a.rankGap || a.qty - b.qty)
    .slice(0, 5);

  const revenueRatio = totalRevenue > 0 ? matchedRevenue / totalRevenue : 0;

  return {
    categories: categories.sort((a, b) => b.items.length - a.items.length),
    overallRho,
    overallP,
    significant,
    // Negative ρ = low rank number (top of menu) pairs with high qty.
    direction: !significant ? "none" : overallRho < 0 ? "top-sells" : "bottom-sells",
    buriedWinners,
    squatters,
    positionAsOf,
    coverage: {
      matchedItems: matched.length,
      soldItems: kept.length,
      usableCategories: categories.length,
      revenueRatio,
      reliable: revenueRatio >= RELIABLE_POSITION_COVERAGE && significant,
    },
    hasData: categories.length > 0,
  };
}
