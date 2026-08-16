import { supabase, isSupabaseConfigured } from "../lib/supabase.js";

// ── Event-site photos ─────────────────────────────────────────────────────────
//
// The host's gallery and cover photo used to be base64 data URLs stored inside
// the event itself. Measured (qa/storageSize.mjs): six photos made a 400-guest
// event 3.03MB in localStorage — of a ~5MB per-origin budget shared by EVERY
// event the host has — and, because the up-mapper carries `eventSite` whole,
// every edit re-uploaded all six: 1.13MB to Postgres to rename a venue.
//
// Now the bytes go to Storage once and the event carries a URL. Both are
// strings that end up in <img src>, so nothing downstream needed changing and
// events that still hold a data URL keep working untouched — which is what
// makes this safe to ship without migrating anything.
//
// The bucket is public-read on purpose: the event site is served to guests who
// hold a token and are not signed in. Writes are restricted by RLS to a folder
// named after an event the caller owns — see
// supabase/migrations/20260816000000_event_site_photos.sql, whose policies were
// driven on a real Postgres 16 (cross-tenant write refused, listing scoped,
// delete isolated).
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET = "event-site";

/**
 * A stored photo is a URL; a legacy one is a data: URL. Both render the same.
 *
 * The emptiness check is not defensive noise: `""` is a string that does not
 * start with "data:", so without it an absent cover photo answered "yes, this
 * is a stored photo" and a caller would go looking for an object to delete.
 */
export function isStoredPhoto(src) {
  return typeof src === "string" && src.length > 0 && !src.startsWith("data:");
}

/**
 * The object path inside the bucket, recovered from a public URL.
 *
 * Deleting needs the path, and the gallery only holds the URL — deriving it
 * here keeps the stored shape a plain string, so an event written by an older
 * build still loads and a newer one still renders in an older tab.
 *
 * Returns null for a data: URL or anything not from this bucket, so a caller
 * can tell "nothing to delete" from "delete this".
 */
export function storagePathFromUrl(url) {
  if (!isStoredPhoto(url)) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split("?")[0];
  return path || null;
}

/**
 * Upload one already-compressed image and return its public URL.
 *
 * `eventCloudId` is the folder, and the RLS policy checks it against the
 * caller's own events — so passing another customer's id fails at the server
 * rather than silently writing somewhere it should not.
 */
export async function uploadSitePhoto(eventCloudId, blob, ext = "jpg") {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  if (!eventCloudId) throw new Error("event has no cloud id");

  // Random suffix, not just a timestamp: two photos picked in the same batch
  // land in the same millisecond, and `upsert: false` would make the second
  // one fail rather than overwrite.
  const path = `${eventCloudId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    // A year of cache: the path is unique per upload, so a changed photo is a
    // new URL and there is nothing to invalidate.
    .upload(path, blob, { cacheControl: "31536000", upsert: false, contentType: blob.type || "image/jpeg" });

  // The policy this write has to satisfy compares the FIRST FOLDER of the path
  // against an event the caller owns. When it refuses, "new row violates
  // row-level security policy" is true and useless — it does not say which
  // folder was tried, and that is the only fact that distinguishes a wrong
  // event id from a missing grant from a session the storage service never
  // received. Saying it here turns one more round trip into none.
  if (error) {
    error.message = `${error.message} [ניסיתי לכתוב אל: ${BUCKET}/${path}]`;
    throw error;
  }

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Remove a photo the host deleted from the gallery.
 *
 * Best-effort by design: the gallery entry is already gone from the event by
 * the time this runs, and failing the whole delete because the file could not
 * be reached would leave the host looking at a photo they removed. An orphaned
 * object costs storage; a phantom photo costs trust.
 *
 * Returns true only when something was actually removed, so a caller that
 * wants to know can ask.
 */
export async function deleteSitePhoto(url) {
  const path = storagePathFromUrl(url);
  if (!path || !isSupabaseConfigured || !supabase) return false;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return !error;
}
