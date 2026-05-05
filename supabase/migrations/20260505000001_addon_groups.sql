-- addon_groups: can belong to either a category OR a menu_item (not both)
create table if not exists public.addon_groups (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references public.categories(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete cascade,
  label_en     text not null,
  label_tr     text not null,
  multi        boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint addon_groups_one_owner check (
    (category_id is not null)::int + (menu_item_id is not null)::int = 1
  )
);
create index if not exists addon_groups_category_idx on public.addon_groups (category_id);
create index if not exists addon_groups_item_idx     on public.addon_groups (menu_item_id);
drop trigger if exists addon_groups_touch on public.addon_groups;
create trigger addon_groups_touch before update on public.addon_groups
  for each row execute function public.touch_updated_at();
alter table public.addon_groups enable row level security;
drop policy if exists "public read addon_groups"  on public.addon_groups;
create policy "public read addon_groups"  on public.addon_groups for select using (true);
drop policy if exists "staff write addon_groups" on public.addon_groups;
create policy "staff write addon_groups" on public.addon_groups
  for all using (public.current_role() in ('admin','owner'))
         with check (public.current_role() in ('admin','owner'));

-- addon_options: belongs to one addon_group
create table if not exists public.addon_options (
  id             uuid primary key default gen_random_uuid(),
  addon_group_id uuid not null references public.addon_groups(id) on delete cascade,
  label_en       text not null,
  label_tr       text not null,
  price          numeric(10,2) not null default 0 check (price >= 0),
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists addon_options_group_idx on public.addon_options (addon_group_id);
drop trigger if exists addon_options_touch on public.addon_options;
create trigger addon_options_touch before update on public.addon_options
  for each row execute function public.touch_updated_at();
alter table public.addon_options enable row level security;
drop policy if exists "public read addon_options"  on public.addon_options;
create policy "public read addon_options"  on public.addon_options for select using (true);
drop policy if exists "staff write addon_options" on public.addon_options;
create policy "staff write addon_options" on public.addon_options
  for all using (public.current_role() in ('admin','owner'))
         with check (public.current_role() in ('admin','owner'));
