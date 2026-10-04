// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../test/dom.js";

/* ת3 (28.9): which answers were already applied lived in ONE browser's
 * localStorage, so on the host's second device every old answer was applied
 * again — overwriting what the host had changed by hand since. The list now
 * travels with the event. */

const ROWS = [{ id: "r1", guest_name: "יעל כהן", phone: "0501234567", status: "yes", guests_count: 2,
                created_at: "2026-09-20T10:00:00Z" }];
vi.mock("../utils/publicTokens.js", async (orig) => ({ ...(await orig()), fetchRSVPResponses: async () => ROWS }));
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
const { default: RSVPResponsesScreen } = await import("./RSVPResponsesScreen.jsx");

// The host answered for יעל by hand: declined. The old "yes" must not come back.
const base = {
  id: "e1", cloudId: "c1", name: "החתונה", tables: [], seating: {}, eventSite: {}, tokens: {},
  guests: [{ id: "g1", name: "יעל כהן", phone: "050-1234567", rsvp: "declined", count: 1 }],
};
beforeEach(() => localStorage.clear());

const run = async (ev) => {
  const patchEvent = vi.fn();
  render(<RSVPResponsesScreen activeEvent={ev} patchEvent={patchEvent} go={vi.fn()} showToast={vi.fn()} />);
  await screen.findByText("אישרו הגעה");
  await new Promise(r => setTimeout(r, 50));
  return patchEvent.mock.calls.map(([fn]) => fn(ev));
};

describe("RSVP auto-sync on a second device", () => {
  it("an answer applied on the other device is NOT applied again here", async () => {
    // A guest the host did NOT edit by hand, so the only thing standing
    // between r1 and a second application is the list. With the hand-edited
    // "declined" guest this test passed even with an EMPTY list — the
    // hand-edit hold stopped it first — and its only expect sat in a loop
    // over zero calls (audit 3.10, H4). The next test is the positive control:
    // the same guest with an empty list IS applied.
    const pending = { ...base, guests: [{ ...base.guests[0], rsvp: "pending" }] };
    const results = await run({ ...pending, rsvpApplied: ["r1"] });
    expect(results.some(r => r.guests[0].rsvp === "confirmed")).toBe(false);
  });

  it("a new answer is applied, and recorded in the event — not in this browser", async () => {
    // A guest who has not answered yet. (A row the host set by hand is held
    // for the host instead — see "the host's own edit" below.)
    const pending = { ...base, guests: [{ ...base.guests[0], rsvp: "pending" }] };
    const results = await run({ ...pending, rsvpApplied: [] });
    await waitFor(() => expect(results.length).toBeGreaterThan(0));
    const last = results.at(-1);
    expect(last.guests[0].rsvp).toBe("confirmed");
    expect(last.rsvpApplied).toContain("r1");
    expect(localStorage.getItem("rsvp_applied_c1")).toBeNull();
  });
});

describe("reloaded on this screen (29.9 review)", () => {
  // The local copy shows first, with a stale list; the cloud copy's list
  // arrives while the answers are already here. Read once at mount, that list
  // was never seen and r1 was applied again over the host's "declined".
  it("waits for the cloud copy, and reads the list that arrives with it", async () => {
    const patchEvent = vi.fn();
    const stale = { ...base, rsvpApplied: [] };
    const props = { patchEvent, go: vi.fn(), showToast: vi.fn() };
    const { rerender } = render(<RSVPResponsesScreen activeEvent={stale} syncStatus="syncing" {...props} />);
    await screen.findByText("אישרו הגעה");
    await new Promise(r => setTimeout(r, 50));
    expect(patchEvent).not.toHaveBeenCalled();                 // nothing applied mid-sync
    const synced = { ...base, rsvpApplied: ["r1"] };
    rerender(<RSVPResponsesScreen activeEvent={synced} syncStatus="synced" {...props} />);
    await new Promise(r => setTimeout(r, 50));
    for (const [fn] of patchEvent.mock.calls) expect(fn(synced).guests[0].rsvp).toBe("declined");
  });
});


/* סב63 (owner 2.10): an answer must not overwrite what the host changed by
 * hand, and a name alone is not enough to apply one automatically — anyone
 * holding the public link can type a guest's name. Both now wait for the
 * host's tap on this screen. */
describe("the host's own edit and name-only matches (סב63)", () => {
  it("a row the host set by hand is not overwritten — it waits, and says why", async () => {
    const results = await run({ ...base, rsvpApplied: [] });          // host: declined; answer: yes
    for (const r of results) expect(r.guests[0].rsvp).toBe("declined");
    expect(await screen.findByText("שונה ממה שעדכנתם ידנית")).toBeTruthy();
  });

  it("a row that still shows the previous answer takes the new one", async () => {
    // The host never touched it: "maybe" came from answer r0, applied; r1 says yes.
    ROWS.unshift({ id: "r0", guest_name: "יעל כהן", phone: "0501234567", status: "maybe", guests_count: 1,
                   created_at: "2026-09-19T10:00:00Z" });
    try {
      const ev = { ...base, guests: [{ ...base.guests[0], rsvp: "maybe" }], rsvpApplied: ["r0"] };
      const results = await run(ev);
      await waitFor(() => expect(results.length).toBeGreaterThan(0));
      expect(results.at(-1).guests[0].rsvp).toBe("confirmed");
    } finally { ROWS.shift(); }
  });

  it("matched by name only: not applied until the host taps", async () => {
    const saved = ROWS[0].phone;
    ROWS[0].phone = "";
    try {
      const ev = { ...base, guests: [{ ...base.guests[0], rsvp: "pending" }], rsvpApplied: [] };
      const results = await run(ev);
      for (const r of results) expect(r.guests[0].rsvp).toBe("pending");
      expect(await screen.findByText(/זוהה לפי שם — יעל כהן\?/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "עדכנו אורח קיים" })).toBeTruthy();
    } finally { ROWS[0].phone = saved; }
  });
});
