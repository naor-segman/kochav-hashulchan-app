/**
 * A tiny keyed retry queue for writes that must not be lost in silence.
 *
 * THE FAILURE THIS EXISTS FOR
 * The shared-table sync pushed each edited guest with
 * `upsertCollabGuestOwner(...).catch(() => {})` and marked the row "applied"
 * BEFORE the push resolved. So a push lost to venue wifi was swallowed twice
 * over: nothing retried it, and the row now looked reconciled, so no later
 * render pushed it either. The next pull then overwrote the local edit with the
 * table's older copy. The host's change was gone and nothing anywhere said so.
 *
 * WHAT IT GUARANTEES
 *   1. A task that fails is retried on a widening schedule.
 *   2. Pushing the same key again REPLACES the pending task and resets the
 *      attempt count — the newest data is what eventually lands, not whatever
 *      was queued first. A host who fixes a typo mid-retry does not get the
 *      typo written.
 *   3. One key is never in flight twice at once.
 *   4. When the schedule is exhausted the queue says so, once, per key —
 *      because a write that has genuinely been lost is something the person has
 *      to be told about. Silence is what caused the bug.
 *
 * Deliberately not a generic job library: no persistence across reloads, no
 * priorities, no cancellation tokens. It is a Map, a timer and a counter, and
 * it can be read in one sitting.
 */

/** Widening, and bounded. ~32s total, then the caller is told. */
export const DEFAULT_DELAYS = [1000, 3000, 8000, 20000];

/**
 * @param {object}   opts
 * @param {number[]} [opts.delays]    ms before each retry; length = retries after the first try
 * @param {Function} [opts.onGiveUp]  (key, error) — every delay has been used
 * @param {Function} [opts.setTimer]  injected for tests; defaults to setTimeout
 * @param {Function} [opts.clearTimer]
 */
export function createRetryQueue({
  delays = DEFAULT_DELAYS,
  onGiveUp = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  // key -> { task, attempt, timer, running }
  const entries = new Map();
  let stopped = false;

  const clearEntryTimer = (e) => { if (e?.timer != null) { clearTimer(e.timer); e.timer = null; } };

  const run = (key) => {
    const e = entries.get(key);
    // `e.running` here is belt-and-braces and cannot be pinned by a test on its
    // own: push() already refuses to schedule while a key is running, and every
    // other route into schedule() happens after `running` is back to false. It
    // stays because the invariant "one key, one in-flight write" is the whole
    // reason this is keyed, and a future caller of schedule() should not have to
    // rediscover that. Same story for the clearEntryTimer in cancel() below.
    if (!e || stopped || e.running) return;
    e.running = true;
    const task = e.task;                     // capture: a later push may replace it
    Promise.resolve()
      .then(task)
      .then(() => {
        const cur = entries.get(key);
        if (!cur) return;
        cur.running = false;
        // A newer push arrived while this one was in flight — that one still
        // owes a write, so it is NOT done.
        if (cur.task !== task) { schedule(key, 0); return; }
        clearEntryTimer(cur);
        entries.delete(key);
      })
      .catch((err) => {
        const cur = entries.get(key);
        if (!cur || stopped) return;
        cur.running = false;
        if (cur.attempt >= delays.length) {
          clearEntryTimer(cur);
          entries.delete(key);
          onGiveUp(key, err);
          return;
        }
        const wait = delays[cur.attempt];
        cur.attempt += 1;
        schedule(key, wait);
      });
  };

  const schedule = (key, wait) => {
    const e = entries.get(key);
    if (!e || stopped) return;
    clearEntryTimer(e);
    e.timer = setTimer(() => { e.timer = null; run(key); }, wait);
  };

  return {
    /**
     * Queue `task` under `key`, replacing anything pending for that key and
     * starting the schedule again from the top.
     */
    push(key, task) {
      if (stopped) return;
      const e = entries.get(key);
      if (e) {
        clearEntryTimer(e);
        e.task = task;
        e.attempt = 0;
        if (!e.running) schedule(key, 0);
        return;
      }
      entries.set(key, { task, attempt: 0, timer: null, running: false });
      schedule(key, 0);
    },

    /** True while a key still owes a write. */
    has(key) { return entries.has(key); },

    /** How many keys still owe a write. */
    get size() { return entries.size; },

    /** Forget a key — the caller has decided it no longer matters (a delete). */
    cancel(key) {
      const e = entries.get(key);
      if (!e) return;
      // Also unobservable on its own — a timer that fires after the entry is
      // gone finds nothing and returns. It is here so we do not leave timers
      // running for rows that no longer exist.
      clearEntryTimer(e);
      entries.delete(key);
    },

    /** Drop everything and refuse further work. For unmount / account switch. */
    stop() {
      stopped = true;
      for (const e of entries.values()) clearEntryTimer(e);
      entries.clear();
    },
  };
}
