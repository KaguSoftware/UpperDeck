// Supabase Edge Function — telegram-callback
// Receives Telegram Bot API webhook updates.
// Handles inline button presses to update order status directly in Supabase.
// Deploy: supabase functions deploy telegram-callback --no-verify-jwt
// Register webhook: see supabase/functions/SETUP.md

// No supabase-js import — raw fetch keeps cold-start minimal and deps at zero.

type TelegramUser = { id: number; first_name: string };
type TelegramMessage = { message_id: number; chat: { id: number } };

interface CallbackQuery {
  id: string;
  from: TelegramUser;
  message: TelegramMessage;
  data: string;
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: CallbackQuery;
}

const VALID_STATUSES = new Set(["seen", "served"]);

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
  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---------- only handle callback_query ----------
  if (!update.callback_query) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cq = update.callback_query;
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

  // Parse callback_data: "seen:{uuid}" or "served:{uuid}"
  const separatorIdx = cq.data.indexOf(":");
  if (separatorIdx === -1) {
    await answerCallbackQuery(token, cq.id, "Unknown action");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const status = cq.data.slice(0, separatorIdx);
  const orderId = cq.data.slice(separatorIdx + 1);

  if (!VALID_STATUSES.has(status) || !orderId) {
    await answerCallbackQuery(token, cq.id, "Unknown action");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // ---------- update order in Supabase ----------
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ status }),
      }
    );

    if (!patchRes.ok) {
      const body = await patchRes.text();
      console.error("[telegram-callback] Supabase PATCH error:", patchRes.status, body);
      await answerCallbackQuery(token, cq.id, "⚠️ Update failed");
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
  } catch (err) {
    console.error("[telegram-callback] fetch threw:", err);
    await answerCallbackQuery(token, cq.id, "⚠️ Network error");
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }

  // ---------- silence the spinner + disable buttons ----------
  await answerCallbackQuery(token, cq.id, `Marked as ${status}`);
  await editMessageReplyMarkup(token, cq.message.chat.id, cq.message.message_id);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch (err) {
    console.error("[telegram-callback] answerCallbackQuery failed:", err);
  }
}

async function editMessageReplyMarkup(
  token: string,
  chatId: number,
  messageId: number
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      }),
    });
  } catch (err) {
    console.error("[telegram-callback] editMessageReplyMarkup failed:", err);
  }
}
