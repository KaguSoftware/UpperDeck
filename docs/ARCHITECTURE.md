# Upperdeck Menu — Architecture

This document is the high-level map of the application: what each piece does,
how data flows, and where to look when you need to change something. Pair it
with the [README](../README.md) for setup and operations.

---

## 1. What this app is

Two surfaces backed by one Supabase project:

- **Public phone menu** at `/[locale]` — diners scan a QR (`/?t=12`), browse
  the menu, add to cart, send the order. Optionally call a waiter / ask for
  the bill.
- **Admin dashboard** at `/admin` — staff manage categories, menu items, the
  hero banner, users, and watch incoming orders in real time.

Stack: Next.js 16 (app router) · React 19 · Tailwind v4 · Supabase
(Postgres + Auth + Realtime + Storage + Edge Functions) · Telegram Bot API
for staff notifications.

> **Note:** Next.js 16 has breaking changes from earlier versions. The most
> visible one in this repo is the `proxy.ts` convention replacing
> `middleware.ts`. See [`AGENTS.md`](../AGENTS.md).

---

## 2. Top-level layout

```text
src/
  app/
    (public)/[locale]/        Diner-facing menu (server-rendered shell + client orchestrator)
    (dashboard)/
      admin/                  Admin pages, server actions, real-time orders board
      login/                  Email-password sign-in
      logout/route.ts
    api/
      health/                 Liveness probe (used by cron-job.org keep-alive)
      diag/                   Diagnostics
      orders/                 (reserved)
      telegram/
        webhook/              Inbound: status-button taps from staff
        register/             One-shot helper to register the webhook URL
  components/                 UI components (each: components.tsx, types.ts, constants.ts)
  lib/
    auth/require-session.ts   Page/action gate — redirects on miss
    env.ts                    Zod-validated env loader
    supabase/                 Four client factories, see §5
    menu/queries.ts           Public menu + hero settings reads
    orders/submit.ts          Public order submission (server action)
    waiter/call.ts            Waiter / bill Telegram pings
    telegram.ts               Outbound Telegram message helper
    rng.ts                    Deterministic per-item visual jitter (seeded RNG)
  i18n/                       en / tr message bundles + locale config
  types/database.ts           Generated Supabase types + hand-written Order/Role types
  proxy.ts                    Next.js 16 proxy (replaces middleware.ts)

supabase/
  migrations/                 SQL migrations, applied in order
  functions/
    order-notify/             Triggered on INSERT into orders → posts Telegram message
    telegram-callback/        Receives staff button taps → updates order status

scripts/
  generate-table-qrs.mjs      Generates printable QR codes for tables
  _check-policies.mjs         Sanity-checks RLS policies
```

---

## 3. Routing & request lifecycle

### `src/proxy.ts` — runs on every request

1. Calls `refreshSession()` (which reads/writes auth cookies).
2. If the path is under `/admin/*` and there is no user → redirect to `/login?next=...`.
3. If the path is `/admin`, `/login`, `/logout`, `/auth`, `/api` → pass through.
4. Otherwise (public menu paths) → if no `/en` or `/tr` prefix, prepend the
   locale detected from `Accept-Language` (default `en`).

This is the only place auth gating + locale handling happens at the request
layer. Everything else relies on RLS or per-page `requireRole()` calls.

### Public menu — `app/(public)/[locale]/page.tsx`

- Server component: reads `?t=<table>` from the URL, calls `getPublicMenu(locale)`
  and `getHeroSettings()`, passes everything as props to the **`PhoneMenu`** client
  component.
- `PhoneMenu` is the orchestrator: holds cart state, hydrates from
  `sessionStorage`, wires every child component (TopBar, Hero, FilterPills,
  MenuStage, ItemModal, CartDrawer, WaiterButton, Toast, Ticker), and calls
  `submitOrder(...)` on checkout.

### Admin — `app/(dashboard)/admin/*`

