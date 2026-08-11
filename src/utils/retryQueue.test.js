import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRetryQueue, DEFAULT_DELAYS } from "./retryQueue.js";

// Real timers with a 1s first delay would make this suite take half a minute,
// and a fake clock is also the only way to assert WHEN something runs rather
// than merely that it eventually did.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// Let queued promise callbacks run without advancing the clock.
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };

describe("createRetryQueue", () => {
  it("runs the task once when it succeeds", async () => {
    const task = vi.fn().mockResolvedValue();
    const q = createRetryQueue();
    q.push("g1", task);
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
    expect(q.has("g1")).toBe(false);      // nothing owed any more
  });

  it("retries a failing task on the widening schedule", async () => {
    const task = vi.fn().mockRejectedValue(new Error("offline"));
    const q = createRetryQueue();
    q.push("g1", task);
    await flush();
    expect(task).toHaveBeenCalledTimes(1);

    // Nothing happens early — the delay is a delay, not a suggestion.
    await vi.advanceTimersByTimeAsync(DEFAULT_DELAYS[0] - 1);
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(DEFAULT_DELAYS[1]);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("stops after the last delay and says so, once", async () => {
    const task = vi.fn().mockRejectedValue(new Error("offline"));
    const onGiveUp = vi.fn();
    const q = createRetryQueue({ delays: [10, 20], onGiveUp });
    q.push("g1", task);
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(3);          // first try + 2 retries
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(onGiveUp.mock.calls[0][0]).toBe("g1");
    expect(q.has("g1")).toBe(false);

    // And it does not keep firing forever afterwards.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("recovers: the retry that succeeds ends the schedule", async () => {
    const task = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce();
    const q = createRetryQueue({ delays: [10, 20, 30] });
    q.push("g1", task);
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(2);
    expect(q.has("g1")).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(2);          // no further attempts
  });

  it("writes the NEWEST data, not the one that was queued first", async () => {
    // The host fixes a typo while a retry is pending. Writing the typo because
    // it happened to be queued first would be worse than not retrying at all.
    const seen = [];
    const failing = vi.fn(() => { seen.push("typo"); return Promise.reject(new Error("offline")); });
    const fixed   = vi.fn(() => { seen.push("fixed"); return Promise.resolve(); });
    const q = createRetryQueue({ delays: [50, 50] });

    q.push("g1", failing);
    await flush();
    expect(seen).toEqual(["typo"]);

    q.push("g1", fixed);                            // replaces the pending task
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual(["typo", "fixed"]);
    expect(failing).toHaveBeenCalledTimes(1);       // the typo is never rewritten
    expect(q.has("g1")).toBe(false);
  });

  it("resets the attempt count when new data arrives", async () => {
    // Otherwise a row edited during a long outage inherits the old row's
    // exhausted budget and is dropped on its first attempt.
    const task = vi.fn().mockRejectedValue(new Error("offline"));
    const onGiveUp = vi.fn();
    const q = createRetryQueue({ delays: [10], onGiveUp });

    q.push("g1", task);
    await vi.advanceTimersByTimeAsync(15);          // first try + its one retry
    expect(task).toHaveBeenCalledTimes(2);
    expect(onGiveUp).toHaveBeenCalledTimes(1);

    q.push("g1", task);                             // fresh edit, fresh budget
    await vi.advanceTimersByTimeAsync(15);
    expect(task).toHaveBeenCalledTimes(4);
    expect(onGiveUp).toHaveBeenCalledTimes(2);
  });

  it("a slow write that lands after newer data still owes the newer write", async () => {
    // The push SUCCEEDS — slowly — and while it is in flight the host edits the
    // row again. Treating the success as "this key is done" would drop the
    // second edit entirely, which is the same silent loss the queue exists to
    // stop, just on the happy path.
    const seen = [];
    let releaseFirst;
    const slowOld = vi.fn(() => new Promise((res) => {
      seen.push("old");
      releaseFirst = () => { res(); };
    }));
    const newer = vi.fn(() => { seen.push("new"); return Promise.resolve(); });
    const q = createRetryQueue();

    q.push("g1", slowOld);
    await flush();
    expect(seen).toEqual(["old"]);

    q.push("g1", newer);          // arrives while the first is still in flight
    releaseFirst();
    await vi.advanceTimersByTimeAsync(10);

    expect(seen).toEqual(["old", "new"]);
    expect(q.has("g1")).toBe(false);
  });

  it("a pending row that is edited again gets a fresh budget", async () => {
    // Not the same as the give-up case below: here the entry is STILL pending
    // with attempts already spent. Inheriting that count would drop a fresh
    // edit after one try, during exactly the outage it was made in.
    const task = vi.fn().mockRejectedValue(new Error("offline"));
    const onGiveUp = vi.fn();
    const q = createRetryQueue({ delays: [10, 10], onGiveUp });

    q.push("g1", task);
    await vi.advanceTimersByTimeAsync(11);      // first try + one retry spent
    expect(task).toHaveBeenCalledTimes(2);
    expect(q.has("g1")).toBe(true);             // still pending, budget half gone

    q.push("g1", task);                         // fresh edit while still pending
    await vi.advanceTimersByTimeAsync(11);
    expect(task).toHaveBeenCalledTimes(4);      // 2 more, not 1
    expect(onGiveUp).not.toHaveBeenCalled();    // budget was reset, not exhausted
  });

  it("never runs one key twice at the same time", async () => {
    let live = 0, maxLive = 0;
    const slow = () => new Promise((res) => {
      live++; maxLive = Math.max(maxLive, live);
      setTimeout(() => { live--; res(); }, 100);
    });
    const q = createRetryQueue();
    q.push("g1", slow);
    await flush();
    q.push("g1", slow);                             // while the first is in flight
    q.push("g1", slow);
    await vi.advanceTimersByTimeAsync(500);
    expect(maxLive).toBe(1);
  });

  it("keeps separate keys separate", async () => {
    const a = vi.fn().mockRejectedValue(new Error("offline"));
    const b = vi.fn().mockResolvedValue();
    const q = createRetryQueue({ delays: [10] });
    q.push("a", a);
    q.push("b", b);
    await flush();
    expect(q.has("b")).toBe(false);
    expect(q.has("a")).toBe(true);
    expect(q.size).toBe(1);
  });

  it("cancel() forgets a key — the row was deleted, the write is moot", async () => {
    const task = vi.fn().mockRejectedValue(new Error("offline"));
    const q = createRetryQueue({ delays: [10, 10] });
    q.push("g1", task);
    await flush();
    q.cancel("g1");
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(1);
    expect(q.has("g1")).toBe(false);
  });

  it("stop() drops everything and refuses more, for unmount", async () => {
    const task = vi.fn().mockRejectedValue(new Error("offline"));
    const onGiveUp = vi.fn();
    const q = createRetryQueue({ delays: [10, 10], onGiveUp });
    q.push("g1", task);
    await flush();
    q.stop();
    q.push("g2", task);
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(1);
    expect(onGiveUp).not.toHaveBeenCalled();
    expect(q.size).toBe(0);
  });

  it("survives a task that throws synchronously", async () => {
    const task = vi.fn(() => { throw new Error("boom"); });
    const onGiveUp = vi.fn();
    const q = createRetryQueue({ delays: [10], onGiveUp });
    q.push("g1", task);
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(2);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });
});
