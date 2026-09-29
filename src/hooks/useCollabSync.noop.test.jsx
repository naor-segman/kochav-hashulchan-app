// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "../test/dom.js";
import { normalizeEvent } from "../utils/eventHelpers.js";

/* סב56 (third review 30.9). The pull runs on every visit to an event page with
 * its "already reflected" map empty, so every complete row in the shared table
 * became a patch — and every patch a real edit: new version, new updatedAt, a
 * cloud write. About a dozen per page load, with nothing changed. */

vi.mock("../lib/supabase.js", () => ({ isSupabaseConfigured: true, supabase: {} }));
const ROWS = [
  { id: "r1", name: "דודה רינה", phone: "0501234567", side: "bride", guest_group: "משפחה קרובה", guests_count: 2, companions: [], notes: "" },
  { id: "r2", name: "יוסי כהן",  phone: "0527654321", side: "groom", guest_group: "חברים",       guests_count: 1, companions: [], notes: "צמחוני" },
];
vi.mock("../utils/publicTokens.js", () => ({
  fetchCollabGuestsOwner: vi.fn(async () => ROWS.map(r => ({ ...r }))),
  upsertCollabGuestOwner: vi.fn(async () => {}),
  deleteCollabGuestsOwner: vi.fn(async () => {}),
  subscribeCollabGuests: vi.fn(() => () => {}),
}));

const { useCollabSync, guestFromCollab } = await import("./useCollabSync.js");

const toast = () => {};
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

function eventWith(guests) {
  return normalizeEvent({ id: "e1", cloudId: "c1", name: "x", guests,
    tokens: { rsvp: "a", invite: "b", gift: "c", album: "d", hostess: "e", collab: "f" } });
}

describe("useCollabSync — a visit changes nothing that is already in step (סב56)", () => {
  it("rows the guest list already reflects produce no edit", async () => {
    // The list as a previous visit left it (and as localStorage hands it back).
    const ev = eventWith(ROWS.map(r => guestFromCollab(r, null)));
    const patch = vi.fn();
    renderHook(() => useCollabSync(ev, patch, toast));
    await settle();
    expect(patch).toHaveBeenCalled();
    for (const [fn] of patch.mock.calls) expect(fn(ev)).toBe(ev);
  });

  it("a row the family actually changed is still applied", async () => {
    const stale = ROWS.map(r => guestFromCollab(r, null));
    stale[1] = { ...stale[1], notes: "" };        // the note was added in the shared table
    const ev = eventWith(stale);
    const patch = vi.fn();
    renderHook(() => useCollabSync(ev, patch, toast));
    await settle();
    const results = patch.mock.calls.map(([fn]) => fn(ev));
    const changed = results.filter(r => r !== ev);
    expect(changed).toHaveLength(1);
    expect(changed[0].guests.find(g => g.id === "r2").notes).toBe("צמחוני");
  });
});
