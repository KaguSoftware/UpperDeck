-- Upperdeck Menu — initial schema
-- Two app roles: 'admin' (platform) and 'owner' (restaurant operator).
-- Both can manage menu content. Admin additionally manages user roles.

-- ---------- extensions ----------
create extension if not exists "pgcrypto";

-- ---------- enums ----------
do $$ begin
  create type public.user_role as enum ('admin', 'owner');
exception when duplicate_object then null; end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'owner',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- categories ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_tr text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists categories_sort_idx on public.categories (sort_order);

-- ---------- menu_items ----------
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name_en text not null,
  name_tr text not null,
  desc_en text not null default '',
  desc_tr text not null default '',
  emoji text not null default '🍽️',
  price numeric(10,2) not null check (price >= 0),
  spicy boolean not null default false,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists menu_items_category_idx on public.menu_items (category_id);
create index if not exists menu_items_available_idx on public.menu_items (is_available) where is_available;

-- ---------- updated_at trigger ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

drop trigger if exists menu_items_touch on public.menu_items;
create trigger menu_items_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();

-- ---------- new-user trigger: create profile as 'owner' by default ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- helper: current user's role ----------
create or replace function public.current_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------- RLS ----------
alter table public.profiles    enable row level security;
alter table public.categories  enable row level security;
alter table public.menu_items  enable row level security;

-- profiles: a user reads their own row; admins read/update all
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles
  for select using (auth.uid() = id or public.current_role() = 'admin');

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- categories: public can read; admin/owner can write
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read" on public.categories
  for select using (true);

drop policy if exists "categories_staff_write" on public.categories;
create policy "categories_staff_write" on public.categories
  for all using (public.current_role() in ('admin','owner'))
         with check (public.current_role() in ('admin','owner'));

-- menu_items: public reads available items; staff sees and writes everything
drop policy if exists "menu_items_public_read" on public.menu_items;
create policy "menu_items_public_read" on public.menu_items
  for select using (is_available or public.current_role() in ('admin','owner'));

drop policy if exists "menu_items_staff_write" on public.menu_items;
create policy "menu_items_staff_write" on public.menu_items
  for all using (public.current_role() in ('admin','owner'))
         with check (public.current_role() in ('admin','owner'));

-- ---------- seed: initial categories matching the prototype menu ----------
insert into public.categories (slug, name_en, name_tr, sort_order) values
  ('breakfast',    'Breakfast',    'Kahvaltı',         10),
  ('chicken',      'Chicken',      'Tavuk',            20),
  ('burger',       'Burger',       'Burger',           30),
  ('dog-bun',      'Dog-Bun',      'Sosisli',          40),
  ('veggy',        'Veggy',        'Vejetaryen',       50),
  ('shared',       'Shared',       'Paylaşımlık',      60),
  ('french-toast', 'French Toast', 'French Toast',     70),
  ('waffles',      'Waffles',      'Waffle',           80),
  ('pancakes',     'Pancakes',     'Pankek',           90),
  ('mocktails',    'Mocktails',    'Mocktail',        100),
  ('milkshakes',   'Milkshakes',   'Milkshake',       110),
  ('hot-drinks',   'Hot Drinks',   'Sıcak İçecekler', 120),
  ('cold-drinks',  'Cold Drinks',  'Soğuk İçecekler', 130)
on conflict (slug) do nothing;
