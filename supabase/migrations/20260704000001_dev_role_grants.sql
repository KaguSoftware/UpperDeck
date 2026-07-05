-- Grant the 'dev' role to the two developer accounts, and extend every
-- role-gated RLS policy so 'dev' has owner-level power everywhere.
--
-- 'dev' is added to every check that previously read ('admin','owner'), and
-- to the owner-privileged profiles policies, so a dev can do everything an
-- owner can. The Analytics-tab restriction lives in the app layer only
-- (nav visibility + requireRole("dev") on the analytics routes); there is no
-- dedicated analytics table to gate here.

-- ---------- assign the role ----------
update public.profiles p
set role = 'dev'
from auth.users u
where u.id = p.id
  and lower(u.email) in ('majedahdab.kagu@gmail.com', 'parsaa.mansourii@gmail.com');

-- ---------- profiles: dev reads/updates all profiles (owner-level) ----------
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles
  for select using (
    auth.uid() = id or public.current_role() in ('admin','dev')
  );

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.current_role() in ('admin','dev'))
             with check (public.current_role() in ('admin','dev'));

-- ---------- categories ----------
drop policy if exists "categories_staff_write" on public.categories;
create policy "categories_staff_write" on public.categories
  for all using (public.current_role() in ('admin','owner','dev'))
         with check (public.current_role() in ('admin','owner','dev'));

-- ---------- menu_items ----------
drop policy if exists "menu_items_public_read" on public.menu_items;
create policy "menu_items_public_read" on public.menu_items
  for select using (is_available or public.current_role() in ('admin','owner','dev'));

drop policy if exists "menu_items_staff_write" on public.menu_items;
create policy "menu_items_staff_write" on public.menu_items
  for all using (public.current_role() in ('admin','owner','dev'))
         with check (public.current_role() in ('admin','owner','dev'));

-- ---------- orders ----------
drop policy if exists "orders_staff_read" on public.orders;
create policy "orders_staff_read" on public.orders
  for select using (public.current_role() in ('admin','owner','dev'));

drop policy if exists "orders_staff_update" on public.orders;
create policy "orders_staff_update" on public.orders
  for update using (public.current_role() in ('admin','owner','dev'))
             with check (public.current_role() in ('admin','owner','dev'));

-- ---------- sales_entries / sales_entry_items ----------
drop policy if exists "sales_entries_staff_all" on public.sales_entries;
create policy "sales_entries_staff_all" on public.sales_entries
  for all using (public.current_role() in ('admin','owner','dev'))
          with check (public.current_role() in ('admin','owner','dev'));

drop policy if exists "sales_entry_items_staff_all" on public.sales_entry_items;
create policy "sales_entry_items_staff_all" on public.sales_entry_items
  for all using (public.current_role() in ('admin','owner','dev'))
          with check (public.current_role() in ('admin','owner','dev'));

-- ---------- addon_groups / addon_options ----------
drop policy if exists "staff write addon_groups" on public.addon_groups;
create policy "staff write addon_groups" on public.addon_groups
  for all using (public.current_role() in ('admin','owner','dev'))
         with check (public.current_role() in ('admin','owner','dev'));

drop policy if exists "staff write addon_options" on public.addon_options;
create policy "staff write addon_options" on public.addon_options
  for all using (public.current_role() in ('admin','owner','dev'))
         with check (public.current_role() in ('admin','owner','dev'));

-- ---------- suggested_groups / suggested_items ----------
drop policy if exists "staff write suggested_groups" on public.suggested_groups;
create policy "staff write suggested_groups" on public.suggested_groups
  for all using (public.current_role() in ('admin','owner','dev'))
         with check (public.current_role() in ('admin','owner','dev'));

drop policy if exists "staff write suggested_items" on public.suggested_items;
create policy "staff write suggested_items" on public.suggested_items
  for all using (public.current_role() in ('admin','owner','dev'))
         with check (public.current_role() in ('admin','owner','dev'));

-- ---------- storage: menu images ----------
drop policy if exists "menu_images_staff_write" on storage.objects;
create policy "menu_images_staff_write" on storage.objects
  for all using (
    bucket_id = 'menu-images'
    and public.current_role() in ('admin','owner','dev')
  )
  with check (
    bucket_id = 'menu-images'
    and public.current_role() in ('admin','owner','dev')
  );
