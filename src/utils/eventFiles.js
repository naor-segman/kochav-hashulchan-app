import { supabase, isSupabaseConfigured } from "../lib/supabase.js";

/* An event's files go with the event (checklist 103 / privacy page §8).
 *
 * Deleting an event deleted its row, and the database cascade took the RSVP
 * answers, the gifts, the family table and the album's ROWS with it — but not
 * a single file. The cover, the gallery, the invitation photo and every photo
 * guests uploaded to the album stayed in two PUBLIC buckets, reachable by
 * anyone who had the URL, forever. And it had to be done BEFORE the row goes:
 * both buckets' delete policies check that the folder is an event the caller
 * owns, so once the row is gone nobody but the service role can remove them.
 *
 * Layout, both keyed by events.id:
 *   event-site   <eventId>/<file>
 *   event-album  <eventId>/<albumToken>/<file>   (one folder per album link —
 *                                                 a replaced link starts a new one)
 */
const PAGE = 100;

async function listAll(bucket, prefix) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

// Storage's list() is one level deep: a FOLDER comes back with id null.
async function filesUnder(bucket, prefix, depth) {
  const entries = await listAll(bucket, prefix);
  const files = entries.filter(e => e.id).map(e => `${prefix}/${e.name}`);
  if (depth > 0) {
    for (const dir of entries.filter(e => !e.id)) {
      files.push(...await filesUnder(bucket, `${prefix}/${dir.name}`, depth - 1));
    }
  }
  return files;
}

async function removeAll(bucket, paths) {
  for (let i = 0; i < paths.length; i += PAGE) {
    // remove() RESOLVES with { error } — it does not reject.
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + PAGE));
    if (error) throw error;
  }
}

/**
 * Remove every file an event has in storage. Throws on any failure, so the
 * caller can keep the delete owed and try again — deleting the row first would
 * strand the files for good.
 *
 * @returns {Promise<number>} how many files were removed
 */
export async function purgeEventFiles(cloudId) {
  if (!isSupabaseConfigured || !supabase || !cloudId) return 0;
  const site  = await filesUnder("event-site", cloudId, 0);
  const album = await filesUnder("event-album", cloudId, 1);
  await removeAll("event-site", site);
  await removeAll("event-album", album);
  return site.length + album.length;
}
