-- Upperdeck Menu — owner-supplied real (POS) sales.
--
-- The menu is browse + call-waiter only: no checkout happens through it, so the
-- `orders` table holds intents, not money. The owner enters real sales here
-- (manually or via Excel import) so the analytics tab can compare actual revenue
-- against menu engagement.

-- ---------- sales_entries (one row per day) ----------
create table if not exists public.sales_entries (
  id          uuid          primary key default gen_random_uuid(),
  entry_date  date          not null unique,            -- one figure per day; re-import upserts
  total_sales numeric(12,2) not null check (total_sales >= 0),
  covers      int           check (covers is null or covers >= 0),
  source      text          not null default 'manual'
                            check (source in ('manual','excel')),
  created_by  uuid          references public.profiles(id) on delete set null,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create index if not exists sales_entries_date_idx on public.sales_entries (entry_date desc);

drop trigger if exists sales_entries_touch on public.sales_entries;
create trigger sales_entries_touch before update on public.sales_entries
  for each row execute function public.touch_updated_at();

-- ---------- sales_entry_items (optional per-item breakdown) ----------
create table if not exists public.sales_entry_items (
  id         uuid          primary key default gen_random_uuid(),
  entry_id   uuid          not null references public.sales_entries(id) on delete cascade,
  item_name  text          not null,
  qty        int           not null check (qty >= 0),
  revenue    numeric(12,2) check (revenue is null or revenue >= 0)
);

create index if not exists sales_entry_items_entry_idx on public.sales_entry_items (entry_id);

-- ---------- RLS (staff-only, writes go through server actions) ----------
alter table public.sales_entries      enable row level security;
alter table public.sales_entry_items  enable row level security;

drop policy if exists "sales_entries_staff_all" on public.sales_entries;
create policy "sales_entries_staff_all" on public.sales_entries
  for all using (public.current_role() in ('admin','owner'))
          with check (public.current_role() in ('admin','owner'));

drop policy if exists "sales_entry_items_staff_all" on public.sales_entry_items;
create policy "sales_entry_items_staff_all" on public.sales_entry_items
  for all using (public.current_role() in ('admin','owner'))
          with check (public.current_role() in ('admin','owner'));
