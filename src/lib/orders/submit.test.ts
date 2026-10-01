import { beforeEach, describe, expect, it, vi } from "vitest";

const { insert, sendTelegramMessage } = vi.hoisted(() => ({
  insert: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({ from: () => ({ insert }) }),
}));
vi.mock("@/lib/telegram", () => ({ sendTelegramMessage }));

import { submitOrder, type SubmitOrderPayload } from "./submit";

const ID_1 = "3f2b8c1e-7d4a-4e1b-9c2d-5a6b7c8d9e01";
const ID_2 = "4a3c9d2f-8e5b-4f2c-8d3e-6b7c8d9e0f12";

const payload = (over: Partial<SubmitOrderPayload> = {}): SubmitOrderPayload => ({
  table_number: "12",
  items: [
    { menu_item_id: ID_1, name_en: "Burger", name_tr: "Burger", price: 200, qty: 2 },
    { menu_item_id: ID_2, name_en: "Fries", name_tr: "Patates", price: 80, qty: 1 },
  ],
  note: "",
  total: 480,
  ...over,
});

beforeEach(() => {
  insert.mockReset().mockResolvedValue({ error: null });
  sendTelegramMessage.mockReset().mockResolvedValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submitOrder validation", () => {
  it("rejects an empty order", async () => {
    const res = await submitOrder(payload({ items: [], total: 0 }));
    expect(res).toMatchObject({ ok: false, error: "validation" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a quantity of zero or above 50", async () => {
    for (const qty of [0, 51]) {
      const res = await submitOrder(payload({ items: [{ ...payload().items[0], qty }] }));
      expect(res).toMatchObject({ ok: false, error: "validation" });
    }
  });

  it("rejects a negative price and a non-uuid menu item id", async () => {
    expect(await submitOrder(payload({ items: [{ ...payload().items[0], price: -1 }] }))).toMatchObject({ ok: false, error: "validation" });
    expect(await submitOrder(payload({ items: [{ ...payload().items[0], menu_item_id: "not-a-uuid" }] }))).toMatchObject({ ok: false, error: "validation" });
  });

  it("rejects a note over 200 characters", async () => {
    expect(await submitOrder(payload({ note: "x".repeat(201) }))).toMatchObject({ ok: false, error: "validation" });
  });
});

describe("submitOrder happy path", () => {
  it("stores the order and notifies staff on Telegram", async () => {
    const res = await submitOrder(payload({ note: "no onion" }));
    expect(res).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ table_number: "12", note: "no onion", total: 480 });
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    const text = sendTelegramMessage.mock.calls[0][0] as string;
    expect(text).toContain("Table 12");
    expect(text).toContain("2× Burger");
    expect(text).toContain("no onion");
  });

  it("labels an order with no table as unknown", async () => {
    await submitOrder(payload({ table_number: "" }));
    expect(sendTelegramMessage.mock.calls[0][0]).toContain("Unknown Table");
  });

  it("trusts the server total over a tampered client total", async () => {
    const res = await submitOrder(payload({ total: 1 }));
    expect(res).toEqual({ ok: true });
    expect(insert.mock.calls[0][0].total).toBe(480);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("submitOrder failures", () => {
  it("reports a database error and does not message staff", async () => {
    insert.mockResolvedValue({ error: { code: "XX000", message: "boom", details: "", hint: "" } });
    const res = await submitOrder(payload());
    expect(res).toMatchObject({ ok: false, error: "server", message: "boom" });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("reports a thrown error as a server error", async () => {
    insert.mockRejectedValue(new Error("network down"));
    expect(await submitOrder(payload())).toMatchObject({ ok: false, error: "server" });
  });
});
