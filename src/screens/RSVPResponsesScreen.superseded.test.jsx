// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../test/dom.js";

/* 29.9 review: a guest answered "maybe", later "yes". The newer row applied;
 * the older one still offered "עדכנו אורח קיים", and tapping it set the guest
 * back to maybe. A replaced answer is shown, never applied. */

const ROWS = [
  { id: "old", guest_name: "יעל כהן", phone: "0501234567", status: "maybe", created_at: "2026-09-20T10:00:00Z" },
  { id: "new", guest_name: "יעל כהן", phone: "0501234567", status: "yes", guests_count: 2, created_at: "2026-09-21T10:00:00Z" },
];
vi.mock("../utils/publicTokens.js", async (orig) => ({ ...(await orig()), fetchRSVPResponses: async () => ROWS }));
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
const { default: RSVPResponsesScreen } = await import("./RSVPResponsesScreen.jsx");

describe("a replaced RSVP answer", () => {
  it("is marked as replaced and offers nothing to apply", async () => {
    const ev = { id: "e1", cloudId: "c1", name: "e", tables: [], seating: {}, eventSite: {}, tokens: {},
      // The guest reflects the NEW answer, so only the old one is un-applied.
      guests: [{ id: "g1", name: "יעל כהן", phone: "050-1234567", rsvp: "confirmed", count: 2 }],
      rsvpApplied: ["new"] };
    render(<RSVPResponsesScreen activeEvent={ev} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />);
    expect(await screen.findByText("הוחלפה בתשובה מאוחרת יותר")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "עדכנו אורח קיים" })).toBeNull();
  });
});
