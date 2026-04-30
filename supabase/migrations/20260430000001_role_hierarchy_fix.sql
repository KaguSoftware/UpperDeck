-- Role hierarchy fix: owner > admin
-- owner = restaurant owner, full control (users, roles, everything)
-- admin = manager/head staff, manages menu/categories/settings/orders, cannot manage users
-- The enum values (admin, owner) are unchanged; only defaults and code gates change.

-- Ensure the enum type exists.
do $$ begin
  create type public.user_role as enum ('admin', 'owner');
exception when duplicate_object then null; end $$;

-- New users default to 'admin' (content manager), not 'owner'.
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
  ) then
    alter table public.profiles add column role public.user_role not null default 'admin';
  else
    alter table public.profiles alter column role set default 'admin';
  end if;
end $$;

-- Update the new-user trigger to match.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'admin'
  );
  return new;
end $$;
