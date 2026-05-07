-- Allow addon_options to reference a menu_item for image/emoji display
alter table public.addon_options
  add column if not exists menu_item_id uuid references public.menu_items(id) on delete set null;

create index if not exists addon_options_item_idx on public.addon_options (menu_item_id);
