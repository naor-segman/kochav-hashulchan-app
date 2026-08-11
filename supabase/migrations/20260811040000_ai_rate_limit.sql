-- ── A real rate limit on the one endpoint that spends money ──────────────────
--
-- `detect-floor-plan` calls a paid vision model with the project's Anthropic
-- key. It already requires a signed-in user — without that, anyone holding the
-- anon key (which ships in the browser bundle) could bill us in a loop. But a
-- signed-in user can still loop it, and the only limit in front of it today is
-- `canUseAI(plan)`, which runs IN THE BROWSER. A client-side gate is a UI
-- affordance, not a limit: the RPC is reachable with curl.
--
-- So the count lives in Postgres, the check is atomic with the insert, and the
-- edge function claims a call BEFORE it spends the key.
--
-- Deliberately NOT a token bucket or a leaky bucket. This has to be obvious to
-- read at 2am when a host says "it stopped working": a plain row per call, a
-- plain count over a window, and a limit you can raise with an UPDATE.
--
-- Idempotent — safe to run more than once.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The only query this table serves: "how many calls for this user, of this
-- kind, since T". Ordered by time so the window scan is a range, not a sort.
CREATE INDEX IF NOT EXISTS ai_usage_user_kind_time
  ON public.ai_usage (user_id, kind, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- A user may READ their own usage — the UI can say "3 מתוך 10 היום" instead of
-- failing with no explanation. Nobody may INSERT directly: that is the whole
-- point, and it is why claim_ai_call is SECURITY DEFINER.
DROP POLICY IF EXISTS ai_usage_owner_read ON public.ai_usage;
CREATE POLICY ai_usage_owner_read ON public.ai_usage
  FOR SELECT USING (user_id = auth.uid());

-- ── The claim ────────────────────────────────────────────────────────────────
-- Returns the number of calls REMAINING in the tighter of the two windows, so
-- the caller can show it. Raises when the limit is reached — an exception, not
-- a false return, because the whole value of this function is that a caller
-- cannot ignore it by forgetting to check a boolean.
--
-- The count and the insert are in one statement so two concurrent calls cannot
-- both see "9 used" and both proceed.
CREATE OR REPLACE FUNCTION public.claim_ai_call(
  call_kind  text,
  per_hour   int DEFAULT 10,
  per_day    int DEFAULT 30
)
RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid       uuid := auth.uid();
  used_hour int;
  used_day  int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF call_kind IS NULL OR char_length(call_kind) = 0 OR char_length(call_kind) > 64 THEN
    RAISE EXCEPTION 'call kind required';
  END IF;

  -- Bound what a caller can ask for. These arguments exist so the edge function
  -- can be tuned per endpoint, not so a client can hand itself a bigger budget.
  per_hour := greatest(1, least(COALESCE(per_hour, 10), 100));
  per_day  := greatest(1, least(COALESCE(per_day,  30), 500));

  WITH ins AS (
    INSERT INTO public.ai_usage (user_id, kind)
    SELECT uid, call_kind
    WHERE (SELECT count(*) FROM public.ai_usage
            WHERE user_id = uid AND kind = call_kind
              AND created_at > now() - interval '1 hour') < per_hour
      AND (SELECT count(*) FROM public.ai_usage
            WHERE user_id = uid AND kind = call_kind
              AND created_at > now() - interval '1 day') < per_day
    RETURNING 1
  )
  SELECT count(*)::int INTO used_hour FROM ins;

  IF used_hour = 0 THEN
    RAISE EXCEPTION 'rate limit reached' USING ERRCODE = '53400';
  END IF;

  SELECT count(*) INTO used_hour FROM public.ai_usage
   WHERE user_id = uid AND kind = call_kind AND created_at > now() - interval '1 hour';
  SELECT count(*) INTO used_day FROM public.ai_usage
   WHERE user_id = uid AND kind = call_kind AND created_at > now() - interval '1 day';

  RETURN least(per_hour - used_hour, per_day - used_day);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_call(text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_ai_call(text, int, int) TO authenticated;

-- ── Housekeeping ─────────────────────────────────────────────────────────────
-- Nothing older than a day is ever read. Left as a function rather than wired
-- to a cron: this project has no scheduler yet, and an unbounded table of one
-- row per AI call grows at the speed of usage, which is slow enough that a
-- manual sweep is honest for now.
CREATE OR REPLACE FUNCTION public.prune_ai_usage()
RETURNS int
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  WITH gone AS (
    DELETE FROM public.ai_usage WHERE created_at < now() - interval '7 days'
    RETURNING 1
  ) SELECT count(*)::int FROM gone;
$$;
REVOKE ALL ON FUNCTION public.prune_ai_usage() FROM public;
