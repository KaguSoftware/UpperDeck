import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

// Hit this endpoint once to register the webhook with Telegram:
//   GET https://upperdeckk.com/api/telegram/register
export async function GET(_req: NextRequest) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  if (!env.NEXT_PUBLIC_SITE_URL) {
    return NextResponse.json({ ok: false, error: "NEXT_PUBLIC_SITE_URL not set" }, { status: 500 });
  }

  const webhookUrl = `${env.NEXT_PUBLIC_SITE_URL}/api/telegram/webhook`;

  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    }
  );

  const data = await res.json();
  return NextResponse.json(data);
}
