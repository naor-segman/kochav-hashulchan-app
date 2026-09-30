/* Events deleted here whose cloud row may still exist (fifth review 30.9, סב88).
 *
 * `removeEvent` dropped the event locally and fired the cloud delete once, with
 * `.catch(() => {})`. Offline, or with the tab closed before it landed, the
 * row stayed — and the next load, reading the cloud as the truth, brought the
 * deleted event back with all its guests. Now the row's id is kept here until
 * the delete is known to have landed; the load leaves such rows out and sends
 * the delete again. Per account, beside that account's events.
 *
 * A delete that has LANDED is kept too, until a complete list no longer holds
 * the row: a load sent before the delete and answered after it still carries
 * the row, and with the mark already cleared the event came back (sixth review
 * 30.9). Stored as { cloudId: 0 (owed) | landedAt }.
 */
const keyFor = (userId) => `kh_pending_event_deletes:${userId}`;
// A landed delete is forgotten after this even if no complete list ever came.
const LANDED_TTL_MS = 24 * 60 * 60 * 1000;

function read(userId, now = Date.now()) {
  if (!userId) return new Map();
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(userId)) || "{}");
    // The first version stored a bare list of owed ids.
    const entries = Array.isArray(v) ? v.map(id => [id, 0]) : Object.entries(v || {});
    return new Map(entries.filter(([id, at]) =>
      typeof id === "string" && id && Number.isFinite(at) && (at === 0 || now - at < LANDED_TTL_MS)));
  } catch { return new Map(); }
}

function write(userId, marks) {
  try {
    if (marks.size) localStorage.setItem(keyFor(userId), JSON.stringify(Object.fromEntries(marks)));
    else localStorage.removeItem(keyFor(userId));
  } catch { /* storage full or blocked: this session still retries */ }
}

/** The cloud ids whose delete has not landed yet. */
export function readPendingDeletes(userId) {
  return new Set([...read(userId)].filter(([, at]) => at === 0).map(([id]) => id));
}

export function addPendingDelete(userId, cloudId) {
  if (!userId || !cloudId) return;
  const m = read(userId);
  m.set(cloudId, 0);
  write(userId, m);
}

/** The delete landed: stop sending it, keep hiding the row from late answers. */
export function markDeleteLanded(userId, cloudId, now = Date.now()) {
  if (!userId || !cloudId) return;
  const m = read(userId);
  if (!m.has(cloudId)) return;
  m.set(cloudId, now);
  write(userId, m);
}

/**
 * The cloud's list without the rows deleted here. `retry(cloudId)` is called
 * for each such row still present whose delete has not landed. When the list
 * is complete (`authoritative`), an id it does not contain is gone for good
 * and is forgotten.
 */
export function withoutPendingDeletes(userId, cloudEvents, { authoritative, retry }) {
  const marks = read(userId);
  if (!marks.size) return cloudEvents;
  const present = new Set();
  const kept = cloudEvents.filter(ce => {
    if (!marks.has(ce.cloudId)) return true;
    present.add(ce.cloudId);
    return false;
  });
  present.forEach(id => { if (marks.get(id) === 0) retry?.(id); });
  if (authoritative) {
    let changed = false;
    for (const id of [...marks.keys()]) if (!present.has(id)) { marks.delete(id); changed = true; }
    if (changed) write(userId, marks);
  }
  return kept;
}
