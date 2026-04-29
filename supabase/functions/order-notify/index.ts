// Supabase Edge Function — order-notify
// Triggered by a Supabase Database Webhook on public.orders INSERT.
// Sends a formatted Telegram message with inline action buttons.
// Deploy: supabase functions deploy order-notify --no-verify-jwt

interface OrderItem {
  menu_item_id: string;
  name_en: string;
  name_tr: string;
  price: number;
  qty: number;
}

interface OrderRecord {
  id: string;
  table_number: number;
  items: OrderItem[];
  total: number;
  note: string;
  status: string;
  created_at: string;
}

interface WebhookPayload {
  type: string;
  table: string;
  record: OrderRecord;
  schema: string;
  old_record: OrderRecord | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // ---------- auth ----------
  const secret = url.searchParams.get("secret");
  const expectedSecret = Deno.env.get("WEBHOOK_SECRET") ?? "";
  if (!expectedSecret || secret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---------- parse body ----------
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (payload.type !== "INSERT" || !payload.record?.id) {
    return new Response(JSON.stringify({ error: "Not an INSERT or missing record" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const order = payload.record;
  const shortId = order.id.slice(0, 8);

  // ---------- format message ----------
  const itemLines = order.items
    .map((item) => `${item.qty}× ${item.name_en}`)
    .join("\n");

  const noteLine = order.note?.trim()
    ? `\n📝 ${order.note.trim()}`
    : "";

  const tableLabel = order.table_number > 0 ? `Table ${order.table_number}` : "Unknown Table";
  const text =
    `🔔 <b>NEW ORDER</b> · #${shortId}\n` +
    `<b>${tableLabel}</b> · ₺${Number(order.total).toFixed(2)}\n` +
    `—\n` +
    `${itemLines}` +
    `${noteLine}`;

  // ---------- inline keyboard ----------
  const appUrl = (Deno.env.get("PUBLIC_APP_URL") ?? "").replace(/\/$/, "");
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "✓ Seen",    callback_data: `seen:${order.id}` },
        { text: "🍽 Served", callback_data: `served:${order.id}` },
        { text: "📋 Open",   url: `${appUrl}/admin/orders/${order.id}` },
      ],
    ],
  };

  // ---------- send ----------
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

  try {
    const tgRes = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        }),
      }
    );

    if (!tgRes.ok) {
      const body = await tgRes.text();
      console.error("[order-notify] Telegram error:", tgRes.status, body);
      return new Response(JSON.stringify({ error: "Telegram delivery failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[order-notify] fetch threw:", err);
    return new Response(JSON.stringify({ error: "Network error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
