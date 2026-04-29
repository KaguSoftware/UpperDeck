# Upperdeck Orders — Telegram Notification Setup

Two Edge Functions handle the Telegram integration:

| Function | Purpose |
|---|---|
| `order-notify` | Called by a Supabase DB webhook on every new order. Sends a Telegram message with action buttons. |
| `telegram-callback` | Receives inline button presses from Telegram. Updates order status directly via the Supabase REST API. |

---

## Step 1 — Create the Telegram bot

1. Open Telegram and search for **@BotFather**.
2. Send `/newbot`.
3. When prompted for a name, enter: **Upperdeck Orders**
4. When prompted for a username, choose anything ending in `bot`, e.g. `upperdeck_orders_bot`.
5. Copy the **bot token** — it looks like `123456789:ABCdefGHI...`. Keep it secret.

---

## Step 2 — Get the staff group chat ID

1. Create a Telegram group (or use an existing staff group).
2. Add your bot to the group.
3. Send any message in the group (e.g. `/start`).
4. Fetch updates to find the chat ID:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
```

5. In the JSON response, find `"chat": { "id": -1001234567890, ... }`.
   The chat ID is the **negative number** — copy it including the minus sign.

---

## Step 3 — Generate a webhook secret

```bash
openssl rand -hex 32
```

Copy the output. This is your `WEBHOOK_SECRET`. It authenticates both webhooks
(Supabase → order-notify, Telegram → telegram-callback) so neither endpoint
accepts requests from strangers.

---

## Step 4 — Deploy the Edge Functions

Make sure the Supabase CLI is installed and you are logged in (`supabase login`).

```bash
supabase functions deploy order-notify --no-verify-jwt
supabase functions deploy telegram-callback --no-verify-jwt
```

`--no-verify-jwt` is **required** — neither Supabase database webhooks nor
Telegram carry Supabase JWTs. Security is provided by the `?secret=` query
parameter instead.

---

## Step 5 — Set secrets

```bash
supabase secrets set \
  TELEGRAM_BOT_TOKEN=<your-bot-token> \
  TELEGRAM_CHAT_ID=<your-chat-id-with-minus-sign> \
  WEBHOOK_SECRET=<your-webhook-secret> \
  PUBLIC_APP_URL=https://your-domain.com
```

`PUBLIC_APP_URL` must **not** end with a slash. It is used for the "📋 Open"
button that links to `/admin/orders`.

---

## Step 6 — Register the Telegram webhook

This tells Telegram where to deliver inline button callbacks.

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<project-ref>.functions.supabase.co/telegram-callback?secret=<WEBHOOK_SECRET>"
```

Replace:
- `<TOKEN>` — your bot token
- `<project-ref>` — your Supabase project ref (visible in project URL)
- `<WEBHOOK_SECRET>` — the secret from Step 3

Verify with:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

The `"url"` field should show your function URL and `"pending_update_count"` should be 0.

---

## Step 7 — Wire the database webhook

See [`supabase/migrations/20260429000001_order_webhook.sql`](../migrations/20260429000001_order_webhook.sql) for full instructions. The short version:

1. Supabase Dashboard → **Database** → **Webhooks** → **Create a new hook**
2. Settings:
   - **Name:** `order-notify`
   - **Table:** `public.orders`
   - **Events:** ✓ INSERT only
   - **Type:** Supabase Edge Functions
   - **Function:** `order-notify`
   - **Method:** POST
   - **Query param:** `secret` = your WEBHOOK_SECRET

---

## Step 8 — Test end-to-end

Insert a test order from the Supabase SQL editor:

```sql
insert into public.orders (table_number, items, total, note)
values (
  42,
  '[{"menu_item_id":"00000000-0000-0000-0000-000000000001","name_en":"Smash Burger","name_tr":"Smash Burger","price":12.90,"qty":2}]',
  25.80,
  'Extra pickles please'
);
```

Expected result:
- A Telegram message appears in your staff group within a few seconds.
- Tapping **✓ Seen** or **🍽 Served** updates the order status and removes the buttons.
- Tapping **📋 Open** opens the `/admin/orders` page.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| No Telegram message | Supabase → Functions → `order-notify` → Logs |
| "Unauthorized" in logs | `WEBHOOK_SECRET` mismatch between secret set and URL param |
| Buttons do nothing | Check `telegram-callback` logs; verify `setWebhook` URL includes `?secret=` |
| `TELEGRAM_CHAT_ID` wrong | Use `getUpdates` after sending a message in the group — copy the negative chat ID |
| Function not deployed | Run `supabase functions deploy` again; check `supabase functions list` |
