-- Unit cost (maliyet) per menu item — the second axis of menu engineering.
--
-- Until now every analytics figure was a REVENUE figure: the system could rank
-- items by popularity with real precision but had nothing to say about which of
-- them actually make money. One column changes that: with a cost per item, the
-- popularity axis gains a margin axis and every item lands in a quadrant of the
-- standard menu-engineering matrix (star / plowhorse / puzzle / dog), which is
-- the framework restaurant owners already think in.
--
-- Deliberately NULLABLE, and NULL is never coerced to 0. A missing cost means
-- "unknown", not "free": treating it as 0 would report a 100% margin and rank an
-- un-costed item as the most profitable thing on the menu. Items without a cost
-- are simply left out of every margin calculation, and the analytics tab reports
-- how much of its revenue the matrix can actually speak for.
alter table public.menu_items
  add column if not exists cost numeric(10,2) check (cost is null or cost >= 0);

comment on column public.menu_items.cost is
  'Owner-entered unit food cost in TRY. NULL = not entered; margin math treats it as unknown, never as zero.';
