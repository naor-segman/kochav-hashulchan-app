// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../test/dom.js";

/* 107/ת4 (28.9): a guest who answered "maybe" and then "yes" for a party of
 * three was counted as one maybe AND one yes, and their three seats twice on
 * the bus. Counts now use each respondent's latest answer. */

const ROWS = [
  { id: "r1", guest_name: "יעל כהן", phone: "050-1234567", status: "maybe", guests_count: 3, shuttle_id: "s1", created_at: "2026-09-20T10:00:00Z" },
  { id: "r2", guest_name: "יעל כהן", phone: "+972501234567", status: "yes",  guests_count: 3, shuttle_id: "s1", created_at: "2026-09-21T10:00:00Z" },
  { id: "r3", guest_name: "איתי לוי", phone: "", status: "no", guests_count: 1, created_at: "2026-09-21T11:00:00Z" },
];
vi.mock("../utils/publicTokens.js", async (orig) => ({ ...(await orig()), fetchRSVPResponses: async () => ROWS }));
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
const { default: RSVPResponsesScreen } = await import("./RSVPResponsesScreen.jsx");

const ev = {
  id: "e1", cloudId: "c1", name: "החתונה", guests: [], tables: [], seating: {},
  eventSite: { shuttles: [{ id: "s1", place: "תל אביב", time: "17:00" }] }, tokens: {},
};
const tile = (label) => [...document.querySelectorAll("[class*=statLabel]")]
  .find(el => el.textContent === label).previousElementSibling.textContent;

describe("RSVP counts — one answer per guest", () => {
  it("counts the latest answer only", async () => {
    render(<RSVPResponsesScreen activeEvent={ev} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />);
    await screen.findByText("אישרו הגעה");
    expect(tile("תשובות")).toBe("2");
    expect(tile("אישרו הגעה")).toBe("1");
    expect(tile("אולי")).toBe("0");
    expect(tile("אורחים מגיעים")).toBe("3");
    expect(screen.getByText(/נספרה רק התשובה האחרונה/)).toBeInTheDocument();
  });

  it("puts the party on the bus once", async () => {
    render(<RSVPResponsesScreen activeEvent={ev} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />);
    const bus = await screen.findByText("תל אביב · 17:00");
    expect(bus.previousElementSibling.textContent).toBe("3");
  });
});
