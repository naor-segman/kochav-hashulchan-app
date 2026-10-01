// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
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

const { useCollabSync, guestFromCollab, guestToCollab } = await import("./useCollabSync.js");
const pub = await import("../utils/publicTokens.js");

const toast = () => {};
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

function eventWith(guests) {
  return normalizeEvent({ id: "e1", cloudId: "c1", name: "x", guests,
    tokens: { rsvp: "a", invite: "b", gift: "c", album: "d", hostess: "e", collab: "f" } });
}

// Each case is a first visit: no last-agreed rows left behind by the one
// before (89 — the hook now remembers them in localStorage per event).
beforeEach(() => { localStorage.clear(); });

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

  // Fourth review 30.9 (a regression from סב44): the host's push is clipped to
  // the table's widths; its echo — realtime, or the next visit's pull — was
  // applied back over the host's list, replacing the full value.
  it("the clipped copy of the host's own row never replaces the full value", async () => {
    const long = "אמא 050-1234567, אבא 052-7654321, סבתא 03-1234567";   // 49 characters
    const host = { id: "r9", name: "משפחת כהן", phone: long, side: "bride", group: "משפחה", count: 2,
                   companions: ["דנה"], notes: "", rsvp: "pending", meal: "רגיל" };
    const ev = eventWith([host]);
    expect(guestToCollab(ev.guests[0]).phone).toHaveLength(40);
    pub.fetchCollabGuestsOwner.mockResolvedValueOnce([guestToCollab(ev.guests[0])]);
    const patch = vi.fn();
    renderHook(() => useCollabSync(ev, patch, toast));
    await settle();
    for (const [fn] of patch.mock.calls) expect(fn(ev).guests[0].phone).toBe(long);
  });

  it("a relative editing another field of that row does not clip the host's value either", async () => {
    const long = "050-1234567 סבתא, 052-7654321 דודה רחל, 054-0";   // 45 characters
    const host = { id: "r8", name: "משפחת לוי", phone: long, side: "bride", group: "משפחה", count: 1,
                   companions: [], notes: "", rsvp: "pending", meal: "רגיל" };
    const ev = eventWith([host]);
    pub.fetchCollabGuestsOwner.mockResolvedValueOnce([{ ...guestToCollab(ev.guests[0]), notes: "צמחונית" }]);
    const patch = vi.fn();
    renderHook(() => useCollabSync(ev, patch, toast));
    await settle();
    const out = patch.mock.calls.map(([fn]) => fn(ev)).find(r => r !== ev);
    expect(out.guests[0].notes).toBe("צמחונית");   // the relative's edit applies
    expect(out.guests[0].phone).toBe(long);         // the host's full phone stays
  });
});
