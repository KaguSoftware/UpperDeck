import { NextRequest, NextResponse } from "next/server";

// Telegram POSTs updates here. We just acknowledge — order notifications are
// push-only (sent from submitOrder). Extend this handler for bot commands later.
export async function POST(_req: NextRequest) {
  return NextResponse.json({ ok: true });
}
