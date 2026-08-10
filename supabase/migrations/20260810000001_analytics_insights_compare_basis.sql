-- Which baseline a persisted finding set was generated against.
--
-- Findings now NAME their comparison window ("4 hafta öncesine göre %12 arttı"),
-- and the owner chooses that window on the dashboard (previous period / 4 weeks /
-- 52 weeks). The stored set was keyed by date range alone, so a set written while
-- "geçen yıl" was selected would be replayed verbatim after switching back to
-- "önceki dönem" — the sentence would cite one baseline while the KPI badges above
-- it showed another. Keying on the basis as well keeps each set with the question
-- it actually answered.
--
-- Defaults to 'prev' so every existing row keeps working: that is the baseline
-- they were all generated against, since it was the only one that existed.
alter table public.analytics_insights
  add column if not exists compare_basis text not null default 'prev'
    check (compare_basis in ('prev', '4w', '52w'));

-- The lookup is (range, basis, newest first) — index it as such.
drop index if exists analytics_insights_range_idx;
create index if not exists analytics_insights_range_idx
  on public.analytics_insights (range_from, range_to, compare_basis, created_at desc);
