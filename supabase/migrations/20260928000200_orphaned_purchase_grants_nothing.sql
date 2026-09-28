-- =============================================================================
-- Migration: 20260928000200_orphaned_purchase_grants_nothing
-- Depends on: 20260928000000_per_event_entitlement
--
-- CORRECTS WHAT event_id NULL MEANS. No schema change — the documented meaning
-- was wrong, and the client rule built on it was exploitable.
--
-- 20260928000000 said of subscriptions.event_id: "NULL means account-wide — an
-- admin comp, or a purchase whose event was later deleted", and of ON DELETE SET
-- NULL: "an orphaned purchase becoming account-wide is the forgiving direction:
-- the host keeps what they paid for."
--
-- The security audit of the same day found what that means in practice: pay
-- ₪690 once, delete the event, and the row becomes account-wide — every event on
-- the account, including ones created later, unlocked for the price of one. The
-- webhook produced the same state on purpose whenever it could not match the
-- event. Written 28.9, found 28.9, never live (Stripe has not been configured).
--
-- The rule now (src/utils/entitlement.js isAccountWide):
--   event_id = <an event>                       → that event only
--   event_id IS NULL AND is_manually_managed    → every event: an ADMIN COMP
--   event_id IS NULL AND NOT is_manually_managed → NOTHING. A record of money
--                                                  that moved, for support and
--                                                  refunds — a person decides.
--
-- ON DELETE SET NULL stays: deleting an event must still not delete the record
-- of a payment. What changed is only what that orphaned row is worth.
--
-- TO COMP AN ACCOUNT BY HAND, set both — a null event alone grants nothing now:
--   insert into public.subscriptions (user_id, plan, status, is_manually_managed)
--   values ('<user uuid>', 'pro', 'active', true);
-- =============================================================================

comment on column public.subscriptions.event_id is
  'The events.id (CLOUD id) this purchase unlocks. NULL grants NOTHING unless is_manually_managed is true (an admin comp, which applies to every event on the account). A purchase whose event was deleted is kept as a record of the payment and unlocks nothing — see 20260928000200.';

comment on column public.subscriptions.is_manually_managed is
  'When true, webhook handlers must not overwrite this row — AND, with event_id NULL, this is what makes a row an account-wide admin comp. A NULL event_id without this flag grants nothing (20260928000200).';
