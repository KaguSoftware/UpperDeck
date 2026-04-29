-- Allow table_number = 0 to represent "unknown / not scanned from QR".
-- Previously the CHECK constraint and INSERT policy required 1..999, which made
-- the order submission fail when the customer hadn't scanned a table QR.

alter table public.orders
  drop constraint if exists orders_table_number_check;

alter table public.orders
  add constraint orders_table_number_check
  check (table_number between 0 and 999);

drop policy if exists "orders_public_insert" on public.orders;
create policy "orders_public_insert" on public.orders
  for insert with check (
    jsonb_array_length(items) > 0
    and total > 0
    and table_number between 0 and 999
  );
