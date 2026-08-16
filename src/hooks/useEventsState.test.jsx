// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "../test/dom.js";
import { STORAGE_KEY } from "../data/constants.js";

/**
 * useEvents.test.js covers `mergeCloudWithLocal`, which is one exported pure
 * function out of a 434-line hook. Everything else in it was untested, and the
 * untested parts are the ones that decide WHERE a customer's events are written
 * and WHETHER they are written at all:
 *
 *   • the 1500ms debounce — one cloud write per burst of typing, not one per
 *     keystroke, and a delete must cancel the write already queued for a row
 *     that no longer exists;
 *   • `patchEventById` — bumps updatedAt/version on a real edit, and must NOT
 *     bump them (or push) for the internal cloudId-only patch, because that
 *     patch runs immediately after addEvent created the row;
 *   • switching user — logged-in events live under a per-account localStorage
 *     key. Writing them to the shared guest bucket exposes one customer's guest
 *     list, with phone numbers, to whoever opens the browser next.
 *
 * Timers are faked so the debounce is asserted rather than waited on: a real
 * 1500ms sleep per case is both slow and flaky.
 */

vi.mock("../lib/supabase.js", () => ({ isSupabaseConfigured: true, supabase: {} }));
vi.mock("../utils/cloudSync.js", async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    fetchCloudEvents: vi.fn(async () => []),
    createCloudEvent: vi.fn(async () => ({ cloudId: "c-new", version: 1 })),
    updateCloudEvent: vi.fn(async () => 2),
    deleteCloudEvent: vi.fn(async () => {}),
  };
});

const cloud = await import("../utils/cloudSync.js");
const { useEvents } = await import("./useEvents.js");

const USER = { id: "u1" };
const userKey = (id) => `${STORAGE_KEY}::u_${id}`;

const ev = (id, over = {}) => ({
  id, name: "אירוע " + id, type: "חתונה", date: "2027-06-01", venue: "אולם",
  guests: [], tables: [], seating: {}, constraints: [],
  createdAt: 1000, updatedAt: 1000, version: 1, cloudId: null, ...over,
});

const seed = (key, events) => localStorage.setItem(key, JSON.stringify({ events }));
const stored = (key) => JSON.parse(localStorage.getItem(key) || '{"events":[]}').events;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  // A real cloud holds exactly the events that have been pushed to it, so the
  // default mirrors the seeded bucket rather than returning a flat [].
  //
  // This is not tidiness. Since hydration honours a remote delete, "the local
  // bucket has a SYNCED event and the cloud returns nothing" is no longer a
  // neutral fixture — it is the exact shape of "another device deleted this",
  // and every case below that seeds `cloudId: "c1"` was accidentally asserting
  // against that. A test whose setup describes a state the product treats as a
  // deletion cannot also be a test about debouncing.
  //
  // Read lazily inside the mock: `seed()` runs after this, in the test body.
  cloud.fetchCloudEvents.mockReset().mockImplementation(async (uid) => {
    const raw = localStorage.getItem(userKey(uid));
    const evs = raw ? (JSON.parse(raw).events || []) : [];
    return evs.filter(e => e.cloudId);
  });
  cloud.createCloudEvent.mockReset().mockResolvedValue({ cloudId: "c-new", version: 1 });
  cloud.updateCloudEvent.mockReset().mockResolvedValue(2);
  cloud.deleteCloudEvent.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

// RTL's `waitFor` polls on REAL timers and only knows how to detect Jest's fake
// clock, not Vitest's — under vi.useFakeTimers() it never ticks and every case
// here died on the 5s test timeout. Both helpers below drive the clock
// explicitly instead, which is also the honest way to assert a debounce: the
// claim is "nothing at 0ms, exactly one write after 1500ms", and that is a
// statement about the clock, not about how long the test is willing to wait.

/** Flush pending microtasks (hydration, resolved cloud promises) — no clock. */
const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };

/** Advance past the debounce window and let the resulting promises settle. */
const flushDebounce = async () => {
  await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
};

