-- ============================================================================
-- Three public endpoints that were missing the bounds every sibling has.
--
-- All three were reproduced as the real `anon` role against a database built
-- from setup_full.sql, not inferred from reading.
-- ============================================================================


-- ── 1. submit_guest_by_token ignored the shared-table off switch ─────────────
--
-- 20260730000001 added collab_is_active(e) to collab_event_by_token,
-- collab_list_by_token, collab_upsert_by_token and collab_delete_by_token, and
-- states the intent plainly: "with the switch off, a holder of the link must
-- not be able to add, change or remove a row." submit_guest_by_token was
-- missed. Measured with collabActive set to false:
--
--   collab_upsert_by_token -> refused: invalid token
--   submit_guest_by_token  -> WROTE. rows in guest_submissions: 1
--
-- The host revokes the link, watches the shared table go quiet, and writes keep
-- landing. Compounding it, `grep -rn submit_guest_by_token src/` returns
-- nothing: no client has called this since the collab table replaced it, and it
-- writes to guest_submissions, which no screen reads.
--
-- So the fix is to take the grant away rather than to add the check. An
-- endpoint nobody calls cannot be hardened into safety; it can only be closed.
-- The function is left in place so that a future caller has to make a
-- deliberate decision about the switch rather than inherit this one.
REVOKE EXECUTE ON FUNCTION public.submit_guest_by_token(text, jsonb) FROM anon, authenticated;


-- ── 2. album_add_photo had no row cap and no input bounds ────────────────────
--
-- Every sibling write path caps an event at 5000 rows and bounds every string
-- (submit_rsvp_by_token, submit_gift_by_token, collab_upsert_by_token). This
-- one did neither. Measured as anon with a valid album token:
--
--   loop ran to completion, never refused
--   album rows: 6002        longest uploader: 5000
--
-- The album QR is meant to be photographed off a table at the venue, so the
-- token reaching a stranger is the DESIGNED distribution, not a breach.
create or replace function public.album_add_photo(
  token_value text, path_value text, uploader_value text
) returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  ev_id  uuid;
  new_id uuid;
  n      int;
begin
  ev_id := public.album_event_id(token_value);
  if ev_id is null then
    raise exception 'invalid album token' using errcode = '42501';
  end if;
  -- Bind the file to its event: the client picks the path, so without this a
  -- caller could index a file belonging to a different event's folder.
  -- The length bound is new; the path is client-supplied and was unbounded.
  if path_value is null or char_length(path_value) > 400
     or path_value not like ev_id::text || '/%' then
    raise exception 'path does not belong to this event' using errcode = '42501';
  end if;

  -- Same ceiling every other public write path on this schema already had.
  select count(*) into n from public.album_photos where event_id = ev_id;
  if n >= 5000 then raise exception 'limit reached' using errcode = '42501'; end if;

  insert into public.album_photos (event_id, album_token, storage_path, uploader)
  values (ev_id, token_value, path_value,
          nullif(left(btrim(coalesce(uploader_value, '')), 80), ''))
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.album_add_photo(text, text, text) from public;
grant execute on function public.album_add_photo(text, text, text) to anon, authenticated;


-- ── 3. report_error's rate limit was global, so anyone could blind it ────────
--
-- The ceiling was 200 rows per hour across the WHOLE table, with a 10-minute
-- dedup keyed on (message, route) that varying the message defeats. Measured as
-- anon: 199 junk rows written, and a genuine crash in the same hour recorded 0
-- times. report_error returns void, so the customer's browser believes it
-- reported.
--
-- The owner's only visibility into production crashes is this table, and it
-- would go dark exactly during an event -- which happens once and cannot be
-- re-run. The ceiling is now per route, so flooding one route cannot silence
-- the others, and authenticated sessions keep a reserved quota of their own.
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
  v_uid     uuid := auth.uid();
  n         int;
BEGIN
  IF v_message IS NULL THEN RETURN; END IF;

  -- Unchanged: a crash LOOP (the boundary's reload re-crashing) is one error,
  -- not four hundred.
  IF EXISTS (
    SELECT 1 FROM public.error_reports
    WHERE message = v_message
      AND coalesce(route, '') = v_route
      AND created_at > now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;

  -- Per ROUTE rather than global, so a flood aimed at one screen can no longer
  -- hide a crash on any other.
  SELECT count(*) INTO n FROM public.error_reports
   WHERE coalesce(route, '') = v_route AND created_at > now() - interval '1 hour';
  IF n >= 50 THEN RETURN; END IF;

  -- And a quota anonymous traffic cannot consume, so a signed-in customer's
  -- crash is still recorded while an anonymous flood is in progress.
  IF v_uid IS NULL THEN
    SELECT count(*) INTO n FROM public.error_reports
     WHERE user_id IS NULL AND created_at > now() - interval '1 hour';
    IF n >= 100 THEN RETURN; END IF;
  END IF;

  INSERT INTO public.error_reports (user_id, message, stack, route, user_agent, kind)
  VALUES (
    v_uid,
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
