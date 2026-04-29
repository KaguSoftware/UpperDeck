"use server";

import { z } from "zod";
import { getServerClient } from "@/lib/supabase/server";
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
  | { ok: true; orderId: string }
  | { ok: false; error: "validation" | "network" | "server"; message?: string };

export async function submitOrder(payload: SubmitOrderPayload): Promise<SubmitOrderResult> {
  const parsed = OrderSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "validation", message: parsed.error.issues[0]?.message };
  }

  // DEV ONLY — short-circuit before touching Supabase
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

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new DOMException("Request timed out", "AbortError")), 5000)
  );

  try {
    const supabase = await getServerClient();

    const queryPromise = supabase
      .from("orders")
      .insert({ table_number, items, note, total: serverTotal })
      .select("id")
      .single();

    const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

    if (error) {
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

    return { ok: true, orderId: data.id };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: isAbort ? "network" : "server", message: isAbort ? "Request timed out" : String(err) };
  }
}
