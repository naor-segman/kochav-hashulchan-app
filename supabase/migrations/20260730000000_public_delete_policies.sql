-- ─────────────────────────────────────────────────────────────────────────────
-- The host can finally remove an RSVP row or a blessing from the wall.
--
-- Every public table had SELECT and INSERT policies and no DELETE policy at
-- all: `grep "FOR DELETE"` across every migration returned exactly two hits,
-- both for album photos. There was no delete UI either.
--
-- What that means in practice: a guest photographs the gift QR at the venue and
-- posts blessings onto the wall being projected on the screen. The 28.7
-- hardening capped anonymous writes at 5,000 rows per event, so the damage is
-- bounded — but nobody, not the couple and not an admin, had any way to remove
-- a single row short of opening the Supabase dashboard and writing SQL. The
-- same applies to RSVP rows, which drive the meal-count forecast the caterer is
-- ordered from.
--
-- Scope: the OWNER of the event only. Anonymous holders of a public token can
-- still only insert, exactly as before — nothing here widens anonymous access.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── RSVP responses ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rsvp_owner_delete" ON public.rsvp_responses;
CREATE POLICY "rsvp_owner_delete" ON public.rsvp_responses
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = rsvp_responses.event_id
        AND e.user_id = auth.uid()
    )
  );

-- ── Gift wall ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gifts_owner_delete" ON public.gifts;
CREATE POLICY "gifts_owner_delete" ON public.gifts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = gifts.event_id
        AND e.user_id = auth.uid()
    )
  );

-- ── Collaborative guest table ────────────────────────────────────────────────
-- The screen already offers a delete button; it went through the token RPC.
-- The owner should be able to remove a row from their own account too.
DROP POLICY IF EXISTS "collab_owner_delete" ON public.collab_guests;
CREATE POLICY "collab_owner_delete" ON public.collab_guests
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = collab_guests.event_id
        AND e.user_id = auth.uid()
    )
  );
