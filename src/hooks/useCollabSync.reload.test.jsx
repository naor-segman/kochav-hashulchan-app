// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "../test/dom.js";
import { normalizeEvent } from "../utils/eventHelpers.js";

/* Fifth review 30.9 (סב88): what the host did while the shared table could not
 * be reached did not survive a reload. An edit whose push failed was taken back
 * from the table's older copy on the next visit; a guest deleted offline came
 * back from the table on every open. */

vi.mock("../lib/supabase.js", () => ({ isSupabaseConfigured: true, supabase: {} }));
const ROW = { id: "r2", name: "יוסי כהן", phone: "0527654321", side: "groom", guest_group: "חברים", guests_count: 1, companions: [], notes: "" };
vi.mock("../utils/publicTokens.js", () => ({
  fetchCollabGuestsOwner: vi.fn(async () => []),
  upsertCollabGuestOwner: vi.fn(async () => {}),
  deleteCollabGuestsOwner: vi.fn(async () => {}),
  subscribeCollabGuests: vi.fn(() => () => {}),
}));

const { useCollabSync, guestFromCollab } = await import("./useCollabSync.js");
const pub = await import("../utils/publicTokens.js");

const toast = () => {};
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const KEY = "kh_collab_unsent:c1";
function eventWith(guests, extra = {}) {
  return normalizeEvent({ id: "e1", cloudId: "c1", name: "x", guests, ...extra,
    tokens: { rsvp: "a", invite: "b", gift: "c", album: "d", hostess: "e", collab: "f" } });
}

beforeEach(() => { localStorage.clear(); for (const f of Object.values(pub)) f.mockClear?.(); });

describe("useCollabSync — unsent work survives a reload (סב88)", () => {
  it("a push that failed is remembered", async () => {
    pub.fetchCollabGuestsOwner.mockResolvedValueOnce([]);
    pub.upsertCollabGuestOwner.mockRejectedValue(new Error("offline"));
    const ev = eventWith([{ ...guestFromCollab(ROW, null), notes: "צמחוני" }]);
    const patch = vi.fn();
    renderHook(() => useCollabSync(ev, patch, toast));
    await settle(); await settle();
    expect(pub.upsertCollabGuestOwner).toHaveBeenCalled();
    expect(Object.keys(JSON.parse(localStorage.getItem(KEY)))).toEqual(["r2"]);
    pub.upsertCollabGuestOwner.mockReset();
  });

  it("an edit still owed is not replaced by the table's older copy, and is sent", async () => {
    localStorage.setItem(KEY, JSON.stringify(["r2"]));
    pub.fetchCollabGuestsOwner.mockResolvedValueOnce([{ ...ROW }]);
    pub.upsertCollabGuestOwner.mockResolvedValue(undefined);
    const ev = eventWith([{ ...guestFromCollab(ROW, null), notes: "צמחוני" }]);
    const patch = vi.fn();
    renderHook(() => useCollabSync(ev, patch, toast));
    await settle(); await settle();
    for (const [fn] of patch.mock.calls) expect(fn(ev).guests[0].notes).toBe("צמחוני");
    expect(pub.upsertCollabGuestOwner).toHaveBeenCalledWith("c1", expect.objectContaining({ id: "r2", notes: "צמחוני" }));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("a guest deleted here is deleted from the table, not taken back in", async () => {
    pub.fetchCollabGuestsOwner.mockResolvedValueOnce([{ ...ROW }]);
    const ev = eventWith([], { deletedRows: { guests: { r2: Date.now() } } });
    const patch = vi.fn();
    renderHook(() => useCollabSync(ev, patch, toast));
    await settle(); await settle();
    for (const [fn] of patch.mock.calls) expect(fn(ev).guests.some(g => g.id === "r2")).toBe(false);
    expect(pub.deleteCollabGuestsOwner).toHaveBeenCalledWith("c1", ["r2"]);
  });

  it("a row the host never touched still comes in from the table", async () => {
    pub.fetchCollabGuestsOwner.mockResolvedValueOnce([{ ...ROW, notes: "מהמשפחה" }]);
    const ev = eventWith([guestFromCollab(ROW, null)]);
    const patch = vi.fn();
    renderHook(() => useCollabSync(ev, patch, toast));
    await settle();
    const out = patch.mock.calls.map(([fn]) => fn(ev)).find(r => r !== ev);
    expect(out.guests[0].notes).toBe("מהמשפחה");
  });

  // Sixth review 30.9: a mark the table kept refusing held the family's edits
  // out of the host's list for good.
  it("a mark older than the limit lapses: the family's edit comes in again", async () => {
    localStorage.setItem(KEY, JSON.stringify({ r2: Date.now() - 7 * 60 * 60 * 1000 }));
    pub.fetchCollabGuestsOwner.mockResolvedValueOnce([{ ...ROW, notes: "מהמשפחה" }]);
    pub.upsertCollabGuestOwner.mockResolvedValue(undefined);
    const ev = eventWith([guestFromCollab(ROW, null)]);
    const patch = vi.fn();
    renderHook(() => useCollabSync(ev, patch, toast));
    await settle();
    const out = patch.mock.calls.map(([fn]) => fn(ev)).find(r => r !== ev);
    expect(out?.guests[0].notes).toBe("מהמשפחה");
  });

  it("a mark within the limit still protects the host's edit", async () => {
    localStorage.setItem(KEY, JSON.stringify({ r2: Date.now() - 60 * 1000 }));
    pub.fetchCollabGuestsOwner.mockResolvedValueOnce([{ ...ROW }]);
    pub.upsertCollabGuestOwner.mockResolvedValue(undefined);
    const ev = eventWith([{ ...guestFromCollab(ROW, null), notes: "צמחוני" }]);
    const patch = vi.fn();
    renderHook(() => useCollabSync(ev, patch, toast));
    await settle(); await settle();
    for (const [fn] of patch.mock.calls) expect(fn(ev).guests[0].notes).toBe("צמחוני");
  });
});
