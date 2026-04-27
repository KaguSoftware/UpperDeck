alter table public.menu_items
  add column if not exists highlight text check (highlight in ('green-fill', 'orange-fill')) default null;
