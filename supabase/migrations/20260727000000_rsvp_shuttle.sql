-- ── Shuttle self-registration on the RSVP form ─────────────────────────────
-- Guests can already see the shuttle list on the event site, but the host had
-- no way to know who intends to board which one — they were counting heads by
-- WhatsApp. Rather than a separate public write path (new table, new policy,
-- new token), the choice rides along on the RSVP the guest is already filling
-- in: one form, one submission, one place for the host to read it.
--
-- shuttle_id holds the client-side shuttle id from eventSite.shuttles[].id.
-- It is intentionally free-form text and NOT a foreign key: shuttles live in
-- the event's JSON payload, not in a table, and a host who deletes a shuttle
-- must not cascade-delete their guests' RSVPs. A stale id simply stops
-- resolving to a name in the UI.
--
-- Idempotent — safe to run more than once.

ALTER TABLE public.rsvp_responses
  ADD COLUMN IF NOT EXISTS shuttle_id text;

COMMENT ON COLUMN public.rsvp_responses.shuttle_id IS
  'Optional eventSite.shuttles[].id the guest chose to board. Free-form: shuttles are stored in the event payload, not a table.';

-- Hosts read their own event's responses; the existing RLS policies on
-- rsvp_responses already scope by event ownership, so the new column needs no
-- policy of its own. Anonymous inserts likewise already go through the same
-- insert policy — it grants the row, not a column list.
