-- suggested_groups: can belong to either a category OR a menu_item (not both)
create table if not exists public.suggested_groups (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references public.categories(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete cascade,
  label_en     text not null,
  label_tr     text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint suggested_groups_one_owner check (
    (category_id is not null)::int + (menu_item_id is not null)::int = 1
  )
);
create index if not exists suggested_groups_category_idx on public.suggested_groups (category_id);
create index if not exists suggested_groups_item_idx     on public.suggested_groups (menu_item_id);
drop trigger if exists suggested_groups_touch on public.suggested_groups;
create trigger suggested_groups_touch before update on public.suggested_groups
  for each row execute function public.touch_updated_at();
alter table public.suggested_groups enable row level security;
drop policy if exists "public read suggested_groups"  on public.suggested_groups;
create policy "public read suggested_groups"  on public.suggested_groups for select using (true);
drop policy if exists "staff write suggested_groups" on public.suggested_groups;
create policy "staff write suggested_groups" on public.suggested_groups
  for all using (public.current_role() in ('admin','owner'))
         with check (public.current_role() in ('admin','owner'));

-- suggested_items: belongs to one suggested_group, references a menu_item
create table if not exists public.suggested_items (
  id                  uuid primary key default gen_random_uuid(),
  suggested_group_id  uuid not null references public.suggested_groups(id) on delete cascade,
  menu_item_id        uuid not null references public.menu_items(id) on delete cascade,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists suggested_items_group_idx on public.suggested_items (suggested_group_id);
drop trigger if exists suggested_items_touch on public.suggested_items;
create trigger suggested_items_touch before update on public.suggested_items
  for each row execute function public.touch_updated_at();
alter table public.suggested_items enable row level security;
drop policy if exists "public read suggested_items"  on public.suggested_items;
create policy "public read suggested_items"  on public.suggested_items for select using (true);
drop policy if exists "staff write suggested_items" on public.suggested_items;
create policy "staff write suggested_items" on public.suggested_items
  for all using (public.current_role() in ('admin','owner'))
         with check (public.current_role() in ('admin','owner'));
