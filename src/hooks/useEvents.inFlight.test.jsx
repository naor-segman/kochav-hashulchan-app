// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "../test/dom.js";

/* 71b: a push slower than the 1.5 s debounce was joined by a second push with
 * the SAME base version; the server rejected it as a conflict and an ordinary
 * edit went through the conflict recovery. One push per event on the wire. */
vi.mock("../lib/supabase.js", () => ({ isSupabaseConfigured: true, supabase: {} }));
let serverVersion = 1;
const log = [];
vi.mock("../utils/cloudSync.js", async (orig) => {
  const actual = await orig();
  return { ...actual,
    fetchCloudEvents: async () => { log.push("fetch"); return []; },
    createCloudEvent: async () => ({ cloudId: "c1", version: 1 }),
    updateCloudEvent: (ev) => new Promise((res, rej) => {
      log.push(`update base=${ev.syncedVersion} venue=${ev.venue}`);
      setTimeout(() => {
        if (ev.syncedVersion !== serverVersion) { log.push("CONFLICT"); rej(new actual.CloudConflictError()); return; }
        serverVersion += 1; res(serverVersion);
      }, 3000);
    }),
  };
});
const { useEvents } = await import("./useEvents.js");
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("one push per event in flight (71b)", () => {
  it("an edit made while a slow push is on the wire is sent after it, with no conflict", async () => {
    vi.useFakeTimers();
    const h = renderHook(() => useEvents({ id: "u1" }));
    await tick(10);
    await act(async () => { h.result.current.addEvent({ id: "E", name: "a" }); await vi.advanceTimersByTimeAsync(10); });
    await tick(4000);                          // nothing to follow the create
    log.length = 0;
    act(() => { h.result.current.patchEventById("E", { venue: "v1" }); });
    await tick(2000);                          // push #1 on the wire (lands at 4.5 s)
    act(() => { h.result.current.patchEventById("E", { venue: "v2" }); });
    for (let i = 0; i < 100; i++) await tick(100);
    expect(log).not.toContain("CONFLICT");
    expect(log).not.toContain("fetch");
    expect(log.filter(l => l.startsWith("update"))).toEqual(["update base=1 venue=v1", "update base=2 venue=v2"]);
    const ev = h.result.current.events.find(e => e.id === "E");
    expect(ev.venue).toBe("v2");
    expect(ev.version).toBe(ev.syncedVersion);   // in step
    vi.useRealTimers();
  });
});
