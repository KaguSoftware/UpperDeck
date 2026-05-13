-- When an addon option is selected, it can reveal additional addon groups.
-- Example: selecting "Upgrade to Meal" reveals a "Pick a Drink" group.

create table addon_option_reveals (
  addon_option_id uuid not null references addon_options(id) on delete cascade,
  addon_group_id  uuid not null references addon_groups(id)  on delete cascade,
  sort_order      integer not null default 0,
  primary key (addon_option_id, addon_group_id)
);

alter table addon_option_reveals enable row level security;

create policy "anon can read addon_option_reveals"
  on addon_option_reveals for select using (true);

create policy "authenticated can manage addon_option_reveals"
  on addon_option_reveals for all using (auth.role() = 'authenticated');
