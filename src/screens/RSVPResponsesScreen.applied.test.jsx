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
    const results = await run({ ...base, rsvpApplied: ["r1"] });
    for (const r of results) expect(r.guests[0].rsvp).toBe("declined");
  });

  it("a new answer is applied, and recorded in the event — not in this browser", async () => {
    const results = await run({ ...base, rsvpApplied: [] });
    await waitFor(() => expect(results.length).toBeGreaterThan(0));
    const last = results.at(-1);
    expect(last.guests[0].rsvp).toBe("confirmed");
    expect(last.rsvpApplied).toContain("r1");
    expect(localStorage.getItem("rsvp_applied_c1")).toBeNull();
  });
});
