/* Work on screen that is not saved anywhere yet (71d).
 *
 * The update reload waits for a "safe" moment — the tab hidden, or nothing
 * focused. That protects a field being typed into, and nothing else: the event
 * setup form keeps its edits in component state until "שמירה", so a host who
 * changed the date, tapped elsewhere and put the phone down came back to the
 * new build and the old date. useAppUpdate cannot see a screen's state; a
 * screen that holds unsaved work says so here, and the reload waits.
 *
 * Keyed, so two holders cannot clear each other's mark. In memory only — a
 * reload is exactly what it is guarding against, and storage would outlive it.
 */
const holders = new Set();

/** Mark (or clear) unsaved work under `key` — e.g. "event-setup". */
export function setUnsavedWork(key, on) {
  if (on) holders.add(key); else holders.delete(key);
}

/** Is any screen holding work that a reload would throw away? */
export function hasUnsavedWork() {
  return holders.size > 0;
}
