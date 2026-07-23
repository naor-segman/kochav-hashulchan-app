-- ── Guest companions (#8) ──────────────────────────────────────────────────
-- Store the names of the people coming with a guest, collected at RSVP time,
-- so every chair shows a name in seating / hostess / export.
-- Idempotent — safe to run more than once.

-- 1. RSVP responses carry the companion names the guest typed.
ALTER TABLE public.rsvp_responses
  ADD COLUMN IF NOT EXISTS companions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. The hostess lookup returns companions so the door team sees every name.
CREATE OR REPLACE FUNCTION public.hostess_data_by_token(token_value text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',    e.id,
    'name',  e.name,
    'guests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',    g->>'id',
        'name',  g->>'name',
        'count', COALESCE((g->>'count')::int, 1),
        'companions', COALESCE(g->'companions', '[]'::jsonb)
      ))
      FROM jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb)) g
    ), '[]'::jsonb),
    'tables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',   t->>'id',
        'name', t->>'name'
      ))
      FROM jsonb_array_elements(COALESCE(e.payload->'tables', '[]'::jsonb)) t
    ), '[]'::jsonb),
    'seating', COALESCE(e.payload->'seating', '{}'::jsonb)
  )
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.hostess_token = token_value
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.hostess_data_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.hostess_data_by_token(text) TO anon, authenticated;
