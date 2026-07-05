/**
 * Thin client-side analytics wrapper around posthog-js.
 *
 * Every helper no-ops when PostHog isn't initialized (key absent), so the menu
 * works identically with or without analytics configured. Import only from
 * client components — this touches `window`.
 *
 * Events are deliberately coarse (one per meaningful diner action) and carry
 * a small, flat set of properties. `table_number` and `locale` are registered
 * as super-properties by PostHogProvider, so they ride on every event.
 */
import posthog from "posthog-js";

function ph(): typeof posthog | null {
  // __loaded is set once posthog.init() has run with a real key.
  if (typeof window === "undefined") return null;
  if (!posthog.__loaded) return null;
  return posthog;
}

function capture(event: string, props?: Record<string, unknown>) {
  try {
    ph()?.capture(event, props);
  } catch (err) {
    // Analytics must never break the menu.
    console.warn(`[analytics] capture failed for "${event}"`, err);
  }
}

export const track = {
  itemViewed: (item: { id: string; name: string; price?: number; category?: string }) =>
    capture("item_viewed", { item_id: item.id, item_name: item.name, price: item.price, category: item.category }),

  itemAddedToCart: (item: { id: string; name: string; price: number; qty: number; extras?: number }) =>
    capture("item_added_to_cart", {
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      qty: item.qty,
      extras_count: item.extras ?? 0,
    }),

  // Fired when a diner closes an item modal without adding to cart. Dwell <5s
  // is filtered client-side (mistake tap) before this is called.
  itemViewAbandoned: (item: { id: string; name: string; dwellMs: number }) =>
    capture("item_view_abandoned", { item_id: item.id, item_name: item.name, dwell_ms: item.dwellMs }),

  itemRemovedFromCart: (item: { id: string; name?: string }) =>
    capture("item_removed_from_cart", { item_id: item.id, item_name: item.name }),

  categorySelected: (slug: string) => capture("category_selected", { category: slug }),

  cartOpened: () => capture("cart_opened"),

  waiterCalled: (kind: "order" | "bill" = "order") => capture("waiter_called", { kind }),

  orderSubmitted: (o: { total: number; item_count: number }) =>
    capture("order_submitted", { total: o.total, item_count: o.item_count }),

  orderFailed: (errorType: string) => capture("order_failed", { error_type: errorType }),

  featuredItemClicked: (id: string) => capture("featured_item_clicked", { item_id: id }),

  suggestedItemClicked: (id: string) => capture("suggested_item_clicked", { item_id: id }),
};
