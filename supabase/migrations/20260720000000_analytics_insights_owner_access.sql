-- Give the 'owner' role access to the Analytics tab.
--
-- The analytics routes previously gated on requireRole("dev"); they now allow
-- ('owner','dev') in the app layer. The only analytics-specific table with a
-- dev-only RLS policy is analytics_insights (AI insights history), so extend it
-- to owners as well — otherwise insight generation (insert) and the history
-- list (select) would silently fail for owners under RLS.
--
-- sales_entries / sales_entry_items already allow ('admin','owner','dev'), so
-- the real-sales sub-page needs no change here.

drop policy if exists "analytics_insights_dev_all" on public.analytics_insights;
create policy "analytics_insights_staff_all" on public.analytics_insights
  for all using (public.current_role() in ('owner','dev'))
          with check (public.current_role() in ('owner','dev'));
