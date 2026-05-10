alter table public.addon_groups
  add column if not exists required boolean not null default false;
