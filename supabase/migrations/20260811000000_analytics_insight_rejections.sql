-- Owner-curated "don't write findings like this" list.
--
-- The prompt in lib/analytics/insights.ts states the quality bar in the abstract
-- ("non-obvious", "attach the money"), and abstract rules are exactly what a model
-- talks itself past. This table holds the concrete counter-examples: findings the
-- owner looked at and rejected, fed back into every later generation as text NOT to
-- produce again. One row per rejected sentence.
--
-- Deliberately NOT keyed by date range, unlike analytics_insights. A rejection is a
-- judgement about the SHAPE of a sentence ("this restates the bestseller list"),
-- which does not stop being true when the owner switches to last month — so the
-- list applies to every range and every comparison basis.

create table public.analytics_insight_rejections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- The rejected sentence, verbatim as it was shown.
  text text not null,
  -- The dedupe key: `text` normalized (lowercased, punctuation and whitespace
  -- collapsed) by the caller, mirroring normalizeFinding() in lib/analytics/
  -- insights.ts. A real COLUMN rather than a unique index on an expression,
  -- because PostgREST's on_conflict only accepts column names — an upsert can't
  -- target `md5(text)`, so an expression index here would be unusable from the
  -- client and every re-rejection would come back as a duplicate-key error.
  text_key text not null,
  -- Optional owner note on WHY it was bad ("bunu zaten tablodan görüyorum").
  -- Reaches the model alongside the text, so the lesson generalises past the one
  -- sentence instead of the model merely avoiding that exact wording.
  reason text,
  created_by uuid references public.profiles(id) on delete set null
);

-- The same finding can be regenerated and re-rejected across ranges; keeping one
-- row per distinct sentence stops the negative-example block filling with copies.
create unique index analytics_insight_rejections_text_key_idx
  on public.analytics_insight_rejections (text_key);

create index analytics_insight_rejections_created_at_idx
  on public.analytics_insight_rejections (created_at desc);

alter table public.analytics_insight_rejections enable row level security;

-- Matches analytics_insights_staff_all: the analytics tab gates on ('owner','dev').
create policy "analytics_insight_rejections_staff_all" on public.analytics_insight_rejections
  for all using (public.current_role() in ('owner','dev'))
          with check (public.current_role() in ('owner','dev'));
