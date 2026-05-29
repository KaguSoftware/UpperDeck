import { env } from "./env";

const API = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn("[telegram] skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");
    return false;
  }

  try {
    const res = await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[telegram] sendMessage failed", res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[telegram] fetch threw", err);
    return false;
  }
}
