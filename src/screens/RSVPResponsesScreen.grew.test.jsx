// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "../test/dom.js";

/* E5 (third review 30.9): "תמר אלון" was invited for 1 and answered yes for
 * 6. The list changed to 6 in silence, table 3 went to 12 of 10, and this
 * screen said "מעודכן ברשימה". */

const ROWS = [
  { id: "r1", guest_name: "תמר אלון", phone: "0501234567", status: "yes", guests_count: 6, created_at: "2026-09-21T10:00:00Z" },
];
vi.mock("../utils/publicTokens.js", async (orig) => ({ ...(await orig()), fetchRSVPResponses: async () => ROWS }));
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
const { default: RSVPResponsesScreen } = await import("./RSVPResponsesScreen.jsx");

const base = {
  id: "e1", cloudId: "c1", name: "e", eventSite: {}, tokens: {},
  tables: [{ id: "t3", name: "שולחן 3", capacity: 10 }],
  seating: { g1: "t3", g2: "t3" },
};

describe("an RSVP for more seats than invited (E5)", () => {
  it("auto-apply keeps the invited number and warns the host", async () => {
    let ev = { ...base, guests: [
      { id: "g1", name: "תמר אלון", phone: "050-1234567", rsvp: "pending", count: 1 },
      { id: "g2", name: "משפחת כהן", count: 6, rsvp: "confirmed" },
    ] };
    const patchEvent = vi.fn(fn => { ev = fn(ev); });
    const showToast = vi.fn();
    render(<RSVPResponsesScreen activeEvent={ev} patchEvent={patchEvent} go={vi.fn()} showToast={showToast} syncStatus="synced" />);
    await waitFor(() => expect(patchEvent).toHaveBeenCalled());
    const tamar = ev.guests.find(g => g.id === "g1");
    expect(tamar.count).toBe(6);            // the answer still applies
    expect(tamar.invitedCount).toBe(1);     // and what was invited is kept
    expect(showToast.mock.calls.at(-1)).toEqual([expect.stringMatching(/יותר מקומות ממה שהוזמנו/), "warn"]);
  });

  it("the row says so, with the table that is now over", async () => {
    const ev = { ...base, rsvpApplied: ["r1"], guests: [
      { id: "g1", name: "תמר אלון", phone: "050-1234567", rsvp: "confirmed", count: 6, invitedCount: 1 },
      { id: "g2", name: "משפחת כהן", count: 6, rsvp: "confirmed" },
    ] };
    render(<RSVPResponsesScreen activeEvent={ev} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} syncStatus="synced" />);
    expect(await screen.findByText(/הוזמנו למקום אחד, אישרו 6 · שולחן 3 עכשיו 12 מתוך 10/)).toBeTruthy();
  });

  it("a smaller or equal answer records nothing", async () => {
    let ev = { ...base, guests: [{ id: "g1", name: "תמר אלון", phone: "050-1234567", rsvp: "pending", count: 8 }] };
    const patchEvent = vi.fn(fn => { ev = fn(ev); });
    render(<RSVPResponsesScreen activeEvent={ev} patchEvent={patchEvent} go={vi.fn()} showToast={vi.fn()} syncStatus="synced" />);
    await waitFor(() => expect(patchEvent).toHaveBeenCalled());
    expect(ev.guests[0].count).toBe(6);
    expect(ev.guests[0]).not.toHaveProperty("invitedCount");
  });
});
