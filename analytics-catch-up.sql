-- ============================================================================
-- UpperDeck — analytics schema catch-up
--
-- Brings the database up to the current migration head. Covers the four
-- migrations that were never applied:
--
--   20260705000000_analytics_insights          (creates analytics_insights)
--   20260720000000_analytics_insights_owner_access
--   20260722000000_analytics_patterns          (creates analytics_patterns)
--   20260810000000_menu_item_cost              (adds menu_items.cost)
--   20260810000001_analytics_insights_compare_basis
--
-- Every statement is idempotent, so this is safe to run whole even if some of
-- the above were already applied, and safe to re-run if it fails part way.
-- Run it in one go in the Supabase SQL editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. analytics_insights — AI findings history.
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_insights (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  range_from date not null,
  range_to date not null,
  insights jsonb not null, -- array of strings
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists analytics_insights_created_at_idx
  on public.analytics_insights (created_at desc);

alter table public.analytics_insights enable row level security;

-- Owner + dev (the dev-only policy from the original migration is superseded).
drop policy if exists "analytics_insights_dev_all" on public.analytics_insights;
drop policy if exists "analytics_insights_staff_all" on public.analytics_insights;
create policy "analytics_insights_staff_all" on public.analytics_insights
  for all using (public.current_role() in ('owner','dev'))
          with check (public.current_role() in ('owner','dev'));

-- Which baseline a persisted finding set was generated against. Defaults to
-- 'prev' so any existing row keeps working — that was the only basis that
-- existed when those rows were written.
alter table public.analytics_insights
  add column if not exists compare_basis text not null default 'prev';

-- Added separately from the column so a re-run doesn't trip over the constraint
-- already existing (ADD CONSTRAINT has no IF NOT EXISTS in Postgres).
do $$
begin
  alter table public.analytics_insights
    add constraint analytics_insights_compare_basis_check
    check (compare_basis in ('prev', '4w', '52w'));
exception
  when duplicate_object then null;
end $$;

-- The lookup is (range, basis, newest first) — index it as such.
drop index if exists analytics_insights_range_idx;
create index if not exists analytics_insights_range_idx
  on public.analytics_insights (range_from, range_to, compare_basis, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. analytics_patterns — persisted "Kalıplar" sets.
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_patterns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  range_from date not null,
  range_to date not null,
  patterns jsonb not null, -- array of { id, kind, text, subjects[], metrics{}, strength }
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists analytics_patterns_range_idx
  on public.analytics_patterns (range_from, range_to, created_at desc);

alter table public.analytics_patterns enable row level security;

drop policy if exists "analytics_patterns_staff_all" on public.analytics_patterns;
create policy "analytics_patterns_staff_all" on public.analytics_patterns
  for all using (public.current_role() in ('owner','dev'))
          with check (public.current_role() in ('owner','dev'));

-- ---------------------------------------------------------------------------
-- 3. menu_items.cost — the maliyet field. THIS is the 500 on the menu form.
--
-- Nullable on purpose, and NULL is never coerced to 0: a missing cost means
-- "unknown", not "free". Treating it as 0 would report a 100% margin and rank
-- an un-costed item as the most profitable thing on the menu.
-- ---------------------------------------------------------------------------
alter table public.menu_items
  add column if not exists cost numeric(10,2);

do $$
begin
  alter table public.menu_items
    add constraint menu_items_cost_check check (cost is null or cost >= 0);
exception
  when duplicate_object then null;
end $$;

comment on column public.menu_items.cost is
  'Owner-entered unit food cost in TRY. NULL = not entered; margin math treats it as unknown, never as zero.';

-- ---------------------------------------------------------------------------
-- 4. Verify. Each row should report 'OK'.
-- ---------------------------------------------------------------------------
select
  'menu_items.cost'                as object,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'menu_items' and column_name = 'cost'
  ) then 'OK' else 'MISSING' end   as status
union all
select
  'analytics_insights',
  case when to_regclass('public.analytics_insights') is not null then 'OK' else 'MISSING' end
union all
select
  'analytics_insights.compare_basis',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_insights' and column_name = 'compare_basis'
  ) then 'OK' else 'MISSING' end
union all
select
  'analytics_patterns',
  case when to_regclass('public.analytics_patterns') is not null then 'OK' else 'MISSING' end;
