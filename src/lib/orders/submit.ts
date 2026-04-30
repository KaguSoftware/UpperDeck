"use server";

import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram";

const ItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  name_en: z.string().min(1),
  name_tr: z.string().min(1),
  price: z.number().nonnegative(),
  qty: z.int().min(1).max(50),
});

const OrderSchema = z.object({
  table_number: z.int().min(0).max(999),
  items: z.array(ItemSchema).min(1),
  note: z.string().max(200).default(""),
  total: z.number().nonnegative(),
  _simulateFailure: z.boolean().optional(),
});

export type SubmitOrderPayload = z.input<typeof OrderSchema>;
export type SubmitOrderResult =
  | { ok: true }
  | { ok: false; error: "validation" | "network" | "server"; message?: string };

export async function submitOrder(payload: SubmitOrderPayload): Promise<SubmitOrderResult> {
  const parsed = OrderSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "validation", message: parsed.error.issues[0]?.message };
  }

  if (parsed.data._simulateFailure && process.env.NODE_ENV === "development") {
    return { ok: false, error: "network", message: "simulated" };
  }

  const { table_number, items, note } = parsed.data;
  const serverTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  if (Math.abs(serverTotal - parsed.data.total) > 0.01) {
    console.warn("[submitOrder] client/server total mismatch", {
      clientTotal: parsed.data.total,
      serverTotal,
      table_number,
      itemCount: items.length,
    });
  }

  try {
    // Public ordering endpoint — service role bypasses RLS. Validation is
    // done above by Zod and the server-computed total is authoritative.
    const supabase = getAdminClient();

    const { error } = await supabase
      .from("orders")
      .insert({ table_number, items, note, total: serverTotal });

    if (error) {
      console.error("[submitOrder] insert failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        table_number,
        itemCount: items.length,
        total: serverTotal,
      });
      return { ok: false, error: "server", message: error.message };
    }

    const itemLines = items
      .map((i) => `  • ${i.qty}× ${i.name_en} — ${(i.price * i.qty).toLocaleString()} ₺`)
      .join("\n");
    const noteLine = note?.trim() ? `\n📝 <i>${note.trim()}</i>` : "";
    const tableLabel = table_number > 0 ? `Table ${table_number}` : "Unknown Table";
    await sendTelegramMessage(
      `🛎 <b>New Order — ${tableLabel}</b>\n\n${itemLines}${noteLine}\n\n💰 <b>Total: ${serverTotal.toLocaleString()} ₺</b>`
    );

    return { ok: true };
  } catch (err) {
    console.error("[submitOrder] threw", err);
    return { ok: false, error: "server", message: String(err) };
  }
}
