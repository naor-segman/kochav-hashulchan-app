-- ─────────────────────────────────────────────────────────────────────────────
-- profiles: users can no longer rewrite their own billing identity
--
-- THE HOLE. `profiles: users update own` (20260524000000) was written before
-- billing existed and pins exactly two columns in its WITH CHECK:
--
--     WITH CHECK (id = auth.uid()
--                 AND role = (SELECT p.role FROM public.profiles p
--                             WHERE p.id = auth.uid()))
--
-- `stripe_customer_id` was added four migrations later (20260524000004) with a
-- UNIQUE constraint and no policy of its own, so it fell straight through that
-- check — as does `email`. Both are user-writable from the browser today.
--
-- Why that matters, precisely:
--
--   • create-billing-portal reads `profiles.stripe_customer_id` for the caller
--     and hands it to `stripe.billingPortal.sessions.create({ customer })`
--     verbatim. A signed-up user who set that column to somebody else's `cus_…`
--     gets a genuine Stripe portal for the victim: invoices with billing name
--     and address, card last-4, and the power to cancel their subscription.
--   • create-checkout-session seeds the Stripe customer from `profiles.email`.
--   • The column is UNIQUE, so squatting an id makes the real owner's webhook
--     write fail — a quiet billing denial of service.
--
-- NOT exploitable today: billing is switched off (no publishable key, so the UI
-- hides) and the app never exposes a `cus_…` anywhere. This is closed BEFORE
-- checklist item 41 turns the keys on, which is the whole point — a hole like
-- this is invisible on the day it stops being theoretical.
--
-- Both columns stay writable by the SERVICE ROLE, which is what the Edge
-- Functions use and what legitimately sets them.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "profiles: users update own" on public.profiles;

create policy "profiles: users update own"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Every column below is compared to its CURRENT stored value, so an UPDATE
    -- that leaves it alone passes and one that changes it is refused. Listing
    -- them by name rather than by exclusion is deliberate: a column added later
    -- must be considered on purpose, which is exactly what did not happen to
    -- stripe_customer_id.
    and role = (
      select p.role from public.profiles p where p.id = auth.uid()
    )
    and stripe_customer_id is not distinct from (
      select p.stripe_customer_id from public.profiles p where p.id = auth.uid()
    )
    and email is not distinct from (
      select p.email from public.profiles p where p.id = auth.uid()
    )
  );

comment on policy "profiles: users update own" on public.profiles is
  'A user may edit their own profile except role, email and stripe_customer_id. '
  'The last two feed the Stripe Edge Functions directly; see 20260818000000.';
