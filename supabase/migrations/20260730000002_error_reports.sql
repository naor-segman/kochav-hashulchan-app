-- ─────────────────────────────────────────────────────────────────────────────
-- Error reporting.
--
-- Until now a crash on a customer's phone left NO trace anywhere: the error
-- boundary rendered a message and the exception went to that browser's console
-- and disappeared. The owner would find out only if the couple happened to
-- call. Before running real events that is the gap worth closing first, because
-- an event happens once and there is no second chance to reproduce it.
--
-- Deliberately NOT a third-party service. Supabase is already here, the admin
-- panel is already here, and there is no account to open, no DSN to configure
-- and no bill. What it gives up versus Sentry is release tracking, symbolicated
-- stacks and grouping — worth adding later if the volume ever justifies it.
--
-- PRIVACY: the client sends the message, a truncated stack, the route and the
-- browser. It does NOT send guest data, and it scrubs public tokens out of the
-- path before sending (see src/utils/errorReport.js) — a token in a URL is a
-- credential, and this table is read by the admin panel.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.error_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  message     text        NOT NULL,
  stack       text,
  route       text,
  user_agent  text,
  kind        text        NOT NULL DEFAULT 'render',
  seen        boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS error_reports_created_idx ON public.error_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS error_reports_unseen_idx  ON public.error_reports (seen, created_at DESC);

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

-- No direct access for anybody. Writes go through the RPC below (which bounds
-- the payload and rate-limits), reads are admin-only.
CREATE POLICY "error_reports_admin_select" ON public.error_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "error_reports_admin_update" ON public.error_reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "error_reports_admin_delete" ON public.error_reports
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ── The write path ───────────────────────────────────────────────────────────
-- Callable by anyone, because the pages that crash hardest are the PUBLIC ones
-- a guest opens from a WhatsApp link, where there is no session at all.
--
-- Three guards, because an endpoint anonymous callers can write to is an
-- endpoint someone will flood:
--   • every field is length-bounded here, not trusted from the client;
--   • a crash LOOP (the boundary's reload re-crashing) is collapsed — the same
--     message on the same route within 10 minutes is dropped rather than
--     written 400 times;
--   • a global ceiling of 200 rows per hour, after which writes are ignored.
CREATE OR REPLACE FUNCTION public.report_error(
  p_message    text,
  p_stack      text DEFAULT NULL,
  p_route      text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_kind       text DEFAULT 'render'
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_message text := nullif(left(trim(coalesce(p_message, '')), 500), '');
  v_route   text := left(coalesce(p_route, ''), 200);
BEGIN
  IF v_message IS NULL THEN RETURN; END IF;

  -- Crash loop: same message, same route, already recorded in the last 10 min.
  IF EXISTS (
    SELECT 1 FROM public.error_reports
    WHERE message = v_message
      AND coalesce(route, '') = v_route
      AND created_at > now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;

  -- Global ceiling.
  IF (SELECT count(*) FROM public.error_reports WHERE created_at > now() - interval '1 hour') >= 200 THEN
    RETURN;
  END IF;

  INSERT INTO public.error_reports (user_id, message, stack, route, user_agent, kind)
  VALUES (
    auth.uid(),
    v_message,
    left(coalesce(p_stack, ''), 4000),
    v_route,
    left(coalesce(p_user_agent, ''), 300),
    coalesce(nullif(left(p_kind, 20), ''), 'render')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_error(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.report_error(text, text, text, text, text) TO anon, authenticated;
