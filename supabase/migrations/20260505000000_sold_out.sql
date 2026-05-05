alter table public.menu_items
  add column if not exists sold_out boolean not null default false;
