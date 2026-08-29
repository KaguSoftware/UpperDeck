import "server-only";
import { getServerClient } from "@/lib/supabase/server";
import { canonicalItemName } from "@/lib/analytics/clean-sales";
import { getRealBestSellers, type DateRange } from "@/lib/analytics/sales";

/**
 * Menu engineering — the profit axis this dashboard was missing.
 *
 * Every other module here measures REVENUE and attention: what sells, what gets
 * viewed, what converts. None of it can answer "does this item make money",
 * because the system had no cost. `menu_items.cost` supplies it, and this file
 * turns it into the standard Kasavana–Smith matrix every restaurant consultant
 * works from:
 *
 *                 │ high margin        │ low margin
 *   ──────────────┼────────────────────┼──────────────────────────
 *   popular       │ ⭐ STAR             │ 🐴 PLOWHORSE
 *                 │ protect, never     │ raise price or cut
 *                 │ discount           │ portion cost
 *   ──────────────┼────────────────────┼──────────────────────────
 *   unpopular     │ ❓ PUZZLE           │ 🐕 DOG
 *                 │ promote harder —   │ cut from the menu
 *                 │ it's worth it      │
 *
 * Both axes are RELATIVE to this menu, per the framework:
 *  - popularity: an item's share of units sold vs. 70% of an even split
 *    (`1/N × 0.7`) — the classic menu-mix rule, so "popular" means popular here,
 *    not above some invented absolute;
 *  - margin: unit contribution margin vs. the WEIGHTED AVERAGE contribution
 *    margin of everything in the matrix (total profit ÷ total units), not the
 *    unweighted mean — a single expensive rarity must not drag the bar up.
 *
 * Two honesty rules run through the whole file:
 *
 *  1. **A missing cost is unknown, never zero.** Items without a cost are left
 *     out entirely rather than reported at 100% margin. `coverage` says how much
 *     of the period's real revenue the matrix can actually speak for, so a matrix
 *     built on three costed items can't pass for the whole menu.
 *  2. **The selling price comes from the POS when it can.** Real revenue ÷ real
 *     quantity is what the diner actually paid (discounts, meal-deal pricing and
 *     all); the menu price is only the fallback for items whose POS rows carry no
 *     revenue. Margin computed off the list price would overstate every
 *     discounted item — precisely the ones worth catching.
 */

/** Shared join key — matches compare.ts / price-bands.ts so both sides line up. */
const nameKey = (name: string) => canonicalItemName(name).toLocaleLowerCase("tr");

export type MenuQuadrant = "star" | "plowhorse" | "puzzle" | "dog";

/** Menu price + owner-entered cost for one item. `cost` is always non-null here. */
export type ItemCost = { name: string; price: number; cost: number };

export type MenuEngineeringItem = {
  name: string;
  /** Real POS units sold in the range. */
  qty: number;
  /** Real POS revenue (₺) in the range. */
  revenue: number;
  /** What a unit actually sold for: revenue ÷ qty, else the menu price. */
  unitPrice: number;
  unitCost: number;
  /** Contribution margin per unit (₺) — can be negative, which is a real finding. */
  unitMargin: number;
  /** Contribution margin as a share of the selling price, in percent. */
  marginPct: number;
  /** Total contribution for the period (unitMargin × qty). */
  profit: number;
  /** Share of the matrix's total profit, 0–1. */
  profitShare: number;
  /** Share of the matrix's total units — the "menu mix", 0–1. */
  qtyShare: number;
  /** qtyShare ÷ an even split; 1 = exactly average popularity. */
  popularityIndex: number;
  popular: boolean;
  highMargin: boolean;
  quadrant: MenuQuadrant;
  /** Sold below cost — always worth surfacing regardless of quadrant. */
  losingMoney: boolean;
};

export type MenuEngineering = {
  /** Costed, sold items — strongest profit contribution first. */
  items: MenuEngineeringItem[];
  /** The margin axis: weighted-average contribution margin, ₺/unit. */
  avgUnitMargin: number;
  /** The popularity axis, as a share of total units (Kasavana–Smith 70% rule). */
  popularityThreshold: number;
  totals: {
    qty: number;
    /** Revenue of the costed items only — the base every margin below refers to. */
    revenue: number;
    cost: number;
    profit: number;
    /** profit ÷ revenue over the costed items, in percent. */
    marginPct: number;
  };
  counts: Record<MenuQuadrant, number>;
  coverage: {
    /** Distinct sold items that have a cost. */
    costedItems: number;
    /** Distinct sold items in the range (after the ignore rules). */
    soldItems: number;
    /** Real revenue of every sold item, costed or not. */
    totalRevenue: number;
    /** 0–1 share of that revenue the matrix covers. */
    revenueRatio: number;
    /** True when enough of the money is costed to read the matrix as the menu. */
    reliable: boolean;
  };
  /** False when nothing sold has a cost — the UI shows a setup prompt instead. */
  hasData: boolean;
};

