create table if not exists public.newsletter (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  created_at timestamptz not null default now(),
  constraint newsletter_email_unique unique (email)
);

-- Anyone can insert (public coupon form); no one can read without service role
alter table public.newsletter enable row level security;

create policy "insert_newsletter" on public.newsletter
  for insert with check (true);
