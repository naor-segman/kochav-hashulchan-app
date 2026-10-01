// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../test/dom.js";

/* ת — the nav promised "מי עוד לא ענה" and the screen had no such number (a
 * non-answer creates no response row); its subtitle said every answer enters
 * the guest list automatically, which is true only for a MATCHED answer. */

vi.mock("../utils/publicTokens.js", async (orig) => ({ ...(await orig()), fetchRSVPResponses: async () => [] }));
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
const { default: RSVPResponsesScreen } = await import("./RSVPResponsesScreen.jsx");

const ev = {
  id: "e1", cloudId: "c1", name: "החתונה", tables: [], seating: {}, tokens: {},
  guests: [
    { id: "a", name: "א", rsvp: "pending" },
    { id: "b", name: "ב" },                       // no status yet = not answered
    { id: "c", name: "ג", rsvp: "confirmed" },
    { id: "d", name: "ד", rsvp: "maybe" },        // answered "maybe"
    { id: "e", name: "ה", rsvp: "declined" },
  ],
};

describe("RSVP screen — who has not answered", () => {
  it("counts the guest-list rows with no answer", async () => {
    render(<RSVPResponsesScreen activeEvent={ev} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />);
    const label = await screen.findByText("ברשימה וטרם ענו");
    expect(label.previousElementSibling.textContent).toBe("2");
  });
  it("the subtitle no longer says every answer enters the list by itself", () => {
    const { container } = render(<RSVPResponsesScreen activeEvent={ev} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />);
    expect(container.textContent).not.toContain("כל מי שמאשר דרך הקישור נכנס אוטומטית");
    expect(container.textContent).toContain("תשובה שלא זוהתה מחכה כאן לשיוך");
  });
});
