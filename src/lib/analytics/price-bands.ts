import "server-only";
import { getServerClient } from "@/lib/supabase/server";
import { canonicalItemName } from "@/lib/analytics/clean-sales";
import { getRealBestSellers, getSoldItemsByDay, type DateRange } from "@/lib/analytics/sales";
import { getItemViewsWithPrice, getItemViewDiscountDays } from "@/lib/analytics/posthog";

/**
 * Price-band and discount performance measured on REAL SALES.
 *
 * These two questions — "does an expensive item lose the diner?" and "does a
 * discount actually move anything?" — used to be answered with view→add-to-cart
 * conversion. That was misleading: this menu has NO checkout, so the cart is an
 * optional scratchpad most diners skip entirely before ordering verbally. A band
 * could look like it "converts" 3× better simply because its items are the ones
 * people happen to tap the cart button on.
 *
 * Both are now views → actually SOLD (owner-entered POS quantities), the only
 * ground truth for demand this system has.
 *
 * The join key is the item NAME (canonicalized), the only key PostHog engagement
 * and the POS sheet share. Every item is banded ONCE, by a single price, so its
 * views and its sales always land in the same band:
 *   1. the menu's own price (`menu_items.price`) — the authority;
 *   2. else the price carried on the view event — for names off the menu now;
 *   3. else revenue ÷ qty from the POS rows — for items sold but never viewed.
 */

/** Shared join key — matches `compare.ts` so both sides line up on the same name. */
const nameKey = (name: string) => canonicalItemName(name).toLocaleLowerCase("tr");

// Band edges in ₺.
const PRICE_BAND_EDGES = [200, 400] as const;

/** Fixed display order; a band with no data still renders as a zero row. */
export const PRICE_BAND_LABELS = [
  `0–${PRICE_BAND_EDGES[0]} ₺`,
  `${PRICE_BAND_EDGES[0]}–${PRICE_BAND_EDGES[1]} ₺`,
  `${PRICE_BAND_EDGES[1]}+ ₺`,
];

function bandOf(price: number): string {
  if (price < PRICE_BAND_EDGES[0]) return PRICE_BAND_LABELS[0];
  if (price < PRICE_BAND_EDGES[1]) return PRICE_BAND_LABELS[1];
  return PRICE_BAND_LABELS[2];
}

export type PriceBandSales = {
  band: string;
  /** Distinct-session item views of every item in the band. */
  views: number;
  /** Real POS quantity sold. */
  sold: number;
  /** Real POS revenue (₺). */
  revenue: number;
};

/** Canonical item name → menu price, for both locale names of every item. */
async function getMenuPriceMap(): Promise<Map<string, number>> {
  const supabase = await getServerClient();
  const { data, error } = await supabase.from("menu_items").select("name_tr, name_en, price");
  if (error) {
    console.error("[analytics:price-bands] menu prices failed", error.message);
    return new Map();
  }
  const map = new Map<string, number>();
  for (const row of (data ?? []) as { name_tr: string; name_en: string; price: number }[]) {
    const price = Number(row.price) || 0;
    if (price <= 0) continue;
    // Engagement is tracked under whichever locale name the diner saw, so both map.
    for (const n of [row.name_tr, row.name_en]) {
      const k = nameKey(n ?? "");
      if (k && !map.has(k)) map.set(k, price);
    }
  }
  return map;
}

/**
 * Views and real sales per price band. `keep` is the owner's ignore-list filter —
 * an ignored upsell ("Menu Upgrade") would otherwise dominate whichever band it
 * falls in, exactly as it does in every other item-level view.
 */
export async function getPriceBandSales(
  range: DateRange,
  keep: (name: string) => boolean = () => true
): Promise<PriceBandSales[]> {
  const [menuPrices, viewed, sold] = await Promise.all([
    getMenuPriceMap(),
    getItemViewsWithPrice(range),
    // Every sold item, not a top-N: a band's total has to include its long tail.
    getRealBestSellers(range, Number.MAX_SAFE_INTEGER),
  ]);

  // One price per item, menu first, so views and sales can't split across bands.
  const priceOf = new Map(menuPrices);
  for (const v of viewed) {
    const k = nameKey(v.name);
    if (v.price > 0 && !priceOf.has(k)) priceOf.set(k, v.price);
  }
  for (const s of sold) {
    const k = nameKey(s.item_name);
    if (!priceOf.has(k) && s.qty > 0 && s.revenue > 0) priceOf.set(k, s.revenue / s.qty);
  }

  const totals = new Map(
    PRICE_BAND_LABELS.map((band) => [band, { band, views: 0, sold: 0, revenue: 0 } as PriceBandSales])
  );

  for (const v of viewed) {
    if (!keep(v.name)) continue;
    const price = priceOf.get(nameKey(v.name));
    if (!price) continue; // unbandable — never guessed into a band
    totals.get(bandOf(price))!.views += v.views;
  }
  for (const s of sold) {
    if (!keep(s.item_name)) continue;
    const price = priceOf.get(nameKey(s.item_name));
    if (!price) continue;
    const t = totals.get(bandOf(price))!;
    t.sold += s.qty;
    t.revenue += s.revenue;
  }

  return PRICE_BAND_LABELS.map((band) => totals.get(band)!);
}

export type DiscountSalesSplit = {
  group: "discounted" | "regular";
  views: number;
  sold: number;
};

/**
 * Does a discount actually sell more? Views and real sales for discounted vs
 * full-price items.
 *
 * Discount status is historical, read from the `discount_pct` carried on the view
 * events of each day — not from today's settings — so a range that spans a
 * changed promotion is still attributed correctly. Sales are day-level, so the
 * join is on (item, day).
 *
 * A sale on a day the item drew no views has no flag to join to. It's attributed
 * only when the item's status never varied across the whole range; otherwise the
 * quantity is dropped rather than guessed into a group.
 */
export async function getDiscountSalesSplit(
  range: DateRange,
  keep: (name: string) => boolean = () => true
): Promise<DiscountSalesSplit[]> {
  const [viewDays, soldDays] = await Promise.all([
    getItemViewDiscountDays(range),
    getSoldItemsByDay(range),
  ]);

  const totals = {
    discounted: { views: 0, sold: 0 },
    regular: { views: 0, sold: 0 },
  };

  const dayFlag = new Map<string, boolean>(); // "item day" → was discounted
  const discDays = new Map<string, number>(); // item → days seen discounted
  const plainDays = new Map<string, number>(); // item → days seen at full price
  for (const r of viewDays) {
    if (!keep(r.name)) continue;
    const k = nameKey(r.name);
    dayFlag.set(`${k} ${r.date}`, r.discounted);
    const bucket = r.discounted ? discDays : plainDays;
    bucket.set(k, (bucket.get(k) ?? 0) + 1);
    totals[r.discounted ? "discounted" : "regular"].views += r.views;
  }

  for (const s of soldDays) {
    if (!keep(s.name) || s.qty <= 0) continue;
    const k = nameKey(s.name);
    const flag = dayFlag.get(`${k} ${s.date}`);
    if (flag !== undefined) {
      totals[flag ? "discounted" : "regular"].sold += s.qty;
      continue;
    }
    const disc = discDays.get(k) ?? 0;
    const plain = plainDays.get(k) ?? 0;
    if (disc > 0 && plain === 0) totals.discounted.sold += s.qty;
    else if (plain > 0 && disc === 0) totals.regular.sold += s.qty;
    // mixed status (or never viewed at all) → unattributable, deliberately dropped
  }

  return (["discounted", "regular"] as const).map((group) => ({ group, ...totals[group] }));
}