describe("useEvents — patchEventById debounce", () => {
  it("collapses a burst of edits into ONE cloud write", async () => {
    // Typing a venue name is ~15 patches. One request per keystroke is what the
    // debounce exists to prevent, and the last value is the one that must land.
    seed(userKey("u1"), [ev("a", { cloudId: "c1", syncedVersion: 1 })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(1);

    act(() => {
      for (const v of ["ה", "הי", "היכ", "היכל"]) result.current.patchEventById("a", { venue: v });
    });
    expect(cloud.updateCloudEvent).not.toHaveBeenCalled();   // still inside the window

    await flushDebounce();
    expect(cloud.updateCloudEvent).toHaveBeenCalledTimes(1);
    expect(cloud.updateCloudEvent.mock.calls[0][0].venue).toBe("היכל");
  });

  it("waits the full 1500ms — not 0, not 150", async () => {
    // The window LENGTH is the whole feature. A mutation run showed the
    // "one write per burst" test above passes with the delay set to 0, because
    // a 0ms timer still needs a macrotask and the coalescing still works — so
    // the duration has to be asserted against the clock directly. 1500ms is
    // roughly the pause between words: shorter and a thinking host generates a
    // request per word, longer and closing the tab loses the edit.
    seed(userKey("u1"), [ev("a", { cloudId: "c1", syncedVersion: 1 })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();

    act(() => { result.current.patchEventById("a", { venue: "היכל" }); });

    await act(async () => { await vi.advanceTimersByTimeAsync(1499); });
    expect(cloud.updateCloudEvent).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(cloud.updateCloudEvent).toHaveBeenCalledTimes(1);
  });

  it("applies the edit locally IMMEDIATELY — the UI never waits on the network", async () => {
    seed(userKey("u1"), [ev("a", { cloudId: "c1", syncedVersion: 1 })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(1);

    act(() => { result.current.patchEventById("a", { venue: "היכל" }); });
    expect(result.current.events[0].venue).toBe("היכל");
    expect(cloud.updateCloudEvent).not.toHaveBeenCalled();
  });

  it("debounces each event separately", async () => {
    // A shared timer would let an edit to one event cancel the queued write for
    // another, and that second edit would never reach the cloud.
    seed(userKey("u1"), [
      ev("a", { cloudId: "c1", syncedVersion: 1 }),
      ev("b", { cloudId: "c2", syncedVersion: 1 }),
    ]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(2);

    act(() => {
      result.current.patchEventById("a", { venue: "א" });
      result.current.patchEventById("b", { venue: "ב" });
    });
    await flushDebounce();

    expect(cloud.updateCloudEvent).toHaveBeenCalledTimes(2);
    expect(cloud.updateCloudEvent.mock.calls.map(c => c[0].id).sort()).toEqual(["a", "b"]);
  });

  it("cancels the queued write for an event that gets deleted first", async () => {
    // Otherwise the debounced push fires 1500ms after the delete and writes the
    // row straight back — the classic delete-that-does-not-stick.
    seed(userKey("u1"), [ev("a", { cloudId: "c1", syncedVersion: 1 })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(1);

    act(() => { result.current.patchEventById("a", { venue: "היכל" }); });
    act(() => { result.current.removeEvent("a"); });
    await flushDebounce();

    expect(cloud.updateCloudEvent).not.toHaveBeenCalled();
    expect(cloud.deleteCloudEvent).toHaveBeenCalledWith("c1", "u1");
  });

  it("does not touch the cloud at all for a guest (no user)", async () => {
    seed(STORAGE_KEY, [ev("a")]);
    const { result } = renderHook(() => useEvents(null));

    act(() => { result.current.patchEventById("a", { venue: "היכל" }); });
    await flushDebounce();

    expect(cloud.updateCloudEvent).not.toHaveBeenCalled();
    expect(cloud.createCloudEvent).not.toHaveBeenCalled();
    expect(stored(STORAGE_KEY)[0].venue).toBe("היכל");
  });
});

describe("useEvents — patchEventById semantics", () => {
  it("bumps updatedAt and version on a real edit", async () => {
    // Both are load-bearing: `updatedAt` is the last-write-wins comparison in
    // mergeCloudWithLocal, `version` is the optimistic-concurrency base.
    seed(userKey("u1"), [ev("a", { cloudId: "c1", syncedVersion: 1, updatedAt: 1000, version: 1 })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(1);

    act(() => { result.current.patchEventById("a", { venue: "היכל" }); });
    const out = result.current.events[0];
    expect(out.version).toBe(2);
    expect(out.updatedAt).toBeGreaterThan(1000);
  });

  it("leaves updatedAt/version ALONE for the internal cloudId-only patch", async () => {
    // addEvent writes the freshly-minted cloudId back through this same
    // function. Bumping the version there makes the row look edited-since-sync
    // the instant it was created, and fires a pointless push over a row nobody
    // touched.
    seed(userKey("u1"), [ev("a", { updatedAt: 1000, version: 1 })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(1);

    act(() => { result.current.patchEventById("a", { cloudId: "c9" }); });
    const out = result.current.events[0];
    expect(out.cloudId).toBe("c9");
    expect(out.version).toBe(1);
    expect(out.updatedAt).toBe(1000);

    await flushDebounce();
    expect(cloud.updateCloudEvent).not.toHaveBeenCalled();
    expect(cloud.createCloudEvent).not.toHaveBeenCalled();
  });

  it("treats cloudId ALONGSIDE another field as a normal edit", async () => {
    // The shortcut is keyed on "exactly one key, and it is cloudId". A looser
    // `"cloudId" in patch` test would silently drop the other field's sync.
    seed(userKey("u1"), [ev("a", { updatedAt: 1000, version: 1 })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(1);

    act(() => { result.current.patchEventById("a", { cloudId: "c9", venue: "היכל" }); });
    expect(result.current.events[0].version).toBe(2);
  });

  it("accepts a function patch and hands it the current row", async () => {
    // Every screen that appends to a list uses this form — `e => ({...e,
    // guests: [...e.guests, g]})`. Treating a function as an object would spread
    // its properties and wipe the event.
    seed(userKey("u1"), [ev("a", { cloudId: "c1", syncedVersion: 1 })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(1);

    act(() => {
      result.current.patchEventById("a", e => ({ ...e, guests: [{ id: "g1", name: "דנה", count: 4 }] }));
    });
    expect(result.current.events[0].guests).toEqual([{ id: "g1", name: "דנה", count: 4 }]);
    expect(result.current.events[0].name).toBe("אירוע a");   // untouched fields survive
  });

  it("changes nothing when the id does not match any event", async () => {
    seed(userKey("u1"), [ev("a", { cloudId: "c1", syncedVersion: 1 })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(1);
    const before = result.current.events[0];

    act(() => { result.current.patchEventById("nope", { venue: "היכל" }); });
    expect(result.current.events[0]).toBe(before);
    await flushDebounce();
    expect(cloud.updateCloudEvent).not.toHaveBeenCalled();
  });
});

describe("useEvents — retrying a create that never landed", () => {
  it("creates the row on the next edit when the first create failed", async () => {
    // Offline on the train when the event was made. Without the retry the event
    // stayed local-only for good: every later edit hit an early return, so an
    // hour of guest entry existed on one browser and left with its cache.
    seed(userKey("u1"), [ev("a", { cloudId: null })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(1);

    act(() => { result.current.patchEventById("a", { venue: "היכל" }); });
    await flushDebounce();

    expect(cloud.createCloudEvent).toHaveBeenCalledTimes(1);
    expect(result.current.events[0].cloudId).toBe("c-new");
  });

  it("pushes the edit that TRIGGERED the retry, not just the row", async () => {
    // Without this the one change that caused the retry is the one change the
    // cloud never receives.
    seed(userKey("u1"), [ev("a", { cloudId: null })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(1);

    act(() => { result.current.patchEventById("a", { venue: "היכל" }); });
    await flushDebounce();

    expect(cloud.updateCloudEvent).toHaveBeenCalled();
    expect(cloud.updateCloudEvent.mock.calls.at(-1)[0].venue).toBe("היכל");
  });

  it("never fires a SECOND create while the first is still in flight", async () => {
    // Two edits 1500ms apart during a slow create fired two creates for one
    // event. The unique token indexes turn that into an error rather than a
    // duplicate row, so it surfaced as a spurious "sync failed" AND the second
    // snapshot was never pushed.
    let release;
    cloud.createCloudEvent.mockImplementation(
      () => new Promise(res => { release = () => res({ cloudId: "c-new", version: 1 }); })
    );
    seed(userKey("u1"), [ev("a", { cloudId: null })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(1);

    act(() => { result.current.patchEventById("a", { venue: "א" }); });
    await flushDebounce();
    expect(cloud.createCloudEvent).toHaveBeenCalledTimes(1);

    act(() => { result.current.patchEventById("a", { venue: "ב" }); });
    await flushDebounce();
    expect(cloud.createCloudEvent).toHaveBeenCalledTimes(1);   // still one

    await act(async () => { release(); await vi.advanceTimersByTimeAsync(0); });
  });
});

describe("useEvents — switching user", () => {
  it("writes a logged-in account's events under ITS OWN key, never the guest bucket", async () => {
    // The guest bucket is readable by the next person to open this browser.
    // Persisting a customer's guest list — names and phone numbers — there is
    // the worst bug this hook can have.
    seed(userKey("u1"), [ev("a", { cloudId: "c1", syncedVersion: 1 })]);
    const { result } = renderHook(() => useEvents(USER));
    await settle();
    expect(result.current.events).toHaveLength(1);

    act(() => { result.current.patchEventById("a", { venue: "היכל" }); });

    expect(stored(userKey("u1"))[0].venue).toBe("היכל");
    expect(stored(STORAGE_KEY)).toHaveLength(0);
  });

  it("shows a guest only local drafts, never a synced event left in the shared bucket", async () => {
    // Older builds used one global key. A cloudId-bearing row still sitting in
    // the shared bucket belongs to whoever was logged in then.
    seed(STORAGE_KEY, [ev("draft"), ev("leftover", { cloudId: "c9" })]);
    const { result } = renderHook(() => useEvents(null));

    expect(result.current.events.map(e => e.id)).toEqual(["draft"]);
  });

  it("adopts guest drafts on login and REMOVES them from the shared bucket", async () => {
    // "Continue without an account, it'll sync later" is honoured — but the
    // draft must not stay behind where a different account could adopt it too.
    seed(STORAGE_KEY, [ev("draft")]);
    seed(userKey("u1"), [ev("mine", { cloudId: "c1", syncedVersion: 1 })]);
    const { result } = renderHook(() => useEvents(USER));

    await settle();
    expect(result.current.events).toHaveLength(2);
    expect(result.current.events.map(e => e.id).sort()).toEqual(["draft", "mine"]);
    expect(stored(STORAGE_KEY)).toHaveLength(0);
  });

  it("never pulls another account's already-synced events out of the shared bucket", async () => {
    seed(STORAGE_KEY, [ev("theirs", { cloudId: "c-theirs" })]);
    const { result } = renderHook(() => useEvents(USER));

    await settle();
    expect(cloud.fetchCloudEvents).toHaveBeenCalled();
    expect(result.current.events.map(e => e.id)).not.toContain("theirs");
  });

  it("drops back to the guest bucket on logout, keeping the account's own copy", async () => {
    seed(userKey("u1"), [ev("mine", { cloudId: "c1", syncedVersion: 1 })]);
    seed(STORAGE_KEY, []);
    const { result, rerender } = renderHook(({ u }) => useEvents(u), {
      initialProps: { u: USER },
    });
    await settle();
    expect(result.current.events).toHaveLength(1);

    rerender({ u: null });

    await settle();
    expect(result.current.events).toHaveLength(0);
    // The account's data is still where it belongs, not deleted and not moved.
    expect(stored(userKey("u1")).map(e => e.id)).toEqual(["mine"]);
  });

  it("swaps the whole view when a DIFFERENT account signs in on the same browser", async () => {
    seed(userKey("u1"), [ev("a1", { cloudId: "c1", syncedVersion: 1 })]);
    seed(userKey("u2"), [ev("b1", { cloudId: "c2", syncedVersion: 1 })]);
    const { result, rerender } = renderHook(({ u }) => useEvents(u), {
      initialProps: { u: USER },
    });
    await settle();
    expect(result.current.events.map(e => e.id)).toEqual(["a1"]);

    rerender({ u: { id: "u2" } });

    await settle();
    expect(result.current.events.map(e => e.id)).toEqual(["b1"]);
    expect(stored(userKey("u1")).map(e => e.id)).toEqual(["a1"]);
  });

  it("re-hydrates only once per account, not on every new user object identity", async () => {
    // useAuth hands back a NEW object for the same person on every token
    // refresh. Re-fetching on identity would re-query roughly hourly, and a
    // refresh landing mid-hydration once cancelled the fetch and never
    // replaced it — syncStatus stayed SYNCING forever.
    seed(userKey("u1"), []);
    const { rerender } = renderHook(({ u }) => useEvents(u), { initialProps: { u: { id: "u1" } } });
    await settle();
    expect(cloud.fetchCloudEvents).toHaveBeenCalledTimes(1);

    rerender({ u: { id: "u1" } });     // same person, new object
    rerender({ u: { id: "u1" } });

    expect(cloud.fetchCloudEvents).toHaveBeenCalledTimes(1);
  });
});

// ── Two devices, one account ─────────────────────────────────────────────────
//
// Reported from the owner's own account: events deleted on the desktop were
// still on the phone, and the phone then offered to sync them back.
//
// Everything above drives ONE device. This drives two against a shared cloud,
// because that is where the bug lived — not in either device's behaviour on its
// own, but in what the second one concludes from the first one's delete. The
// cloud here is a plain array: whatever deleteCloudEvent removes from it is
// what the other device's fetch does not find.
describe("two devices on one account", () => {
  let cloudRows;   // the shared "server"

  const asDevice = (localBucket) => {
    localStorage.clear();
    if (localBucket) seed(userKey("u1"), localBucket);
  };

  beforeEach(() => {
    cloudRows = [];
    cloud.fetchCloudEvents.mockReset().mockImplementation(async () => cloudRows.map(r => ({ ...r })));
    cloud.deleteCloudEvent.mockReset().mockImplementation(async (cloudId) => {
      cloudRows = cloudRows.filter(r => r.cloudId !== cloudId);
    });
    cloud.createCloudEvent.mockReset().mockImplementation(async (e) => {
      cloudRows.push({ ...e, cloudId: "c-" + e.id, syncedVersion: 1 });
      return { cloudId: "c-" + e.id, version: 1 };
    });
    cloud.updateCloudEvent.mockReset().mockResolvedValue(2);
  });

  it("a delete on the desktop removes it from the phone too", async () => {
    // The event exists on both devices and in the cloud.
    const shared = ev("wedding", { cloudId: "c-wedding", syncedVersion: 1 });
    cloudRows = [shared];

    // DESKTOP: loads it, deletes it.
    asDevice([shared]);
    const desktop = renderHook(() => useEvents(USER));
    await settle();
    expect(desktop.result.current.events).toHaveLength(1);
    act(() => { desktop.result.current.removeEvent("wedding"); });
    await settle();
    expect(desktop.result.current.events).toEqual([]);
    expect(cloudRows).toEqual([]);           // the cloud row is gone
    desktop.unmount();

    // PHONE: still holds its own copy — nothing ever told it about the delete.
    asDevice([shared]);
    const phone = renderHook(() => useEvents(USER));
    await settle();
    expect(phone.result.current.events.map(e => e.id)).toEqual([]);
  });

  it("and does not take the unsynced draft on the phone down with it", async () => {
    const shared = ev("wedding", { cloudId: "c-wedding", syncedVersion: 1 });
    const draft  = ev("draft", { cloudId: null });
    cloudRows = [];                          // desktop already deleted the shared one

    asDevice([shared, draft]);
    const phone = renderHook(() => useEvents(USER));
    await settle();
    expect(phone.result.current.events.map(e => e.id)).toEqual(["draft"]);
  });

  it("an event added on the phone shows up on the desktop", async () => {
    asDevice([]);
    const phone = renderHook(() => useEvents(USER));
    await settle();
    act(() => { phone.result.current.addEvent({ name: "בר מצווה של איתי", type: "בר מצווה" }); });
    await settle();
    expect(cloudRows).toHaveLength(1);
    phone.unmount();

    asDevice([]);
    const desktop = renderHook(() => useEvents(USER));
    await settle();
    expect(desktop.result.current.events.map(e => e.name)).toEqual(["בר מצווה של איתי"]);
  });

  // The failure the delete fix could have introduced: hydration reads the
  // cloud, the host creates an event before the answer arrives, and the answer
  // — which predates the create — is read as "it was deleted".
  it("does not delete an event created while hydration was still in flight", async () => {
    asDevice([]);
    let release;
    cloud.fetchCloudEvents.mockImplementation(
      () => new Promise(res => { release = () => res([]); })
    );

    const device = renderHook(() => useEvents(USER));
    await settle();
    act(() => { device.result.current.addEvent({ name: "חינה", type: "חינה" }); });
    await settle();
    expect(device.result.current.events).toHaveLength(1);

    // Now the in-flight hydration finally answers, with a list from before it.
    await act(async () => { release(); await vi.advanceTimersByTimeAsync(0); });
    expect(device.result.current.events.map(e => e.name)).toEqual(["חינה"]);
  });
});
