// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";

/* Two things the 29.9 review found on the guest list:
 *  - the per-guest WhatsApp button sent /invite/<token> even while the site was
 *    unpublished, worked with no account, and was never recorded as sent;
 *  - the bulk RSVP bar overwrote every filtered guest's answer on one tap. */

let user = { id: "u1" };
vi.mock("../hooks/useAuth.js", () => ({ useAuth: () => ({ user, loading: false }), AuthProvider: ({ children }) => children }));
const { default: GuestManagerScreen } = await import("./GuestManagerScreen.jsx");

const EV = {
  id: "e1", cloudId: "c1", name: "החתונה של דנה ויוסי", type: "חתונה", date: "2027-06-01",
  tables: [], seating: {}, constraints: [],
  tokens: { rsvp: "rsvptok1", invite: "invtok1", gift: "g", album: "a", hostess: "h", collab: "c" },
  eventSite: { enabled: false },
  guests: [
    { id: "g1", name: "טל שוורץ", phone: "0501234567", side: "bride", group: "משפחה", count: 2, rsvp: "pending" },
    { id: "g2", name: "רון לוי", phone: "0521234567", side: "groom", group: "חברים", count: 8, rsvp: "confirmed" },
    { id: "g3", name: "נועה גל", phone: "0531234567", side: "groom", group: "חברים", count: 1, rsvp: "pending" },
  ],
};

let patched, opened;
beforeEach(() => { patched = []; opened = []; user = { id: "u1" }; window.open = (u) => { opened.push(u); }; });
const mount = (ev = EV) => {
  const patchEvent = vi.fn(fn => patched.push(fn(ev)));
  render(<MemoryRouter><GuestManagerScreen activeEvent={ev} patchEvent={patchEvent} go={() => {}} showToast={() => {}} /></MemoryRouter>);
  return patchEvent;
};

describe("the per-guest WhatsApp button", () => {
  it("links the RSVP page while the site is unpublished — not /invite/ — and records the send", () => {
    mount();
    fireEvent.click(screen.getAllByTitle(/וואטסאפ|WhatsApp/i)[0]);
    const text = decodeURIComponent(opened[0]);
    expect(text).not.toContain("/invite/");
    expect(text).toContain("/rsvp/rsvptok1");
    expect(patched.at(-1).messagesSent.invitation.g1).toEqual(expect.any(Number));
  });
  it("with no account it explains instead of sending a link that resolves to nothing", () => {
    user = null;
    mount();
    fireEvent.click(screen.getAllByTitle(/וואטסאפ|WhatsApp/i)[0]);
    expect(opened).toHaveLength(0);
  });
});

describe("the bulk RSVP bar", () => {
  it("asks first, naming how many answers will be replaced; cancel changes nothing", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("סינון לפי צד"), { target: { value: "groom" } });
    const bar = document.querySelector("[class*='bulkBar']");
    expect(bar?.textContent).toContain("עדכנו 2 מסוננים");
    fireEvent.click([...bar.querySelectorAll("button")].find(b => b.textContent === "סירב/ה"));
    await waitFor(() => expect(document.body.textContent).toContain("כבר ענו אחרת"));
    fireEvent.click([...document.querySelectorAll("button")].find(b => /ביטול/.test(b.textContent)));
    await waitFor(() => expect(document.body.textContent).not.toContain("כבר ענו אחרת"));
    expect(patched.filter(e => e.guests.some(g => g.rsvp === "declined"))).toHaveLength(0);
  });
});
