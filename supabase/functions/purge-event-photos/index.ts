// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================================
// purge-event-photos — Supabase Edge Function
//
// Deletes the photos of events whose retention window has passed. THE EVENTS
// ARE NOT DELETED — the guest list, seating, arrivals, costs and constraints
// all stay. Only the objects that cost money go, and only the fields that
// pointed at them are cleared.
//
// WHY THIS IS A FUNCTION AND NOT A CRON JOB IN SQL
//
// Deleting the row from storage.objects does NOT free the bytes: the object
// stays in the backing store and stays on the bill, while becoming unreachable
// and therefore un-deletable. Freeing it needs the Storage API, which needs the
// service role. SQL decides what is due and applies the result
// (public.photo_purge_due / public.photo_purge_finalize, migration
// 20260817000000_photo_retention.sql, driven against a real Postgres 16 by
// qa/photoRetentionSql.mjs). This does the one thing SQL cannot.
//
// ORDER MATTERS, and it is objects-then-payload on purpose. If this dies in
// between, the URLs are still in the payload, the event is still due, and the
// next run removes nothing (the objects are already gone) and finalizes
// normally. The reverse order would clear the only reference to a file that was
// still on the bill — unreachable and un-deletable forever.
//
// Request  (POST): no body. Header `x-purge-secret` must match PURGE_SECRET.
// Response (JSON): { scanned, purged, objectsRemoved, failures: [...] }
//
// Deploy:
//   supabase functions deploy purge-event-photos
//
// Schedule it hourly or nightly (Supabase dashboard → Integrations → Cron), as
// a POST to this function's URL with the `x-purge-secret` header set. Running
// it more often than the window is harmless: it is idempotent, and an event
// that is not due is not returned.
//
// Required Edge Function secrets:
//   PURGE_SECRET               — a long random string, also set on the cron job
//   SUPABASE_URL               — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  — auto-injected
//
// Set `verify_jwt = false` for this function (supabase/config.toml): the caller
// is a scheduler, not a signed-in user, and it authenticates with the shared
// secret below instead.
// =============================================================================

/** The bucket every event-site photo lives in. */
const BUCKET = "event-site";

/** Events per invocation. Bounds a run so a backlog cannot time the function
 *  out and then time out again forever; the remainder is picked up next run. */
const BATCH = 200;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * The object path inside the bucket, recovered from a public URL.
 *
 * Returns null for anything that is not an object in THIS bucket, so a stray
 * value in a payload cannot turn into a `remove()` call against a path we did
 * not write. Mirrors storagePathFromUrl in src/utils/sitePhotos.js.
 */
function storagePath(url: string): string | null {
  if (typeof url !== "string" || url.length === 0 || url.startsWith("data:")) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split("?")[0];
  return path || null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // The scheduler is not a signed-in user, so there is no JWT to check. The
  // shared secret is what stops this endpoint — which deletes customer data
  // across every account — from being callable by anyone who learns the URL.
  //
  // Compared with a length check first and a constant-time-ish scan after, and
  // an absent/blank PURGE_SECRET refuses everything rather than accepting
  // everything, which is the failure mode a missing env var usually has.
  const expected = Deno.env.get("PURGE_SECRET") ?? "";
  const got = req.headers.get("x-purge-secret") ?? "";
  if (expected.length < 16) {
    console.error("PURGE_SECRET is unset or too short — refusing every request");
    return json({ error: "not configured" }, 503);
  }
  if (got.length !== expected.length) return json({ error: "forbidden" }, 403);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return json({ error: "forbidden" }, 403);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: dueRows, error: dueErr } = await supabase
    .rpc("photo_purge_due", { batch_limit: BATCH });
  if (dueErr) {
    console.error("photo_purge_due failed", dueErr);
    return json({ error: dueErr.message }, 500);
  }

  const rows = (dueRows ?? []) as Array<{ event_id: string; urls: string[] }>;
  const failures: Array<{ eventId: string; reason: string }> = [];
  let purged = 0;
  let objectsRemoved = 0;

  for (const row of rows) {
    const paths = (row.urls ?? []).map(storagePath).filter((p): p is string => p !== null);

    // A due event whose URLs all point somewhere else still has to be
    // finalized: the fields are dead references either way, and skipping it
    // would leave it due forever and re-scanned on every run.
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
      if (rmErr) {
        // Do NOT finalize. Leaving the URLs in the payload keeps the event due,
        // so the next run tries again. Clearing them here would strand the
        // objects with nothing left pointing at them.
        failures.push({ eventId: row.event_id, reason: rmErr.message });
        continue;
      }
      objectsRemoved += paths.length;
    }

    const { error: finErr } = await supabase.rpc("photo_purge_finalize", { ev_id: row.event_id });
    if (finErr) {
      // The objects are gone but the payload still names them. The event stays
      // due and the next run finalizes it — `remove()` on already-deleted keys
      // is not an error, which is what makes the retry safe.
      failures.push({ eventId: row.event_id, reason: `finalize: ${finErr.message}` });
      continue;
    }
    purged++;
  }

  const summary = { scanned: rows.length, purged, objectsRemoved, failures };
  console.log("purge-event-photos", JSON.stringify(summary));
  return json(summary);
});
