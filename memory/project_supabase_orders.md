---
name: Supabase orders table RLS
description: Orders table exists with RLS enabled and a public anon insert policy
type: project
---

The `orders` table has RLS enabled. A policy `allow_public_insert` allows `anon` role to insert rows with no restrictions.

**Why:** Public menu customers are unauthenticated — without this policy Supabase silently blocks inserts.
**How to apply:** If order submission breaks again, check this policy first. It's intentionally permissive for now and will be tightened later.
