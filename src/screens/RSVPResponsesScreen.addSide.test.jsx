// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "../test/dom.js";

/* Owner, 3.10: a guest added to the list from an RSVP answer ("+ הוסיפו
 * לרשימה" — someone who answered but is not on the list) always landed on the
 * first side, and the host had to find and fix it. The button now asks which
 * side, in the event's own side names. Companions and the seat count come
 * along from the answer, as before. */

const ROWS = [{ id: "r1", guest_name: "רון לוי", phone: "0529999999", status: "yes", guests_count: 3,
                companions: ["מאיה לוי", "נועם לוי"], created_at: "2026-09-20T10:00:00Z" }];
vi.mock("../utils/publicTokens.js", async (orig) => ({ ...(await orig()), fetchRSVPResponses: async () => ROWS }));
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
const { default: RSVPResponsesScreen } = await import("./RSVPResponsesScreen.jsx");

const EV = {
  id: "e1", cloudId: "c1", name: "החתונה", type: "חתונה", brideName: "דנה", groomName: "יוסי",
  tables: [], seating: {}, eventSite: {}, tokens: {},
  guests: [{ id: "g1", name: "יעל כהן", phone: "050-1234567", rsvp: "pending", count: 1 }],
};
beforeEach(() => localStorage.clear());

describe("RSVP → adding someone who is not on the list", () => {
  it("asks which side, and adds them there with their companions and seats", async () => {
    const patchEvent = vi.fn();
    render(<RSVPResponsesScreen activeEvent={EV} patchEvent={patchEvent} go={vi.fn()} showToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "+ הוסיפו לרשימה" }));
    expect(patchEvent).not.toHaveBeenCalled();             // nothing added yet
    const group = screen.getByRole("group", { name: /לאיזה צד/ });
    const sides = [...group.querySelectorAll("button")].map(b => b.textContent);
    expect(sides).toHaveLength(3);                          // two sides + ביטול
    fireEvent.click(group.querySelectorAll("button")[1]);   // the SECOND side
    const added = patchEvent.mock.calls.at(-1)[0](EV).guests.find(g => g.name === "רון לוי");
    expect(added).toMatchObject({ side: "groom", count: 3, rsvp: "confirmed", companions: ["מאיה לוי", "נועם לוי"] });
  });

  it("ביטול adds nothing", async () => {
    const patchEvent = vi.fn();
    render(<RSVPResponsesScreen activeEvent={EV} patchEvent={patchEvent} go={vi.fn()} showToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "+ הוסיפו לרשימה" }));
    fireEvent.click(screen.getByRole("button", { name: "ביטול" }));
    expect(patchEvent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "+ הוסיפו לרשימה" })).toBeInTheDocument();
  });
});
