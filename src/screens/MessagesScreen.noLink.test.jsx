// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";

// RG9 — the invitation's template ends "נשמח שתאשרו הגעה:\n{{קישור}}". With no
// published page the link is empty, and one tap sent the message without it
// AND marked the guest as sent. Now it asks first; "no" sends nothing.

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1", email: "host@example.com" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
const MessagesScreen = (await import("./MessagesScreen.jsx")).default;

const EV = {
  id: "e1", name: "החתונה של דנה ויוסי", date: "2027-06-01", venue: "אולמי הגן",
  guests: [{ id: "g1", name: "טל שוורץ", rsvp: "pending", phone: "0501234567" }],
  tables: [], seating: {}, tokens: {},          // no RSVP / invite token: no link
};

let open;
beforeEach(() => { open = vi.spyOn(window, "open").mockImplementation(() => null); open.mockClear(); });
afterEach(() => { open.mockRestore(); });

const mount = (ev = EV) => {
  const patchEvent = vi.fn();
  render(<MemoryRouter><MessagesScreen activeEvent={ev} patchEvent={patchEvent} showToast={() => {}} /></MemoryRouter>);
  return patchEvent;
};

describe("a message whose link is missing", () => {
  it("asks before sending; cancelling opens nothing and marks nothing", async () => {
    const patchEvent = mount();
    fireEvent.click(screen.getByRole("button", { name: "שלחו בוואטסאפ" }));
    expect(await screen.findByText(/היא תצא בלי קישור/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ביטול" }));
    await waitFor(() => expect(screen.queryByText(/היא תצא בלי קישור/)).toBeNull());
    expect(open).not.toHaveBeenCalled();
    expect(patchEvent).not.toHaveBeenCalled();
  });

  it("sending anyway opens WhatsApp, and the stage does not ask again", async () => {
    mount({ ...EV, guests: [...EV.guests, { id: "g2", name: "דן לוי", rsvp: "pending", phone: "0527654321" }] });
    fireEvent.click(screen.getAllByRole("button", { name: "שלחו בוואטסאפ" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "שלחו בלי קישור" }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByRole("button", { name: "שלחו בוואטסאפ" })[1]);   // דן לוי
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/היא תצא בלי קישור/)).toBeNull();
  });

  it("a stage WITH a link sends at once", async () => {
    mount({ ...EV, tokens: { rsvp: "r1234567" } });
    fireEvent.click(screen.getByRole("button", { name: "שלחו בוואטסאפ" }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/היא תצא בלי קישור/)).toBeNull();
  });
});
