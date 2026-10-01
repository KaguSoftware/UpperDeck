import type { CartItem, CartItemExtra } from "@/components/CartDrawer/types";

/** Price after a featured-item discount, rounded to whole lira. */
export function discountedPrice(price: number, discountPct?: number | null): number {
  return discountPct ? Math.round(price * (1 - discountPct / 100)) : price;
}

/** Unit price of a cart line: discounted base price plus every chosen extra. */
export function unitPrice(
  price: number,
  discountPct: number | null | undefined,
  extras: Pick<CartItemExtra, "price">[],
): number {
  return discountedPrice(price, discountPct) + extras.reduce((sum, e) => sum + e.price, 0);
}

/**
 * Items with extras or a note get their own cart id so they never merge with
 * the plain version of the same dish.
 */
export function buildCartId(
  menuItemId: string,
  extras: Pick<CartItemExtra, "id">[],
  itemNote: string,
): string {
  const noteKey = itemNote ? `__note${itemNote.slice(0, 8)}` : "";
  return extras.length > 0 || itemNote
    ? `${menuItemId}__${extras.map((e) => e.id).join("_")}${noteKey}`
    : menuItemId;
}

export type NewCartLine = {
  cartId: string;
  menu_item_id: string;
  name: string;
  price: number;
  extras: CartItemExtra[];
  itemNote: string;
};

/** Adds one unit of a line, or bumps the quantity if the same line is already in the cart. */
export function addToCart(items: CartItem[], line: NewCartLine): CartItem[] {
  const existing = items.find((i) => i.id === line.cartId);
  if (existing) {
    return items.map((i) => (i.id === line.cartId ? { ...i, qty: i.qty + 1 } : i));
  }
  return [
    ...items,
    {
      id: line.cartId,
      menu_item_id: line.menu_item_id,
      name: line.name,
      price: line.price,
      qty: 1,
      extras: line.extras.length > 0 ? line.extras : undefined,
      itemNote: line.itemNote || undefined,
    },
  ];
}

export function removeFromCart(items: CartItem[], id: string): CartItem[] {
  return items.filter((i) => i.id !== id);
}

export function incrementItem(items: CartItem[], id: string): CartItem[] {
  return items.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i));
}

/** Decrements a line; dropping below one removes it. Unknown ids leave the cart untouched. */
export function decrementItem(items: CartItem[], id: string): CartItem[] {
  const item = items.find((i) => i.id === id);
  if (!item) return items;
  if (item.qty <= 1) return removeFromCart(items, id);
  return items.map((i) => (i.id === id ? { ...i, qty: i.qty - 1 } : i));
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}
