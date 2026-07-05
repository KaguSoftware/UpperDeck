-- AI insights history for the analytics tab. Each row is one generated set of
-- insights for a date range, so later generations can reference what was
-- advised before ("garlic items were flagged last week — still not selling").
-- Access is dev-only, matching the analytics tab gate.

create table public.analytics_insights (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  range_from date not null,
  range_to date not null,
  insights jsonb not null, -- array of strings
  created_by uuid references public.profiles(id) on delete set null
);

create index analytics_insights_created_at_idx
  on public.analytics_insights (created_at desc);

alter table public.analytics_insights enable row level security;

create policy "analytics_insights_dev_all" on public.analytics_insights
  for all using (public.current_role() = 'dev')
          with check (public.current_role() = 'dev');
