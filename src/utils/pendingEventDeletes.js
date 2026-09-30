/* Events deleted here whose cloud row may still exist (fifth review 30.9, סב88).
 *
 * `removeEvent` dropped the event locally and fired the cloud delete once, with
 * `.catch(() => {})`. Offline, or with the tab closed before it landed, the
 * row stayed — and the next load, reading the cloud as the truth, brought the
 * deleted event back with all its guests. Now the row's id is kept here until
 * the delete is known to have landed; the load leaves such rows out and sends
 * the delete again. Per account, beside that account's events.
 */
const keyFor = (userId) => `kh_pending_event_deletes:${userId}`;

export function readPendingDeletes(userId) {
  if (!userId) return new Set();
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(userId)) || "[]");
    return new Set(Array.isArray(v) ? v.filter(x => typeof x === "string" && x) : []);
  } catch { return new Set(); }
}

function write(userId, set) {
  try {
    if (set.size) localStorage.setItem(keyFor(userId), JSON.stringify([...set]));
    else localStorage.removeItem(keyFor(userId));
  } catch { /* storage full or blocked: this session still retries */ }
}

export function addPendingDelete(userId, cloudId) {
  if (!userId || !cloudId) return;
  const s = readPendingDeletes(userId);
  s.add(cloudId);
  write(userId, s);
}

export function clearPendingDelete(userId, cloudId) {
  if (!userId) return;
  const s = readPendingDeletes(userId);
  if (s.delete(cloudId)) write(userId, s);
}

/**
 * The cloud's list without the rows deleted here. `retry(cloudId)` is called
 * for each such row still present. When the list is complete (`authoritative`),
 * an id it does not contain is gone already and is forgotten.
 */
export function withoutPendingDeletes(userId, cloudEvents, { authoritative, retry }) {
  const pending = readPendingDeletes(userId);
  if (!pending.size) return cloudEvents;
  const present = new Set();
  const kept = cloudEvents.filter(ce => {
    if (!pending.has(ce.cloudId)) return true;
    present.add(ce.cloudId);
    return false;
  });
  present.forEach(id => retry?.(id));
  if (authoritative) {
    const s = new Set([...pending].filter(id => present.has(id)));
    if (s.size !== pending.size) write(userId, s);
  }
  return kept;
}
