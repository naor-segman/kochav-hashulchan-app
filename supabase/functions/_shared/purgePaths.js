/**
 * Which storage paths the nightly photo purge may delete for ONE event.
 *
 * Plain JavaScript on purpose: imported by purge-event-photos/index.ts (Deno)
 * and by supabase/tests/purgePaths.test.js (vitest), so the rule that decides
 * what the service role deletes is tested by execution rather than by reading.
 *
 * ── Why it exists ────────────────────────────────────────────────────────────
 * The purge runs with the SERVICE ROLE, which bypasses RLS. It used to turn
 * every URL in a due event's payload that contained "/event-site/" into a path
 * and remove it. The URLs come from the event's own payload — coverPhoto,
 * gallery, announcements.*.photo — and the owner can write anything there. So a
 * signed-up user could paste another customer's photo URLs (they are public, on
 * that customer's event site) into their own gallery, set their own event date
 * in the past, and the next scheduled run would delete the OTHER customer's
 * photos. Found by the 28.9 security audit. The client-side version of this
 * (eventHelpers.js, duplicateEvent) had been fixed; the server never was.
 *
 * Every object in the event-site bucket lives under `<events.id>/…` — the
 * storage policies are written on exactly that (foldername[1] = e.id). So a
 * path is this event's only if its FIRST segment is this event's id. Anything
 * else is left alone — not deleted, not an error — and the event is still
 * finalized, because a URL pointing at someone else's file is a dead reference
 * in THIS payload either way.
 *
 * @param {string[]} urls      public URLs from the due event's payload
 * @param {string}   eventId   the due event's events.id
 * @param {string}   bucket    "event-site"
 * @returns {string[]} object paths inside `bucket`, all under `${eventId}/`
 */
export function ownedPaths(urls, eventId, bucket) {
  if (!Array.isArray(urls) || typeof eventId !== "string" || eventId.length === 0) return [];
  const marker = `/${bucket}/`;
  const out = [];
  for (const url of urls) {
    if (typeof url !== "string" || url.length === 0 || url.startsWith("data:")) continue;
    const i = url.indexOf(marker);
    if (i === -1) continue;
    let path = url.slice(i + marker.length).split("?")[0].split("#")[0];
    try { path = decodeURIComponent(path); } catch { continue; }
    // No traversal, no empty segments: "a/../b" and "a//b" are not paths this
    // app writes, and a check on the first segment means nothing if the rest
    // can climb out of it.
    const segs = path.split("/");
    if (segs.some(s => s === "" || s === "." || s === "..")) continue;
    if (segs.length < 2) continue;              // a bare folder is not an object
    if (segs[0] !== eventId) continue;          // THE rule: this event's folder only
    out.push(path);
  }
  return out;
}