- Layout (`admin/layout.tsx`) gates the whole tree with `requireRole(...)`.
- Each feature folder follows the same shape:
  - `page.tsx` — server component, fetches data
  - `_form.tsx` / `_list.tsx` — client components
  - `actions.ts` — `"use server"` mutations (parse → auth → DB → revalidate → redirect)
  - `[id]/edit/`, `new/` — CRUD sub-routes
- The orders page is the one exception: it has only `_client.tsx`, because
  it's almost entirely real-time UI (see §6).

---

## 4. Data model (Supabase)

Tables (see `supabase/migrations/` for authoritative DDL):

| Table          | Purpose                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `profiles`     | One row per auth user. Holds `role` (`admin` \| `owner`).              |
| `categories`   | Hierarchical (`parent_id`). Has `slug`, bilingual names, `sort_order`. |
| `menu_items`   | Belongs to a category. Bilingual name/hook/desc, price, image, flags.  |
| `orders`       | `table_number`, JSONB `items[]`, `note`, `total`, `status`.            |
| `settings`     | Key/value store for hero config (`hero_mode`, `featured_*`, etc.).     |

**Roles** (`user_role` enum):

- `owner` — default for new sign-ups. Full CRUD on categories + menu items.
- `admin` — everything `owner` can do, plus user management at `/admin/users`.

**RLS** is the source of truth. Server actions also call `requireRole()` for
better UX (redirect instead of 403), but never as the only gate.

**Order status** flow: `new` → `seen` → `preparing` → `served` (or `cancelled`
at any time). Status can be changed from the admin orders board *or* by tapping
inline buttons in the Telegram staff chat.

---

## 5. Supabase clients (`src/lib/supabase/`)

Four files, four distinct purposes — **don't merge them**:

| File         | Runs in            | Auth                         | Use for                                              |
| ------------ | ------------------ | ---------------------------- | ---------------------------------------------------- |
| `client.ts`  | Browser            | Anon key, cached singleton   | Realtime subscriptions, storage uploads from forms   |
| `server.ts`  | Server components / actions | Anon key + user cookies | RLS-respecting reads & writes on behalf of the user  |
| `proxy.ts`   | `proxy.ts` only    | Anon key + request cookies   | Session refresh during request lifecycle             |
| `admin.ts`   | Server only (`server-only`) | Service role key       | Operations that bypass RLS: user invites, public order inserts |

If you find yourself needing a fifth, you probably need a different abstraction
(an RPC, an Edge Function, or a server action) instead.

---

## 6. The orders pipeline (most moving parts)

This is the hottest path; understand it end-to-end before changing anything.

```
Diner submits order
  ↓
PhoneMenu.doSubmit()  →  submitOrder() (server action)
                          ├─ Zod validate payload
                          ├─ Recompute total server-side (authoritative)
                          ├─ getAdminClient().from("orders").insert(...)   ← bypasses RLS
                          └─ sendTelegramMessage(...) (best-effort)
  ↓
Postgres trigger fires order-notify Edge Function
  ↓
Edge Function posts a richer Telegram message with inline action buttons
  ↓
Staff taps a button (e.g. "✓ Seen")
  ↓
Telegram → telegram-callback Edge Function
  ↓
Edge Function updates orders.status
  ↓
Supabase Realtime broadcasts the UPDATE
  ↓
admin/orders/_client.tsx receives it and re-renders the order card
```

The orders board (`_client.tsx`) also:

- Auto-reconnects every 5 s on Realtime disconnect.
- Tracks staleness: any `new` order older than 90 s is highlighted and
  triggers a repeating audio alarm every 30 s until it's acknowledged.
- Requires a one-time **Start shift** click to arm audio (browser autoplay policy).
- Shows the unread count in the document title.

---

## 7. Hero / featured-item system

The public menu's top banner is configurable from `/admin/settings`. Three modes:

- **none** — default text banner.
- **media** — uploaded image or video shown above the menu.
- **featured** — pick a menu item; its photo, a marquee sentence, and an
  optional badge appear in the hero, and tapping it scrolls to the item.

Storage:

- Settings live in the `settings` key/value table.
- Uploaded media goes to the `menu-images` Storage bucket.
- The hero settings are loaded server-side by `getHeroSettings()` and passed
  through the public layout to `PhoneMenu`.

