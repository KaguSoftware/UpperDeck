import { describe, expect, it } from "vitest";
import type { CartItem, CartItemExtra } from "@/components/CartDrawer/types";
import {
  addToCart,
  buildCartId,
  cartTotal,
  decrementItem,
  discountedPrice,
  incrementItem,
  removeFromCart,
  unitPrice,
} from "./cart";

const cheese: CartItemExtra = { id: "x-cheese", label: "Cheese", price: 15 };
const bacon: CartItemExtra = { id: "x-bacon", label: "Bacon", price: 25 };

const line = (over: Partial<Parameters<typeof addToCart>[1]> = {}) => ({
  cartId: "burger",
  menu_item_id: "burger",
  name: "Burger",
  price: 200,
  extras: [],
  itemNote: "",
  ...over,
});

describe("pricing", () => {
  it("applies a featured discount and rounds to whole lira", () => {
    expect(discountedPrice(200, 25)).toBe(150);
    expect(discountedPrice(199, 10)).toBe(179); // 179.1 rounds down
  });

  it("leaves the price alone when there is no discount", () => {
    expect(discountedPrice(200)).toBe(200);
    expect(discountedPrice(200, 0)).toBe(200);
    expect(discountedPrice(200, null)).toBe(200);
  });

  it("adds extras on top of the discounted price, not before it", () => {
    expect(unitPrice(200, 25, [cheese, bacon])).toBe(150 + 15 + 25);
  });
});

describe("buildCartId", () => {
  it("uses the plain menu item id when there are no extras or note", () => {
    expect(buildCartId("burger", [], "")).toBe("burger");
  });

  it("gives a customised item its own id so it does not merge with the plain one", () => {
    expect(buildCartId("burger", [cheese, bacon], "")).toBe("burger__x-cheese_x-bacon");
    expect(buildCartId("burger", [], "no onion")).toBe("burger____noteno onion");
  });

  it("only keys on the first 8 characters of the note", () => {
    expect(buildCartId("burger", [], "no onions please")).toBe(buildCartId("burger", [], "no onions, thanks"));
  });
});

describe("addToCart", () => {
  it("adds a new line with quantity 1 and drops empty extras and notes", () => {
    const cart = addToCart([], line());
    expect(cart).toEqual([
      { id: "burger", menu_item_id: "burger", name: "Burger", price: 200, qty: 1, extras: undefined, itemNote: undefined },
    ]);
  });

  it("keeps extras and the note when present", () => {
    const [item] = addToCart([], line({ cartId: "burger__x-cheese", extras: [cheese], itemNote: "well done" }));
    expect(item.extras).toEqual([cheese]);
    expect(item.itemNote).toBe("well done");
  });

  it("bumps the quantity when the same line is added again", () => {
    const cart = addToCart(addToCart([], line()), line());
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(2);
  });

  it("keeps a customised line separate from the plain one", () => {
    const cart = addToCart(addToCart([], line()), line({ cartId: "burger__x-cheese", extras: [cheese], price: 215 }));
    expect(cart.map((i) => i.id)).toEqual(["burger", "burger__x-cheese"]);
  });

  it("does not mutate the cart it was given", () => {
    const original: CartItem[] = addToCart([], line());
    const snapshot = JSON.stringify(original);
    addToCart(original, line());
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe("quantity changes", () => {
  const base = addToCart(addToCart([], line()), line({ cartId: "fries", menu_item_id: "fries", name: "Fries", price: 80 }));

  it("increments only the requested line", () => {
    const cart = incrementItem(base, "fries");
    expect(cart.find((i) => i.id === "fries")?.qty).toBe(2);
    expect(cart.find((i) => i.id === "burger")?.qty).toBe(1);
  });

  it("decrements a line with quantity above one", () => {
    const cart = decrementItem(incrementItem(base, "fries"), "fries");
    expect(cart.find((i) => i.id === "fries")?.qty).toBe(1);
  });

  it("removes a line when decremented from one", () => {
    expect(decrementItem(base, "fries").map((i) => i.id)).toEqual(["burger"]);
  });

  it("ignores an unknown id on decrement", () => {
    expect(decrementItem(base, "nope")).toBe(base);
  });

  it("removes a line outright", () => {
    expect(removeFromCart(base, "burger").map((i) => i.id)).toEqual(["fries"]);
  });
});

describe("cartTotal", () => {
  it("is zero for an empty cart", () => {
    expect(cartTotal([])).toBe(0);
  });

  it("sums price times quantity across lines", () => {
    let cart = addToCart([], line());
    cart = incrementItem(cart, "burger");
    cart = addToCart(cart, line({ cartId: "fries", menu_item_id: "fries", name: "Fries", price: 80 }));
    expect(cartTotal(cart)).toBe(200 * 2 + 80);
  });
});
