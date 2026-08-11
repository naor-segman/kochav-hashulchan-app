// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "../test/dom.js";

/**
 * useMigration is the only ONE-WAY operation a customer can start from the UI:
 * it lifts every local-only event into their cloud account, and there is no
 * "undo" anywhere in the product.
 *
 * Two failure modes are unrecoverable and neither throws:
 *   • migrating an event that is ALREADY in the cloud — the customer's event
 *     list silently doubles, and the duplicate carries its own public tokens,
 *     so half the QR codes they printed point at the wrong copy.
 *   • storing `cloudId` without `syncedVersion` — the first edit after
 *     migrating has no concurrency base, so updateCloudEvent conflicts forever
 *     and the event stops syncing for good.
 *
 * `isSupabaseConfigured` is false in the test environment (no VITE_ env vars),
 * which would make every path in this hook a no-op, so the module is mocked.
 * The cloud calls are mocked too — the point here is the ORDER and the GUARDS,
 * not Supabase's wire format, which cloudSync.test.js covers.
 */

vi.mock("../lib/supabase.js", () => ({ isSupabaseConfigured: true, supabase: {} }));
vi.mock("../utils/cloudSync.js", () => ({
  fetchCloudEvents:  vi.fn(async () => []),
  createCloudEvent:  vi.fn(async () => ({ cloudId: "cloud-new", version: 1 })),
}));

const { fetchCloudEvents, createCloudEvent } = await import("../utils/cloudSync.js");
const { useMigration, MIGRATION_STATUS } = await import("./useMigration.js");

const USER = { id: "u1" };
const KEY = "kochav_migration_dismissed_u1";

const ev = (id, over = {}) => ({
  id, name: "אירוע " + id, type: "חתונה", cloudId: null,
  guests: [], tables: [], seating: {}, constraints: [], ...over,
});

/** Mount the hook with a stable `events` array and a spy patcher. */
function mount(events, user = USER) {
  const patch = vi.fn();
  const view = renderHook(() => useMigration(events, patch, user));
  return { ...view, patch };
}

beforeEach(() => {
  localStorage.clear();
  fetchCloudEvents.mockReset().mockResolvedValue([]);
  createCloudEvent.mockReset().mockResolvedValue({ cloudId: "cloud-new", version: 1 });
});
afterEach(() => { localStorage.clear(); });