/**
 * Classic menu-mix rule: "popular" starts at 70% of an even share. With 20 items
 * an even share is 5% of units, so anything at or above 3.5% counts as popular.
 */
const POPULARITY_RULE = 0.7;

/**
 * Below this share of costed revenue the matrix is a sample, not the menu, and
 * every consumer (UI, overview, AI) has to say so rather than generalize from it.
 */
export const RELIABLE_COST_COVERAGE = 0.6;

/** Fixed display order — matrix reading order, best quadrant first. */
export const QUADRANTS: MenuQuadrant[] = ["star", "plowhorse", "puzzle", "dog"];

/**
 * Menu price + cost for every item that HAS a cost, keyed by canonical name.
 * Both locale names map to the same entry because engagement and POS exports each
 * use whichever one they saw. Items with no cost are absent, so a lookup miss
 * means "unknown margin" and callers can't accidentally read it as zero.
 */
export async function getMenuCostMap(): Promise<Map<string, ItemCost>> {
  const supabase = await getServerClient();
  const { data, error } = await supabase.from("menu_items").select("name_tr, name_en, price, cost");
  if (error) {
    console.error("[analytics:menu-matrix] menu cost read failed", error.message);
    return new Map();
  }
  const map = new Map<string, ItemCost>();
  for (const row of (data ?? []) as { name_tr: string; name_en: string; price: number; cost: number | null }[]) {
    if (row.cost == null) continue; // not entered — deliberately absent, not 0
    const cost = Number(row.cost);
    const price = Number(row.price) || 0;
    if (!Number.isFinite(cost) || cost < 0) continue;
    // Display under the Turkish name (what the charts and POS sheet use).
    const display = canonicalItemName(row.name_tr || row.name_en || "");
    for (const n of [row.name_tr, row.name_en]) {
      const k = nameKey(n ?? "");
      if (k && !map.has(k)) map.set(k, { name: display, price, cost });
    }
  }
  return map;
}

/** Item totals the matrix needs — the shape `getRealBestSellers` already returns. */
export type SoldItemTotals = { item_name: string; qty: number; revenue: number };

/**
 * Build the matrix for a range. `keep` is the owner's ignore-list filter, applied
 * exactly as in every other item-level view so the matrix agrees with the charts.
 *
 * Both inputs can be handed in when the caller already has them — the analytics
 * page reads the full sold list for its charts anyway, so passing it saves a
 * second pass over every sale row of the range.
 */
