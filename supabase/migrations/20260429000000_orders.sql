-- Upperdeck Menu — orders table

-- ---------- orders ----------
create table if not exists public.orders (
  id           uuid        primary key default gen_random_uuid(),
  table_number int         not null check (table_number between 1 and 999),
  items        jsonb       not null,
  total        numeric(10,2) not null check (total >= 0),
  status       text        not null default 'new'
                           check (status in ('new','seen','preparing','served','cancelled')),
  note         text        not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  seen_at      timestamptz,
  served_at    timestamptz
);

create index if not exists orders_status_created_idx on public.orders (status, created_at desc);
create index if not exists orders_created_idx        on public.orders (created_at desc);

-- ---------- updated_at trigger (reuse existing function) ----------
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------- status timestamp trigger ----------
create or replace function public.touch_status_timestamps()
returns trigger language plpgsql as $$
begin
  if old.status = 'new' and new.status <> 'new' and new.seen_at is null then
    new.seen_at = now();
  end if;
  if new.status = 'served' and new.served_at is null then
    new.served_at = now();
  end if;
  return new;
end $$;

drop trigger if exists orders_status_timestamps on public.orders;
create trigger orders_status_timestamps before update on public.orders
  for each row execute function public.touch_status_timestamps();

-- ---------- RLS ----------
alter table public.orders enable row level security;

drop policy if exists "orders_public_insert" on public.orders;
create policy "orders_public_insert" on public.orders
  for insert with check (
    jsonb_array_length(items) > 0
    and total > 0
    and table_number between 1 and 999
  );

drop policy if exists "orders_staff_read" on public.orders;
create policy "orders_staff_read" on public.orders
  for select using (public.current_role() in ('admin','owner'));

drop policy if exists "orders_staff_update" on public.orders;
create policy "orders_staff_update" on public.orders
  for update using (public.current_role() in ('admin','owner'))
             with check (public.current_role() in ('admin','owner'));

-- ---------- realtime ----------
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;