describe("useMigration — the prompt", () => {
  it("offers to migrate when local events are missing from the cloud", async () => {
    const { result } = mount([ev("a"), ev("b")]);
    await waitFor(() => expect(result.current.shouldPrompt).toBe(true));
    expect(fetchCloudEvents).toHaveBeenCalledWith("u1");
  });

  it("stays quiet when the cloud already has every local event", async () => {
    // Same LOCAL id on the cloud row — the event was migrated on another device
    // and this browser's copy simply never learned its cloudId.
    fetchCloudEvents.mockResolvedValue([ev("a", { cloudId: "c1" })]);
    const { result } = mount([ev("a")]);
    await waitFor(() => expect(fetchCloudEvents).toHaveBeenCalled());
    expect(result.current.shouldPrompt).toBe(false);
  });

  it("does not ask the cloud at all when nothing is unsynced", async () => {
    mount([ev("a", { cloudId: "c1" }), ev("b", { cloudId: "c2" })]);
    await Promise.resolve();
    expect(fetchCloudEvents).not.toHaveBeenCalled();
  });

  it("never nags an account that already skipped", async () => {
    localStorage.setItem(KEY, "1");
    const { result } = mount([ev("a")]);
    await Promise.resolve();
    expect(fetchCloudEvents).not.toHaveBeenCalled();
    expect(result.current.shouldPrompt).toBe(false);
  });

  it("keys the skip flag PER ACCOUNT, not per browser", async () => {
    // Two people share a laptop. One skipping must not silently strand the
    // other's local events outside their account forever.
    localStorage.setItem(KEY, "1");
    const { result } = mount([ev("a")], { id: "u2" });
    await waitFor(() => expect(result.current.shouldPrompt).toBe(true));
  });

  it("stays quiet, rather than crashing, when the cloud is unreachable", async () => {
    // Offline on the train. A rejected fetch here must not surface as a prompt
    // whose migrate() would then fail too.
    fetchCloudEvents.mockRejectedValue(new Error("network"));
    const { result } = mount([ev("a")]);
    await Promise.resolve();
    await Promise.resolve();
    expect(result.current.shouldPrompt).toBe(false);
    expect(result.current.status).toBe(MIGRATION_STATUS.IDLE);
  });

  it("asks the cloud once per login, not once per keystroke", async () => {
    // The effect deliberately excludes `events`; depending on it would re-ask
    // on every edit. Same user object identity or not, one fetch.
    const { rerender } = mount([ev("a")]);
    await waitFor(() => expect(fetchCloudEvents).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(fetchCloudEvents).toHaveBeenCalledTimes(1);
  });

  it("counts unsynced events for the banner", () => {
    const { result } = mount([ev("a"), ev("b"), ev("c", { cloudId: "c1" })]);
    expect(result.current.unsyncedCount).toBe(2);
  });
});

describe("useMigration — migrate() is one-way, so it must be duplicate-safe", () => {
  it("re-reads the cloud and skips events that arrived there meanwhile", async () => {
    // The customer pressed migrate on their phone two minutes ago. Uploading
    // "a" again gives them the same wedding twice, each with its own tokens.
    fetchCloudEvents.mockResolvedValue([ev("a", { cloudId: "c1" })]);
    const { result } = mount([ev("a"), ev("b")]);

    await act(async () => { await result.current.migrate(); });

    expect(createCloudEvent).toHaveBeenCalledTimes(1);
    expect(createCloudEvent.mock.calls[0][0].id).toBe("b");
    expect(createCloudEvent.mock.calls[0][1]).toBe("u1");
  });

  it("never re-uploads an event that already carries a cloudId", async () => {
    const { result } = mount([ev("a", { cloudId: "c1" }), ev("b")]);
    await act(async () => { await result.current.migrate(); });

    expect(createCloudEvent).toHaveBeenCalledTimes(1);
    expect(createCloudEvent.mock.calls[0][0].id).toBe("b");
  });

  it("stores cloudId AND syncedVersion, so the first edit after has a base", async () => {
    // cloudId alone looks migrated and syncs once. Without syncedVersion the
    // optimistic-concurrency update has nothing to compare against and the
    // event conflicts on every subsequent push.
    createCloudEvent.mockResolvedValue({ cloudId: "c-new", version: 7 });
    const { result, patch } = mount([ev("a")]);

    await act(async () => { await result.current.migrate(); });

    expect(patch).toHaveBeenCalledWith("a", { cloudId: "c-new", syncedVersion: 7 });
  });

  it("reports progress as done/total across several events", async () => {
    const { result } = mount([ev("a"), ev("b"), ev("c")]);
    await act(async () => { await result.current.migrate(); });

    expect(result.current.progress).toEqual({ done: 3, total: 3 });
    expect(result.current.status).toBe(MIGRATION_STATUS.SUCCESS);
  });

  it("marks the account done so the banner cannot start a second run", async () => {
    const { result } = mount([ev("a")]);
    await act(async () => { await result.current.migrate(); });

    expect(localStorage.getItem(KEY)).toBe("1");
    expect(result.current.shouldPrompt).toBe(false);
  });

  it("does nothing at all without a logged-in user", async () => {
    const { result } = mount([ev("a")], null);
    await act(async () => { await result.current.migrate(); });

    expect(createCloudEvent).not.toHaveBeenCalled();
    expect(result.current.status).toBe(MIGRATION_STATUS.IDLE);
  });
});

describe("useMigration — failure", () => {
  it("surfaces the reason and does NOT mark the account done", async () => {
    // Marking it dismissed on failure is the worst case: the events stayed
    // local, and the banner that would have offered to try again is gone.
    createCloudEvent.mockRejectedValue(new Error("row-level security"));
    const { result } = mount([ev("a")]);

    await act(async () => { await result.current.migrate(); });

    expect(result.current.status).toBe(MIGRATION_STATUS.FAILED);
    expect(result.current.error).toBe("row-level security");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps the events already uploaded before the failure", async () => {
    // Partial progress must survive: re-running migrate() re-reads the cloud
    // and skips them, but only if their cloudId was written locally first.
    createCloudEvent
      .mockResolvedValueOnce({ cloudId: "c-a", version: 1 })
      .mockRejectedValueOnce(new Error("boom"));
    const { result, patch } = mount([ev("a"), ev("b")]);

    await act(async () => { await result.current.migrate(); });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith("a", { cloudId: "c-a", syncedVersion: 1 });
    expect(result.current.status).toBe(MIGRATION_STATUS.FAILED);
  });

  it("falls back to a Hebrew message when the error carries none", async () => {
    createCloudEvent.mockRejectedValue({});
    const { result } = mount([ev("a")]);
    await act(async () => { await result.current.migrate(); });
    expect(result.current.error).toBe("שגיאה בייבוא האירועים");
  });

  it("retries cleanly after a failure", async () => {
    createCloudEvent.mockRejectedValueOnce(new Error("boom"));
    const { result } = mount([ev("a")]);

    await act(async () => { await result.current.migrate(); });
    expect(result.current.status).toBe(MIGRATION_STATUS.FAILED);

    await act(async () => { await result.current.migrate(); });
    expect(result.current.status).toBe(MIGRATION_STATUS.SUCCESS);
    expect(result.current.error).toBeNull();
  });
});

describe("useMigration — dismiss()", () => {
  it("writes the per-account flag and clears the banner", async () => {
    const { result } = mount([ev("a")]);
    await waitFor(() => expect(result.current.shouldPrompt).toBe(true));

    act(() => { result.current.dismiss(); });

    expect(localStorage.getItem(KEY)).toBe("1");
    expect(result.current.shouldPrompt).toBe(false);
    expect(result.current.status).toBe(MIGRATION_STATUS.IDLE);
    expect(result.current.error).toBeNull();
  });

  it("does not migrate anything", async () => {
    // The button next to it does. Swapping them runs an irreversible upload on
    // somebody who pressed "skip".
    const { result, patch } = mount([ev("a")]);
    act(() => { result.current.dismiss(); });
    expect(createCloudEvent).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });
});
