-- Add the 'dev' role to the user_role enum.
-- 'dev' = developer: owner-level power (users, roles, menu, orders, settings)
--          PLUS exclusive access to the Analytics tab.
--
-- Postgres cannot use a newly-added enum value in the same transaction that
-- adds it, so the assignment + RLS updates live in a separate migration
-- (20260704000001_dev_role_grants.sql).

alter type public.user_role add value if not exists 'dev';
