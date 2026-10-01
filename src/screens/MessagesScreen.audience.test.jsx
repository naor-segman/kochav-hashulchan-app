// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";
import MessagesScreen from "./MessagesScreen.jsx";

/* סב53 (third review 30.9): every stage said "כל האורחים" — audienceLabel was
 * handed the list of guests instead of the stage's audience key. */
const ev = {
  id: "e1", name: "החתונה", type: "חתונה", date: "2027-06-01", tokens: {},
  guests: [
    { id: "a", name: "דנה", phone: "0501234567", rsvp: "confirmed" },
    { id: "b", name: "רון", phone: "0507654321", rsvp: "pending" },
  ],
  tables: [], seating: {},
};

describe("each message stage names its own audience", () => {
  it("the reminder says 'not yet confirmed', the thank-you says 'arrived'", () => {
    render(<AuthProvider><MemoryRouter><MessagesScreen activeEvent={ev} patchEvent={() => {}} showToast={() => {}} /></MemoryRouter></AuthProvider>);
    const whens = [...document.querySelectorAll("button[aria-expanded]")].map(b => b.textContent);
    expect(whens.some(t => /שטרם אישרו/.test(t))).toBe(true);
    expect(whens.some(t => /שהגיעו בפועל/.test(t))).toBe(true);
    expect(whens.filter(t => /כל האורחים/.test(t)).length).toBe(2);   // save-the-date and invitation only
  });
});
