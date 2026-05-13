-- Replace the single menu_item_id on addon_groups with a join table
-- so one addon group can target multiple items.

-- 1. Create the join table
create table addon_group_items (
  addon_group_id uuid not null references addon_groups(id) on delete cascade,
  menu_item_id   uuid not null references menu_items(id)   on delete cascade,
  primary key (addon_group_id, menu_item_id)
);

-- 2. Migrate existing single-item links into the join table
insert into addon_group_items (addon_group_id, menu_item_id)
select id, menu_item_id
from addon_groups
where menu_item_id is not null;

-- 3. Drop the old XOR check constraint and the menu_item_id column
alter table addon_groups drop constraint if exists addon_groups_one_owner;
alter table addon_groups drop column if exists menu_item_id;

-- 4. RLS: allow authenticated users to read/write join table (mirrors addon_groups policy)
alter table addon_group_items enable row level security;

create policy "anon can read addon_group_items"
  on addon_group_items for select using (true);

create policy "authenticated can manage addon_group_items"
  on addon_group_items for all using (auth.role() = 'authenticated');
