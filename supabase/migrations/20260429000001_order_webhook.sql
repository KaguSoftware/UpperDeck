-- Upperdeck Menu — order webhook wiring
-- INFORMATIONAL MIGRATION
-- This file documents how to connect the order-notify Edge Function to the
-- orders table. Choose either the Dashboard method (recommended) or the
-- pg_net trigger method below — not both.

-- ---------- pg_net extension (required for the trigger alternative) ----------
-- The Dashboard webhook approach does not need this; it is wired internally.
-- Uncomment only if you are using the trigger alternative below.
-- create extension if not exists pg_net;

-- =============================================================================
-- METHOD A — Supabase Dashboard (recommended, no SQL needed)
-- =============================================================================
--
-- 1. Open your Supabase project → Database → Webhooks → "Create a new hook".
-- 2. Fill in:
--      Name:     order-notify
--      Table:    public.orders
--      Events:   ✓ INSERT  (leave UPDATE and DELETE unchecked)
--      Type:     Supabase Edge Functions
--      Function: order-notify
--      Method:   POST
--      Params:   secret = <your WEBHOOK_SECRET>   ← add as a query parameter
-- 3. Save. Supabase will call your function at:
--    https://<project-ref>.functions.supabase.co/order-notify?secret=<WEBHOOK_SECRET>
--
-- =============================================================================
-- METHOD B — pg_net trigger (alternative, comment out if using Method A)
-- =============================================================================
-- Requires pg_net extension and that supabase_functions schema is available
-- in your project. Uncomment and replace the placeholders before running.

/*
create or replace function public.notify_order_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _url  text := 'https://<project-ref>.functions.supabase.co/order-notify?secret=<WEBHOOK_SECRET>';
  _body jsonb;
begin
  _body := jsonb_build_object(
    'type',       'INSERT',
    'table',      'orders',
    'schema',     'public',
    'record',     row_to_json(new)::jsonb,
    'old_record', null
  );

  perform net.http_post(
    url     := _url,
    body    := _body::text,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  return new;
end $$;

drop trigger if exists orders_notify_insert on public.orders;
create trigger orders_notify_insert
  after insert on public.orders
  for each row execute function public.notify_order_insert();
*/