export async function getMenuEngineering(
  range: DateRange,
  keep: (name: string) => boolean = () => true,
  opts: { costs?: Map<string, ItemCost>; sold?: SoldItemTotals[] } = {}
): Promise<MenuEngineering> {
  const [costMap, sold] = await Promise.all([
    opts.costs ?? getMenuCostMap(),
    // Every sold item, not a top-N: the matrix's whole point is the long tail
    // (dogs and puzzles never reach a top-10 list).
    opts.sold ?? getRealBestSellers(range, Number.MAX_SAFE_INTEGER),
  ]);

  const kept = sold.filter((s) => keep(s.item_name) && s.qty > 0);
  const totalRevenue = kept.reduce((sum, s) => sum + s.revenue, 0);

  type Row = Omit<MenuEngineeringItem, "qtyShare" | "popularityIndex" | "popular" | "highMargin" | "quadrant" | "profitShare">;
  const rows: Row[] = [];
  for (const s of kept) {
    const entry = costMap.get(nameKey(s.item_name));
    if (!entry) continue; // no cost → unknown margin, left out of the matrix
    // What a unit actually sold for. POS revenue reflects discounts and combo
    // pricing; the menu price is only a fallback for rows with no revenue.
    const unitPrice = s.revenue > 0 ? s.revenue / s.qty : entry.price;
    if (unitPrice <= 0) continue; // nothing to compute a margin against
    const unitMargin = unitPrice - entry.cost;
    rows.push({
      name: s.item_name,
      qty: s.qty,
      revenue: s.revenue > 0 ? s.revenue : unitPrice * s.qty,
      unitPrice,
      unitCost: entry.cost,
      unitMargin,
      marginPct: Math.round((unitMargin / unitPrice) * 100),
      profit: unitMargin * s.qty,
      losingMoney: unitMargin < 0,
    });
  }

  const empty: MenuEngineering = {
    items: [],
    avgUnitMargin: 0,
    popularityThreshold: 0,
    totals: { qty: 0, revenue: 0, cost: 0, profit: 0, marginPct: 0 },
    counts: { star: 0, plowhorse: 0, puzzle: 0, dog: 0 },
    coverage: {
      costedItems: 0,
      soldItems: kept.length,
      totalRevenue,
      revenueRatio: 0,
      reliable: false,
    },
    hasData: false,
  };
  if (rows.length === 0) return empty;

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const totalCovered = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCost = rows.reduce((s, r) => s + r.unitCost * r.qty, 0);
  if (totalQty <= 0) return empty;

  // The two axes. Weighted average CM, not the mean of unit margins: one pricey
  // rarity shouldn't raise the bar the whole menu is judged against.
  const avgUnitMargin = totalProfit / totalQty;
  const popularityThreshold = (1 / rows.length) * POPULARITY_RULE;

  const items: MenuEngineeringItem[] = rows
    .map((r) => {
      const qtyShare = r.qty / totalQty;
      const popular = qtyShare >= popularityThreshold;
      const highMargin = r.unitMargin >= avgUnitMargin;
      return {
        ...r,
        qtyShare,
        popularityIndex: qtyShare * rows.length,
        popular,
        highMargin,
        quadrant: (popular
          ? highMargin
            ? "star"
            : "plowhorse"
          : highMargin
            ? "puzzle"
            : "dog") as MenuQuadrant,
        // Signed share: a loss-making item legitimately reads as negative here.
        profitShare: totalProfit !== 0 ? r.profit / totalProfit : 0,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  const counts: Record<MenuQuadrant, number> = { star: 0, plowhorse: 0, puzzle: 0, dog: 0 };
  for (const i of items) counts[i.quadrant]++;

  const revenueRatio = totalRevenue > 0 ? totalCovered / totalRevenue : 0;

  return {
    items,
    avgUnitMargin,
    popularityThreshold,
    totals: {
      qty: totalQty,
      revenue: totalCovered,
      cost: totalCost,
      profit: totalProfit,
      marginPct: totalCovered > 0 ? Math.round((totalProfit / totalCovered) * 100) : 0,
    },
    counts,
    coverage: {
      costedItems: items.length,
      soldItems: kept.length,
      totalRevenue,
      revenueRatio,
      reliable: revenueRatio >= RELIABLE_COST_COVERAGE,
    },
    hasData: true,
  };
}

/**
 * Compact, model-facing serialization of the matrix. Kept deliberately small and
 * pre-rounded: the judgement is already made here, so the model's job is to talk
 * about the quadrants, never to recompute them from raw costs.
 */
export type MenuEngineeringForModel = {
  covered: { items: number; ofItems: number; revenueSharePct: number; reliable: boolean };
  totals: { profit: number; revenue: number; marginPct: number };
  /** The margin bar items are judged against, ₺/unit. */
  avgUnitMargin: number;
  items: {
    name: string;
    quadrant: MenuQuadrant;
    qty: number;
    revenue: number;
    profit: number;
    marginPct: number;
    unitMargin: number;
    /** 1 = average popularity for this menu. */
    popularityIndex: number;
  }[];
};

/** Trim the matrix for the LLM prompt — top contributors plus every problem item. */
export function menuEngineeringForModel(me: MenuEngineering, limit = 24): MenuEngineeringForModel | null {
  if (!me.hasData) return null;
  // Profit-ranked head, plus the tail cases that matter most even when small:
  // loss-makers, dogs and plowhorses are the actionable half of the framework.
  const head = me.items.slice(0, limit);
  const seen = new Set(head.map((i) => i.name));
  const problems = me.items.filter(
    (i) => !seen.has(i.name) && (i.losingMoney || i.quadrant === "dog" || i.quadrant === "plowhorse")
  );
  const round = (n: number) => Math.round(n);
  return {
    covered: {
      items: me.coverage.costedItems,
      ofItems: me.coverage.soldItems,
      revenueSharePct: Math.round(me.coverage.revenueRatio * 100),
      reliable: me.coverage.reliable,
    },
    totals: {
      profit: round(me.totals.profit),
      revenue: round(me.totals.revenue),
      marginPct: me.totals.marginPct,
    },
    avgUnitMargin: round(me.avgUnitMargin),
    items: [...head, ...problems].map((i) => ({
      name: i.name,
      quadrant: i.quadrant,
      qty: i.qty,
      revenue: round(i.revenue),
      profit: round(i.profit),
      marginPct: i.marginPct,
      unitMargin: round(i.unitMargin),
      popularityIndex: Math.round(i.popularityIndex * 10) / 10,
    })),
  };
}
