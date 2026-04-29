"use server";

import { sendTelegramMessage } from "@/lib/telegram";

export type CallReason = "bill" | "waiter";

export async function callWaiter(tableNumber: number, reason: CallReason): Promise<void> {
  const msg =
    reason === "bill"
      ? `💳 <b>Hesap İsteniyor — Masa ${tableNumber}</b>`
      : `🙋 <b>Garson Çağrısı — Masa ${tableNumber}</b>`;
  await sendTelegramMessage(msg);
}
