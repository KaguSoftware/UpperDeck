import "server-only";
import { getServerClient } from "@/lib/supabase/server";
import { canonicalItemName } from "@/lib/analytics/clean-sales";
import type { DateRange } from "@/lib/analytics/sales";

/**
 * Market-basket affinity ("bought together") from real orders.
 *
 * Each order's `items` JSONB is the cart captured at the waiter call, so it's the
 * one true basket signal this menu produces (the POS `sales_entry_items` are
 * day-level totals with no per-order grouping). For every order we take the
 * distinct item names and tally unordered pairs across the range; the strongest
 * pairs drive combos, upsell prompts and the suggested rail.
 *
 * Confidence is shown from the RARER item's side ("of orders with X, Y% also had
 * the other") — the higher, more actionable number for a pairing. Cancelled
 * orders are excluded.
 */
export type ItemPair = {
  a: string; // antecedent (rarer of the two — the trigger item)
  b: string; // companion
  count: number; // orders containing both
  confidencePct: number; // of orders with `a`, share that also had `b`
};

type OrderItem = { name_tr?: string; name_en?: string };

export async function getBoughtTogether(
  range: DateRange,
  keep: (name: string) => boolean = () => true,
  limit = 8
): Promise<{ pairs: ItemPair[]; orders: number; itemNames: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await getServerClient()) as any;
  const { data, error } = await supabase
    .from("orders")
    .select("items")
    .neq("status", "cancelled")
    .gte("created_at", `${range.from}T00:00:00`)
    .lte("created_at", `${range.to}T23:59:59`);
  if (error || !data?.length) return { pairs: [], orders: 0, itemNames: [] };

  const solo = new Map<string, number>(); // orders containing an item
  // Nested map x -> (y -> co-order count), for sorted x < y — avoids any string
  // delimiter, since item names contain spaces.
  const pairs2 = new Map<string, Map<string, number>>();
  // Every distinct item ordered in the range, collected BEFORE `keep` so the
  // caller can offer them all in the ignore list (an already-excluded item still
  // needs a checkbox to be switched back on). Same canonical names the Kalıplar
  // basket family reports, so what a pattern names is always tickable.
  const universe = new Map<string, string>(); // match key -> display name
  let orders = 0;

  for (const row of data as { items: OrderItem[] }[]) {
    const names = [
      ...new Set(
        (row.items ?? [])
          // Fold kitchen-name variants onto the menu name, exactly as the sales,
          // conversion and pattern queries do — otherwise the same product pairs
          // under two spellings and an exclusion only catches one of them.
          .map((it) => canonicalItemName((it.name_tr || it.name_en || "").trim()))
          .filter((n) => {
            if (!n) return false;
            const k = n.toLocaleLowerCase("tr");
            if (!universe.has(k)) universe.set(k, n);
            return keep(n);
          })
      ),
    ].sort();
    if (names.length === 0) continue;
    orders++;
    for (const n of names) solo.set(n, (solo.get(n) ?? 0) + 1);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const inner = pairs2.get(names[i]) ?? new Map<string, number>();
        inner.set(names[j], (inner.get(names[j]) ?? 0) + 1);
        pairs2.set(names[i], inner);
      }
    }
  }

  const out: ItemPair[] = [];
  for (const [x, inner] of pairs2) {
    for (const [y, count] of inner) {
      if (count < 2) continue; // a lone co-order isn't a pattern
      const cx = solo.get(x) ?? count;
      const cy = solo.get(y) ?? count;
      // Antecedent = rarer item → confidence = count / count(antecedent), the higher rate.
      const [a, b, base] = cx <= cy ? [x, y, cx] : [y, x, cy];
      out.push({ a, b, count, confidencePct: base > 0 ? Math.round((count / base) * 100) : 0 });
    }
  }

  out.sort((p, q) => q.count - p.count || q.confidencePct - p.confidencePct);
  return { pairs: out.slice(0, limit), orders, itemNames: [...universe.values()] };
}
