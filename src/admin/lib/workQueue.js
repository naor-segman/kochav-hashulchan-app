// The errors and feedback screens are work queues: what matters is what has
// not been read. WORKPLAN 58.
//
// Until 29.9 each loaded "the newest 200 rows" and counted the unread ones
// inside that window. After a burst — one bad release reports the same crash
// from every phone that opens the page — the newest 200 could all be read
// while older unread ones sat outside the window: invisible, uncounted, and
// the screen said "הכל נקרא".
//
// Now three reads: the newest unread (so nothing unread hides behind read
// ones), the newest overall (for the "show everything" view), and an exact
// count of unread, so the number on screen is the table's, not the window's.

export const QUEUE_WINDOW = 200;

/** Union by id, newest first. Pure — the part worth testing on its own. */
export function mergeQueue(unseen, recent) {
  const byId = new Map();
  for (const r of [...(recent || []), ...(unseen || [])]) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

/**
 * @returns {Promise<{ rows: object[], unseenTotal: number|null }>}
 *   unseenTotal is null when the count could not be read — the screen then
 *   falls back to counting what it loaded, and says nothing it cannot back.
 */
export async function loadQueue(supabase, table, cols) {
  const [unseenRes, recentRes, countRes] = await Promise.all([
    supabase.from(table).select(cols).eq("seen", false)
      .order("created_at", { ascending: false }).limit(QUEUE_WINDOW),
    supabase.from(table).select(cols)
      .order("created_at", { ascending: false }).limit(QUEUE_WINDOW),
    supabase.from(table).select("id", { count: "exact", head: true }).eq("seen", false),
  ]);
  if (unseenRes.error) throw unseenRes.error;
  if (recentRes.error) throw recentRes.error;
  const count = countRes.error ? null : countRes.count;
  return {
    rows: mergeQueue(unseenRes.data, recentRes.data),
    unseenTotal: typeof count === "number" && Number.isFinite(count) ? count : null,
  };
}

/**
 * The line over the list. `loadedUnseen` is how many unread rows are on
 * screen; `total` the table's count (or null).
 */
export function unseenSummary(loadedUnseen, total, { one, many, none }) {
  const n = total ?? loadedUnseen;
  const head = n === 0 ? none : n === 1 ? one : `${n} ${many}`;
  // More unread than the window holds: say so, and say what brings the rest.
  return total != null && total > loadedUnseen
    ? `${head} · מוצגות ${loadedUnseen} האחרונות — סמנו כנקרא ורעננו כדי לראות את הקודמות`
    : head;
}
