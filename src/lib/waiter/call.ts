"use server";

import { sendTelegramMessage } from "@/lib/telegram";

export type CallReason = "bill" | "waiter" | "order";

export async function callWaiter(tableNumber: number, reason: CallReason): Promise<void> {
  const table = tableNumber > 0 ? `Masa ${tableNumber}` : "Bilinmeyen Masa";
  const msg =
    reason === "bill"
      ? `💳 <b>Hesap İsteniyor — ${table}</b>`
      : reason === "order"
      ? `🍽️ <b>${table} sipariş vermek istiyor</b>`
      : `🙋 <b>Garson Çağrısı — ${table}</b>`;
  await sendTelegramMessage(msg);
}
