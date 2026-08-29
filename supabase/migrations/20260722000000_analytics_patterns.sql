-- Persisted "Kalıplar" (Patterns) sets for the analytics tab. Sibling to
-- analytics_insights, but each row stores the validated pattern OBJECTS (sentence
-- + kind + subjects + the supporting numbers), not just strings, so a reload can
-- redraw the cards without re-mining or re-billing the LLM judge. Access matches
-- the analytics tab gate (owner + dev).

create table if not exists public.analytics_patterns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  range_from date not null,
  range_to date not null,
  patterns jsonb not null, -- array of { id, kind, text, subjects[], metrics{}, strength }
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists analytics_patterns_range_idx
  on public.analytics_patterns (range_from, range_to, created_at desc);

alter table public.analytics_patterns enable row level security;

drop policy if exists "analytics_patterns_staff_all" on public.analytics_patterns;
create policy "analytics_patterns_staff_all" on public.analytics_patterns
  for all using (public.current_role() in ('owner','dev'))
          with check (public.current_role() in ('owner','dev'));
