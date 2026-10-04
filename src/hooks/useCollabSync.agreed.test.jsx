// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { renderHook, act } from "../test/dom.js";
import { normalizeEvent } from "../utils/eventHelpers.js";

/* 89 / 57b: the shared table merged with the host's list per field against the
 * last row both agreed on — kept in localStorage, because every one of these
 * happened across a reload. */

vi.mock("../lib/supabase.js", () => ({ isSupabaseConfigured: true, supabase: {} }));
vi.mock("../utils/publicTokens.js", () => ({
  fetchCollabGuestsOwner: vi.fn(async () => []),
  upsertCollabGuestOwner: vi.fn(async () => {}),
  deleteCollabGuestsOwner: vi.fn(async () => {}),
  subscribeCollabGuests: vi.fn(() => () => {}),
}));
const { useCollabSync, guestFromCollab, guestToCollab } = await import("./useCollabSync.js");
const pub = await import("../utils/publicTokens.js");

const ROW  = { id: "r2", name: "יוסי כהן", phone: "0527654321", side: "groom", guest_group: "חברים", guests_count: 2, companions: ["רותי"], notes: "" };
const ROW3 = { id: "r3", name: "דנה לוי", phone: "0501112222", side: "bride", guest_group: "משפחה", guests_count: 1, companions: [], notes: "" };
const AGREED = "kh_collab_synced:c1";
const UNSENT = "kh_collab_unsent:c1";
const toast = () => {};
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const eventWith = (guests) => normalizeEvent({ id: "e1", cloudId: "c1", name: "x", guests,
  tokens: { rsvp: "a", invite: "b", gift: "c", album: "d", hostess: "e", collab: "f" } });
const agreeOn = (...rows) => localStorage.setItem(AGREED, JSON.stringify(Object.fromEntries(rows.map(r => [r.id, guestToCollab(guestFromCollab(r, null))]))));
// The event lives in real React state, as in the app: a patch re-renders and
// the push effect sees the patched guests — not a frozen copy.
const run = async (ev) => {
  const h = renderHook(() => {
    const [e, setE] = useState(ev);
    useCollabSync(e, setE, toast);
    return e;
  });
  await settle(); await settle(); await settle();
  return { h, after: h.result.current };
};

beforeEach(() => { localStorage.clear(); for (const f of Object.values(pub)) f.mockReset?.();
  pub.fetchCollabGuestsOwner.mockResolvedValue([]); pub.upsertCollabGuestOwner.mockResolvedValue(undefined);
  pub.deleteCollabGuestsOwner.mockResolvedValue(undefined); pub.subscribeCollabGuests.mockReturnValue(() => {}); });

describe("per-field merge against the last agreed row (89)", () => {
  it("#6: a relative's in-progress (incomplete) edit is not overwritten by the host's unchanged copy", async () => {
    agreeOn(ROW, ROW3);
    pub.fetchCollabGuestsOwner.mockResolvedValue([{ ...ROW, guests_count: 3 }, ROW3]);   // seat 3 not named yet
    await run(eventWith([guestFromCollab(ROW, null), guestFromCollab(ROW3, null)]));
    expect(pub.upsertCollabGuestOwner.mock.calls.map(c => c[1].id)).not.toContain("r2");
  });

  it("host's unsent phone fix and the relative's newer note both survive", async () => {
    agreeOn(ROW, ROW3);
    localStorage.setItem(UNSENT, JSON.stringify({ r2: Date.now() }));
    pub.fetchCollabGuestsOwner.mockResolvedValue([{ ...ROW, notes: "אלרגיה לאגוזים" }, ROW3]);
    const ev = eventWith([{ ...guestFromCollab(ROW, null), phone: "0529999999" }, guestFromCollab(ROW3, null)]);
    const { after } = await run(ev);
    const g = after.guests.find(x => x.id === "r2");
    expect(g.phone).toBe("0529999999");
    expect(g.notes).toBe("אלרגיה לאגוזים");
    const pushed = pub.upsertCollabGuestOwner.mock.calls.map(c => c[1]).filter(r => r.id === "r2");
    expect(pushed.length).toBeGreaterThan(0);
    for (const r of pushed) { expect(r.phone).toBe("0529999999"); expect(r.notes).toBe("אלרגיה לאגוזים"); }
  });

  it("57b: a row a relative deleted while the app was closed is removed here, not pushed back", async () => {
    agreeOn(ROW, ROW3);
    pub.fetchCollabGuestsOwner.mockResolvedValue([ROW3]);
    const { after } = await run(eventWith([guestFromCollab(ROW, null), guestFromCollab(ROW3, null)]));
    expect(after.guests.map(g => g.id)).toEqual(["r3"]);
    expect(pub.upsertCollabGuestOwner.mock.calls.map(c => c[1].id)).not.toContain("r2");
  });

  it("57b: …but a guest the host edited since is kept and sent (an edit beats a delete)", async () => {
    agreeOn(ROW, ROW3);
    pub.fetchCollabGuestsOwner.mockResolvedValue([ROW3]);
    const { after } = await run(eventWith([{ ...guestFromCollab(ROW, null), notes: "חדש" }, guestFromCollab(ROW3, null)]));
    expect(after.guests.map(g => g.id).sort()).toEqual(["r2", "r3"]);
    expect(pub.upsertCollabGuestOwner.mock.calls.map(c => c[1].id)).toContain("r2");
  });

  it("57b: an EMPTY read (an expired session reads empty under RLS) deletes nothing", async () => {
    agreeOn(ROW, ROW3);
    pub.fetchCollabGuestsOwner.mockResolvedValue([]);
    const { after } = await run(eventWith([guestFromCollab(ROW, null), guestFromCollab(ROW3, null)]));
    expect(after.guests.map(g => g.id).sort()).toEqual(["r2", "r3"]);
  });

  // audit 3.10: a read the server may have cut short (PostgREST max_rows) is
  // not a list of what the family kept — a row past the cut is not deleted.
  it("57b: a read marked incomplete deletes nothing", async () => {
    agreeOn(ROW, ROW3);
    const partial = [ROW3];
    Object.defineProperty(partial, "complete", { value: false });
    pub.fetchCollabGuestsOwner.mockResolvedValue(partial);
    const { after } = await run(eventWith([guestFromCollab(ROW, null), guestFromCollab(ROW3, null)]));
    expect(after.guests.map(g => g.id).sort()).toEqual(["r2", "r3"]);
  });

  it("a push that landed is remembered as agreed across a reload", async () => {
    const ev = eventWith([guestFromCollab(ROW, null)]);
    await run(ev);
    expect(JSON.parse(localStorage.getItem(AGREED)).r2.phone).toBe(ROW.phone);
  });
});

describe("the live subscription starts before the first read (89 #10)", () => {
  it("a change that arrives while the read is in flight is applied after it", async () => {
    let push;
    pub.subscribeCollabGuests.mockImplementation((_id, cb) => { push = cb; return () => {}; });
    let resolve;
    pub.fetchCollabGuestsOwner.mockReturnValue(new Promise(r => { resolve = r; }));
    const ev = eventWith([guestFromCollab(ROW, null)]);
    const patch = vi.fn();
    renderHook(() => useCollabSync(ev, patch, toast));
    expect(typeof push).toBe("function");          // subscribed before the read returned
    push({ eventType: "INSERT", new: ROW3 });
    await act(async () => { resolve([ROW]); await new Promise(r => setTimeout(r, 0)); });
    await settle();
    const after = patch.mock.calls.reduce((e, [fn]) => fn(e), ev);
    expect(after.guests.map(g => g.id).sort()).toEqual(["r2", "r3"]);
  });
});
