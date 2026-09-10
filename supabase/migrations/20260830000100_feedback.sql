-- ─────────────────────────────────────────────────────────────────────────────
-- Feedback from pilot users.  Checklist 25.
--
-- `error_reports` (20260730000002) catches what CRASHES. This catches what is
-- merely wrong: the button nobody finds, the wording that misleads, the step
-- that works and is still the wrong step. Those never throw, so no amount of
-- error reporting surfaces them — the only way they reach the owner is if
-- somebody types them, and the only way somebody types them is if there is
-- somewhere to type.
--
-- WHY NOT A mailto:
-- The account screen already had one. It depends on the reader having a mail
-- client configured, it silently does nothing on a lot of phones, it arrives
-- with no context about which screen or which browser — and today it points at
-- a domain with no mailbox behind it (checklist 13), so it goes nowhere at all.
-- A row in a table works now, and arrives with the context attached.
--
-- Deliberately shaped like error_reports: same guards, same admin-only reads,
-- same anonymous write path through an RPC. A second pattern for the same job
-- is a second thing to get wrong.
--
-- PRIVACY: the route is scrubbed of public tokens client-side before it is
-- sent (src/utils/errorReport.js `scrubRoute`) — a token in a URL is a
-- credential and this table is read by the admin panel. `contact` is optional
-- and typed by the person on purpose; nothing else identifying is collected.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  kind        text        NOT NULL DEFAULT 'other',
  message     text        NOT NULL,
  contact     text,
  route       text,
  user_agent  text,
  seen        boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS feedback_created_idx ON public.feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_unseen_idx  ON public.feedback (seen, created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- No direct access for anybody. Writes go through the RPC below, reads are
-- admin-only — feedback can carry a phone number the sender typed in.
CREATE POLICY "feedback_admin_select" ON public.feedback
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "feedback_admin_update" ON public.feedback
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "feedback_admin_delete" ON public.feedback
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ── The write path ───────────────────────────────────────────────────────────
-- Callable by anyone. A guest who opens an RSVP link has no session, and the
-- guest screens are exactly where a confusing step costs the host a reply.
--
-- Guards, because an endpoint anonymous callers can write to is an endpoint
-- someone will flood:
--   • every field length-bounded here, not trusted from the client;
--   • `kind` narrowed to the three the form offers — anything else is 'other';
--   • the same message from the same sender inside 10 minutes is a double-tap
--     on the submit button, not a second opinion;
--   • a global ceiling of 100 rows per hour.
--
-- Returns boolean rather than void so the screen can tell "we stored it" from
-- "we dropped it", and say something true either way.
CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_kind       text,
  p_message    text,
  p_contact    text DEFAULT NULL,
  p_route      text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_kind    text := lower(trim(coalesce(p_kind, '')));
  v_route   text := left(coalesce(p_route, ''), 200);
BEGIN
  IF v_message IS NULL THEN RETURN false; END IF;
  v_message := left(v_message, 4000);

  IF v_kind NOT IN ('bug', 'idea', 'other') THEN
    v_kind := 'other';
  END IF;

  -- Double-tap, not a second opinion.
  IF EXISTS (
    SELECT 1 FROM public.feedback
    WHERE message = v_message
      AND user_id IS NOT DISTINCT FROM auth.uid()
      AND created_at > now() - interval '10 minutes'
  ) THEN
    RETURN true;   -- already have it; the sender should not be told otherwise
  END IF;

  IF (SELECT count(*) FROM public.feedback WHERE created_at > now() - interval '1 hour') >= 100 THEN
    RETURN false;
  END IF;

  INSERT INTO public.feedback (user_id, kind, message, contact, route, user_agent)
  VALUES (
    auth.uid(),
    v_kind,
    v_message,
    nullif(left(trim(coalesce(p_contact, '')), 200), ''),
    v_route,
    left(coalesce(p_user_agent, ''), 300)
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_feedback(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_feedback(text, text, text, text, text) TO anon, authenticated;
