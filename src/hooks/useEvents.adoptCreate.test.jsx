// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "../test/dom.js";

/* 33c, the hook's half: a create that comes back with an adopted row (the
 * first create landed, its answer was lost) gives the event its cloudId,
 * merges the row with the local copy, and pushes what only this device has. */
vi.mock("../lib/supabase.js", () => ({ isSupabaseConfigured: true, supabase: {} }));
const updates = [];
vi.mock("../utils/cloudSync.js", async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    fetchCloudEvents: async () => [],
    createCloudEvent: async (ev) => {
      const adopted = actual.mapCloudEventToLocalEvent({
        id: "cloud-1", name: ev.name, type: "חתונה", version: 2,
        created_at: new Date(0).toISOString(), updated_at: new Date(1).toISOString(),
        payload: { localId: ev.id, guests: [{ id: "gCloud", name: "מהענן" }], updatedAt: 1, version: 2 },
      });
      return { cloudId: "cloud-1", version: 2, adopted };
    },
    updateCloudEvent: async (ev) => { updates.push(ev); return (ev.syncedVersion ?? 0) + 1; },
  };
});
const { useEvents } = await import("./useEvents.js");

describe("useEvents adopts a create that already landed (33c)", () => {
  it("gets the cloudId, keeps both sides' guests, and pushes the merge", async () => {
    vi.useFakeTimers();
    const h = renderHook(() => useEvents({ id: "u1" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    await act(async () => {
      h.result.current.addEvent({ id: "E", name: "החתונה", guests: [{ id: "gLocal", name: "מקומי" }] });
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    const ev = h.result.current.events.find(e => e.id === "E");
    expect(ev.cloudId).toBe("cloud-1");
    expect(ev.guests.map(g => g.id).sort()).toEqual(["gCloud", "gLocal"]);
    expect(updates.length).toBeGreaterThan(0);
    const last = updates[updates.length - 1];
    expect(last.cloudId).toBe("cloud-1");
    expect(last.syncedVersion).toBe(2);              // against the row it adopted
    expect(last.guests.map(g => g.id).sort()).toEqual(["gCloud", "gLocal"]);
    vi.useRealTimers();
  });
});
