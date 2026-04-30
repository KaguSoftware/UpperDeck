# Upperdeck Menu

Public phone-style menu (Next.js 16 + React 19 + Tailwind v4) plus an admin panel
backed by Supabase. Two roles: `admin` (platform) and `owner` (restaurant).

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Create a Supabase project** (https://supabase.com/dashboard).
   Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (only required for `/admin/users`)

3. **Apply the schema**
   In the Supabase SQL editor, run the migrations **in order**:

   1. [`supabase/migrations/20260426000000_init.sql`](supabase/migrations/20260426000000_init.sql) —
      creates the `user_role` enum, `profiles` / `categories` / `menu_items` tables,
      row-level-security policies, an `updated_at` trigger, a new-user trigger that
      inserts a `profiles` row as `owner`, and seed categories.

4. **Create your first admin**
   - Sign up a user in Supabase Auth (or use the invite flow once seeded).
   - Promote them in the SQL editor:
     ```sql
     update public.profiles set role = 'admin' where id = '<that-user-uuid>';
     ```

5. **Run**
   ```bash
   npm run dev
   ```
   - Public menu: `/` (auto-redirects to `/en` or `/tr`)
   - Admin: `/admin` (will redirect to `/login`)

## Architecture

For the full map (routing, data flow, orders pipeline, conventions), see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Quick summary:

- `src/proxy.ts` (Next.js 16 file convention; replaced the old `middleware.ts`).
  Refreshes the Supabase session, gates `/admin/*`, and prepends locale for
  public routes.
- `src/app/(public)/[locale]/` — the diner phone-mockup, fully static.
- `src/app/(dashboard)/` — admin shell with its own root layout.
- `src/lib/supabase/{server,client,admin,proxy}.ts` — colocated client factories.
  `admin.ts` uses the service-role key and is `server-only`.
- `src/lib/auth/require-session.ts` — `requireRole()` for layout/server-action gating.
  RLS enforces the same rules at the database; the helper is for UX redirects.

## Roles

- **owner** (default for new signups): full CRUD on menu items + categories.
- **admin**: everything `owner` can do, plus `/admin/users` to invite new
  accounts and change roles.

## Smoke test checklist

Run these manually after deploying or after a fresh local setup:

- [ ] Sign up a test user via the Supabase dashboard (Authentication → Users → Invite)
- [ ] Promote them to admin in the SQL editor:

  ```sql
  update public.profiles set role = 'admin' where id = '<that-user-uuid>';
  ```

- [ ] Sign in at `/login`
- [ ] `/admin` shows three stat cards (categories, items, users)
- [ ] `/admin/categories`: create a new category, edit it, delete it
- [ ] `/admin/menu`: create a new item, toggle availability off, delete it
- [ ] `/admin/users` (admin only): invite a new user as "owner", change their role
- [ ] Visit `/en` and `/tr` — seeded items appear, your new item appears, items marked unavailable do not appear

## Reliability setup

### Keep Supabase warm (cron-job.org)

Supabase free-tier projects **pause after 7 days of inactivity**. A lightweight
health endpoint and a free cron job prevent this.

1. Sign up at **https://cron-job.org** (free, no credit card required).
2. Create a new job:
   - **URL:** `https://<your-deploy-url>/api/health`
   - **Method:** GET
   - **Schedule:** every 6 hours (four times a day is more than enough)
   - **Notifications:** enable *email on failure*
3. Save and enable the job.

Why this works: the `/api/health` route runs a lightweight `SELECT` against
Supabase on every ping, which counts as activity and resets the inactivity
clock. The email alert gives you a ≤6 h window to notice if the DB or the
deployment goes down before your first customer of the day does.

---

## Free-tier costs

| Service | Free tier limits | Notes |
|---|---|---|
| **Supabase** | 500 MB DB · 5 GB egress · 500 K Edge Function invocations/month · unlimited Realtime API requests (200 peak concurrent connections) | Sufficient for a single café indefinitely. Upgrade to Pro ($25/mo) only if you exceed egress or need daily backups. |
| **cron-job.org** | Free | No limits relevant to this use case. |
| **Telegram Bot API** | Free | No rate-limit concerns for a single café. |
| **Vercel Hobby** | Free | ⚠ Hobby is *non-commercial use only* per Vercel's ToS. For a paying café client choose one of: (a) **Vercel Pro** — $20/mo, removes the restriction; (b) **Cloudflare Pages** — free tier allows commercial use, Next.js supported via `@cloudflare/next-on-pages`. |

---

### Orders flow

- [ ] From a phone (not the admin), open `/?t=12` — cart shows table 12 locked with "from QR" badge
- [ ] Add 2 items, add a note, tap **Send Order**
- [ ] Confirm success toast appears and cart clears
- [ ] In another tab, `/admin/orders` shows the new order within 2 s (after clicking **Start shift** for audio)
- [ ] Sidebar pill shows **● Live**
- [ ] Telegram staff group receives the formatted message with inline buttons
- [ ] Tap **✓ Seen** in Telegram → order card status updates everywhere within a few seconds
- [ ] Tap **🍽 Served** → status updates, inline buttons are removed from the Telegram message
- [ ] In dev: check **DEV: simulate failure** in the cart drawer, tap **Send Order** → "Show this to a member of staff" fallback screen appears with a **Try again** button
- [ ] `GET /api/health` returns `{"ok":true,"db":"ok"}` with status 200

## Not yet built (ask before adding)

- Image upload to Supabase Storage (replace emoji with photos)
- Realtime subscriptions on the public menu
- Audit log / activity feed
- Playwright/Vitest test suites