---

## 8. i18n

- Config: `src/i18n/config.ts` — `locales = ["en", "tr"]`, `defaultLocale = "en"`.
- Bundles: `src/i18n/en.ts`, `src/i18n/tr.ts` — typed via the `Messages` type.
- Locale prepended to URL by `proxy.ts`. Pages read `params.locale` and pass
  the matching bundle to `PhoneMenu`.
- Database has parallel `_en` / `_tr` columns for category / item names,
  hooks, descriptions. The query layer picks the right column per locale.

---

## 9. Environment & secrets

`src/lib/env.ts` validates `process.env` with Zod at module load.

| Variable                                | Required | Used by                                     |
| --------------------------------------- | -------- | ------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`              | always   | All Supabase clients                        |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | always   | Browser/server clients (anon-equivalent)    |
| `SUPABASE_SERVICE_ROLE_KEY`             | optional | `getAdminClient()` — order inserts, invites |
| `TELEGRAM_BOT_TOKEN`                    | optional | `sendTelegramMessage()`                     |
| `TELEGRAM_CHAT_ID`                      | optional | `sendTelegramMessage()`                     |

Telegram-related vars are optional: when missing, `sendTelegramMessage()`
warns and no-ops, so order submission still succeeds.

During `next build`, missing vars produce a warning instead of throwing —
this lets the build succeed in CI environments that don't expose runtime
secrets at build time.

---

## 10. Conventions worth knowing

- **Server actions** all follow `parse → requireRole → mutate → revalidate → redirect`.
  When adding a new admin mutation, mirror the existing `actions.ts` files.
- **Components** are foldered: `components.tsx`, `types.ts`, `constants.ts`.
  Keep types and tunable constants out of the JSX file.
- **Logging**: use `console.warn` / `console.error` with a bracketed prefix
  (`[submitOrder]`, `[telegram]`). These are intentional structured logs, not
  debug noise — leave them in.
- **Eslint-disable** comments are mostly for `@next/next/no-img-element`
  (we deliberately use `<img>` for Supabase Storage URLs) and
  `react-hooks/exhaustive-deps` where we want one-shot effects. Keep them
  scoped to a single line.
- **Styling**: Tailwind v4 utility classes, with brand tokens (`bg-green`,
  `bg-bg`, `text-orange`, etc.) defined globally. No CSS modules.

---

## 11. Where to look when…

| Want to change…                          | Look at                                              |
| ---------------------------------------- | ---------------------------------------------------- |
| What the diner sees                      | `components/PhoneMenu/components.tsx` (orchestrator) |
| Cart/checkout behavior                   | `PhoneMenu` + `components/CartDrawer/`               |
| Order validation / what hits the DB      | `lib/orders/submit.ts`                               |
| What staff sees in real time             | `app/(dashboard)/admin/orders/_client.tsx`           |
| Telegram message text                    | `lib/orders/submit.ts` and `supabase/functions/order-notify/` |
| Telegram button → status update          | `supabase/functions/telegram-callback/`              |
| Admin auth gate                          | `app/(dashboard)/admin/layout.tsx` + `lib/auth/require-session.ts` |
| Locale routing                           | `src/proxy.ts`                                       |
| Hero banner modes                        | `app/(dashboard)/admin/settings/_hero-constructor.tsx` + `lib/menu/queries.ts:getHeroSettings` |
| DB schema                                | `supabase/migrations/*.sql` (apply in filename order) |

---

## 12. Things deliberately *not* abstracted

So future you doesn't try to "clean these up":

- **Four Supabase clients.** Each has a different auth context. Merging them
  loses type safety and the `server-only` guarantee on `admin.ts`.
- **Per-feature `actions.ts` files.** They look similar but the schemas, side
  effects, and revalidation paths differ enough that a generic factory would
  obscure more than it saves.
- **`PhoneMenu`'s ~15 useState hooks.** They're all UI state for one screen.
  Splitting into reducers or contexts would add ceremony without simplifying
  the data flow, which is already linear.
