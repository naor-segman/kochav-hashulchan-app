-- ── Close the anon read leak on collab_guests ──────────────────────────────
-- The previous migration granted anon direct SELECT so Realtime could deliver
-- live changes. But a direct table grant lets any anonymous client run an
-- UNFILTERED select and enumerate every collab-enabled event's guest names AND
-- phone numbers — the token/event capability is bypassed. Phones are
-- deliberately withheld elsewhere (hostess/RSVP RPCs), so this is a real leak.
--
-- Fix: anon gets NO direct table access. The public family page reads/writes
-- ONLY through the token-validated SECURITY DEFINER functions (collab_list /
-- collab_upsert / collab_delete _by_token), which scope everything to one event
-- by its collab_token. The app polls collab_list_by_token for live updates.
-- The owner (authenticated) keeps full access via the cg_owner_all RLS policy.
-- Idempotent.

DROP POLICY IF EXISTS "cg_anon_select" ON public.collab_guests;

REVOKE ALL ON public.collab_guests FROM anon;

-- Owner access is RLS-guarded (cg_owner_all); ensure the role has the grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collab_guests TO authenticated;

-- The SECURITY DEFINER token functions remain the only anon path in.
GRANT EXECUTE ON FUNCTION public.collab_list_by_token(text)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collab_upsert_by_token(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collab_delete_by_token(text, uuid)  TO anon, authenticated;
