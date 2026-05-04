# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # dev server at localhost:3000
npm run build    # production build
npm start        # serve production build
```

No lint, test, or format scripts exist yet.

## Architecture

Restaurant QR-code ordering system with two surfaces backed by one Supabase project:

- **Public phone menu** — `/[locale]` — diners scan QR (`?t=<table>`), browse, order, call waiter
- **Admin dashboard** — `/admin` — staff manage menu, categories, hero, users, orders in real time

### Request lifecycle

`src/proxy.ts` (Next.js 16 — replaces `middleware.ts`) runs on every request:
1. Refreshes the Supabase session cookie
2. Redirects unauthenticated requests to `/admin/*` → `/login`
3. Prepends locale prefix (`/en` or `/tr`) to public menu paths if absent

### Public menu

`app/(public)/[locale]/page.tsx` is a server component that fetches menu data and passes it to `PhoneMenu` (client, `components/PhoneMenu/`). `PhoneMenu` is the orchestrator: holds all cart/UI state and wires every child component. Order submission goes through `lib/orders/submit.ts` (server action).

### Admin

`app/(dashboard)/admin/layout.tsx` gates the whole tree via `requireRole()`. Each feature folder follows a consistent shape:

- `page.tsx` — server component, fetches initial data
- `_form.tsx` / `_list.tsx` — client components
- `actions.ts` — `"use server"` mutations following the pattern: **parse → requireRole → mutate → revalidate → redirect**

The orders page is a special case (`_client.tsx` only) — it's driven by Supabase Realtime.

### Orders pipeline

```
Diner submits → submitOrder() server action (Zod validate → admin client insert → Telegram ping)
  → Postgres trigger fires order-notify Edge Function → Telegram message with inline buttons
  → Staff taps button → telegram-callback Edge Function → updates orders.status
  → Supabase Realtime broadcasts → admin orders board re-renders
```

The orders board auto-reconnects on Realtime drop, highlights stale `new` orders (>90 s), and plays an audio alarm every 30 s until acknowledged. Requires one-time "Start shift" click to arm audio (browser autoplay policy).

### Supabase clients (`src/lib/supabase/`)

Four distinct clients — do not merge them:

| File | Context | Auth | Use for |
|------|---------|------|---------|
| `client.ts` | Browser | Anon key | Realtime, storage uploads |
| `server.ts` | Server components/actions | Anon + user cookies | RLS-respecting reads/writes |
| `proxy.ts` | `proxy.ts` only | Anon + request cookies | Session refresh |
| `admin.ts` | Server only (`server-only`) | Service role | Bypass RLS: order inserts, user invites |

### Data model

| Table | Purpose |
|-------|---------|
| `profiles` | One row per auth user; holds `role` (`owner` \| `admin`) |
| `categories` | Hierarchical (`parent_id`), bilingual names, `sort_order` |
| `menu_items` | Bilingual name/hook/desc, price, image, flags |
| `orders` | `table_number`, JSONB `items[]`, `note`, `total`, `status` |
| `settings` | Key/value store for hero config |

Order status flow: `new` → `seen` → `preparing` → `served` (or `cancelled` at any time).

Roles: `owner` (default, CRUD on menu) and `admin` (owner + user management).

**RLS is the authoritative gate.** `requireRole()` calls are for better UX (redirect vs. 403), never the only gate.

### i18n

Locales `en` / `tr` in `src/i18n/`. Locale is prepended by `proxy.ts`. DB has parallel `_en` / `_tr` columns. Pages read `params.locale` and pass the matching bundle to `PhoneMenu`.

### Environment variables

Validated at module load by `src/lib/env.ts` (Zod). Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Optional: `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Missing Telegram vars make `sendTelegramMessage()` no-op; order submission still succeeds.

### Conventions

- **Components** are foldered: `components.tsx`, `types.ts`, `constants.ts`. Keep types and constants out of JSX.
- **Logging**: `console.warn` / `console.error` with bracketed prefix (e.g., `[submitOrder]`). Leave them in — they are intentional structured logs.
- **Styling**: Tailwind v4 utility classes with brand tokens (`bg-green`, `bg-bg`, `text-orange`). No CSS modules.
- **`<img>` over `<Image>`**: deliberate for Supabase Storage URLs. `eslint-disable` comments for `@next/next/no-img-element` are intentional.
- **Four Supabase clients, per-feature `actions.ts`, and `PhoneMenu`'s ~15 useState hooks** are all deliberately not abstracted — see `docs/ARCHITECTURE.md §12`.

### Where to look

| Goal | Location |
|------|----------|
| Diner-facing UI | `components/PhoneMenu/components.tsx` |
| Order validation | `lib/orders/submit.ts` |
| Real-time orders board | `app/(dashboard)/admin/orders/_client.tsx` |
| Telegram message text | `lib/orders/submit.ts` + `supabase/functions/order-notify/` |
| Telegram button → status | `supabase/functions/telegram-callback/` |
| Auth gate | `app/(dashboard)/admin/layout.tsx` + `lib/auth/require-session.ts` |
| Locale routing | `src/proxy.ts` |
| Hero banner | `app/(dashboard)/admin/settings/_hero-constructor.tsx` + `lib/menu/queries.ts` |
| DB schema | `supabase/migrations/*.sql` (apply in filename order) |
