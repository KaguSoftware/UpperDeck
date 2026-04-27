-- Replace emoji text field with image_url for menu items

alter table public.menu_items
  add column if not exists image_url text;

-- Copy existing emoji into image_url as null (images will be uploaded fresh)
-- Drop the emoji column
alter table public.menu_items
  drop column if exists emoji;

-- Storage bucket for menu item images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Public read policy
drop policy if exists "menu_images_public_read" on storage.objects;
create policy "menu_images_public_read" on storage.objects
  for select using (bucket_id = 'menu-images');

-- Authenticated staff can upload/replace/delete
drop policy if exists "menu_images_staff_write" on storage.objects;
create policy "menu_images_staff_write" on storage.objects
  for all using (
    bucket_id = 'menu-images'
    and public.current_role() in ('admin', 'owner')
  )
  with check (
    bucket_id = 'menu-images'
    and public.current_role() in ('admin', 'owner')
  );
