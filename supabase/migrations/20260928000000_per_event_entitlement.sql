-- =============================================================================
-- Migration: 20260928000000_per_event_entitlement
-- Depends on: 20260927000000_one_time_purchase
--
-- A PURCHASE BELONGS TO ONE EVENT.
--
-- 20260927000000 made the charge one-time and said, in its own header, what it
-- was leaving undone: "the price is per EVENT, but a purchase row is still per
-- USER. Paying once therefore unlocks the paid plan for the account, not for one
-- event." This is that column, and it arrives with the code that reads it.
--
-- WHY THE FK IS THE CLOUD ID, WHICH IS NOT THE ID THE APP ROUTES ON
--   An event has two identities and they are different UUIDs:
--
--     local  `ev.id`       minted client-side by uid(), stored in the events
--                          row's JSONB as payload.localId, and the value the
--                          URL carries (/events/:eventId) and every screen and
--                          gate sees. cloudSync.mapLocalEventToCloudPayload
--                          deliberately sends NO `id` column.
--     cloud  `events.id`   gen_random_uuid() on the server, kept on the local
--                          object as `ev.cloudId`.
--
--   The FK below is the CLOUD id, for three reasons that all point the same way:
--     1. It is a real uuid. `uid()` has a third fallback branch that returns
--        "id-<base36>" when crypto is unavailable (a LAN IP is not a secure
--        context, which is how you check RTL on a real phone) — that value
--        cannot be stored in a uuid column at all, and it would fail at the
--        worst possible moment, mid-purchase.
--     2. Every other per-event table already keys on it — collab_live_table,
--        event_album, collab_guests. A second convention here would be the
--        thing someone gets wrong later.
--     3. It is the only id the WEBHOOK can verify. The webhook writes with the
--        service role and must be able to prove the event exists and belongs to
--        the buyer; payload.localId is self-declared JSON inside a row the user
--        can edit, so trusting it would let a host point a purchase at anything.
--
--   Consequence, stated so nobody has to discover it: an event that has never
--   reached the cloud (guest-mode draft, or a sync that has not landed yet) has
--   no cloudId and therefore cannot be bought. That is correct — paying requires
--   being signed in — but it has to be SAID in the UI rather than shown as a
--   button that fails.
--
-- WHY THERE IS NO UNIQUE (user_id, event_id)
--   It looks right and it is wrong. A refund followed by a re-purchase of the
--   same event is a legitimate sequence, and so is buying the ₪1,290 package for
--   an event that already has the ₪690 one. The uniqueness that matters is one
--   row per PAYMENT, and that is already enforced by
--   stripe_checkout_session_id. What stops a host being charged twice for the
--   same wedding is a check in create-checkout-session BEFORE Stripe is called —
--   a guard in front of the money, not a constraint behind it.
--
-- ON DELETE SET NULL, not CASCADE
--   Deleting an event must not delete the record that money changed hands. Every
--   other per-event table cascades because its rows are worthless without the
--   event; a purchase row is an accounting record. It becomes an account-wide
--   entitlement if its event is deleted, which is the forgiving direction: the
--   host keeps what they paid for.
-- =============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS event_id uuid
    REFERENCES public.events (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.subscriptions.event_id IS
  'The events.id (CLOUD id, not payload.localId) this purchase unlocks. NULL means account-wide — an admin comp, or a purchase whose event was later deleted. Set from the Stripe session metadata by the webhook, which verifies the event belongs to the buyer first.';

CREATE INDEX IF NOT EXISTS subs_event_idx
  ON public.subscriptions (event_id);

-- The lookup the app actually makes on every event screen: "what has this user
-- bought that is still valid?" One index for the whole question.
CREATE INDEX IF NOT EXISTS subs_user_active_idx
  ON public.subscriptions (user_id, status)
  WHERE status IN ('active', 'trialing');
