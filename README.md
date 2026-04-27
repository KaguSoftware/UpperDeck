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
   In the Supabase SQL editor, run [`supabase/migrations/20260426000000_init.sql`](supabase/migrations/20260426000000_init.sql).
   It creates the `user_role` enum, `profiles` / `categories` / `menu_items` tables,
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

## Not yet built (ask before adding)

- Image upload to Supabase Storage (replace emoji with photos)
- Realtime subscriptions on the public menu
- Audit log / activity feed
- Playwright/Vitest test suites
- Public menu reading from Supabase (currently still uses
  [`src/data/menu.ts`](src/data/menu.ts) — wire to `menu_items` once you've
  populated the table via the admin)
