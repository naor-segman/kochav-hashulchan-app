// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "../test/dom.js";

/* The server's ceilings (migration 20261004000000_abuse_caps, audit 3.10 S1).
 * A refused write leaves the event on this device and the host told WHICH
 * ceiling — the generic "sync failed" reads as a network blip that a retry will
 * fix, and here no retry can. The error shape is the one PostgREST hands
 * supabase-js for a RAISE in the trigger: message carries `event_quota:<kind>`. */
vi.mock("../lib/supabase.js", () => ({ isSupabaseConfigured: true, supabase: {} }));
const pgError = (message) => Object.assign(new Error(message), { code: "P0001", hint: "x" });
let createFails = null, updateFails = null;
vi.mock("../utils/cloudSync.js", async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    fetchCloudEvents: async () => [],
    createCloudEvent: async () => { if (createFails) throw createFails; return { cloudId: "cloud-1", version: 1 }; },
    updateCloudEvent: async (ev) => { if (updateFails) throw updateFails; return (ev.syncedVersion ?? 0) + 1; },
  };
});
const { useEvents } = await import("./useEvents.js");
const { cloudQuotaNote } = await import("../utils/cloudSync.js");

async function mount() {
  vi.useFakeTimers();
  const h = renderHook(() => useEvents({ id: "u1" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  return h;
}

describe("cloudQuotaNote", () => {
  it("names each ceiling in Hebrew, and nothing else", () => {
    expect(cloudQuotaNote(pgError("event_quota:count — at most 500 events per account"))).toMatch(/מספר האירועים המרבי/);
    expect(cloudQuotaNote(pgError("event_quota:size — payload is 9 bytes"))).toMatch(/גדול מכדי להישמר/);
    expect(cloudQuotaNote(pgError("event_quota:total — the account holds"))).toMatch(/מקום האחסון/);
    for (const n of ["count", "size", "total"]) expect(cloudQuotaNote(pgError(`event_quota:${n}`))).toMatch(/במכשיר הזה בלבד/);
    expect(cloudQuotaNote(pgError("Failed to fetch"))).toBeNull();
    expect(cloudQuotaNote(null)).toBeNull();
  });
});

describe("useEvents: a write refused by a server ceiling", () => {
  it("the 501st event: ERROR with the count note, and the event kept locally", async () => {
    createFails = pgError("event_quota:count — at most 500 events per account"); updateFails = null;
    const h = await mount();
    await act(async () => {
      h.result.current.addEvent({ id: "E", name: "האירוע ה-501" });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(h.result.current.syncStatus).toBe("error");
    expect(h.result.current.syncNote).toMatch(/מספר האירועים המרבי/);
    const ev = h.result.current.events.find(e => e.id === "E");
    expect(ev).toBeTruthy();
    expect(ev.cloudId).toBeNull();
    vi.useRealTimers();
  });

  it("an update over the size ceiling: the size note; an ordinary failure afterwards clears it", async () => {
    createFails = null; updateFails = pgError("event_quota:size — payload is 9000012 bytes, the ceiling is 8000000");
    const h = await mount();
    await act(async () => {
      h.result.current.addEvent({ id: "E", name: "גדול" });
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      h.result.current.patchEventById("E", { venue: "אולם" });
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(h.result.current.syncStatus).toBe("error");
    expect(h.result.current.syncNote).toMatch(/גדול מכדי להישמר/);

    updateFails = pgError("Failed to fetch");
    await act(async () => {
      h.result.current.patchEventById("E", { venue: "אולם אחר" });
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(h.result.current.syncStatus).toBe("error");
    expect(h.result.current.syncNote).toBeNull();
    vi.useRealTimers();
  });
});
