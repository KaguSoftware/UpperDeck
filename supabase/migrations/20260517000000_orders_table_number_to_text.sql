-- Convert orders.table_number from int to text so we can use string IDs
-- like 'S1', 'T3', 'KAMARA 10'. "" represents an unknown/unscanned table.

-- Drop the dependent policy first; Postgres won't let us alter the column
-- type while a policy references it.
drop policy if exists "orders_public_insert" on public.orders;

alter table public.orders
  drop constraint if exists orders_table_number_check;

alter table public.orders
  alter column table_number type text using table_number::text;

alter table public.orders
  add constraint orders_table_number_check
  check (char_length(table_number) <= 50);

create policy "orders_public_insert" on public.orders
  for insert with check (
    jsonb_array_length(items) > 0
    and total > 0
    and char_length(table_number) <= 50
  );
