// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, waitFor, cleanup } from "../test/dom.js";

// ת2 — "נשלח" was set the moment WhatsApp OPENED, before the host pressed
// send. A host who closed WhatsApp without sending saw the guest done, the
// count rose, and the reminders skipped them. Opening now only asks "נשלח?";
// only "כן" writes messagesSent (same shape, still synced).

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1", email: "host@example.com" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
const MessagesScreen = (await import("./MessagesScreen.jsx")).default;

const EV = {
  id: "e1", name: "החתונה של דנה ויוסי", date: "2027-06-01", venue: "אולמי הגן",
  guests: [{ id: "g1", name: "טל שוורץ", rsvp: "pending", phone: "0501234567" }],
  tables: [], seating: {}, tokens: { rsvp: "r1234567" },
};

let open;
beforeEach(() => { sessionStorage.clear(); open = vi.spyOn(window, "open").mockImplementation(() => null); });
afterEach(() => { open.mockRestore(); });

const mount = () => {
  const patchEvent = vi.fn();
  render(<MemoryRouter><MessagesScreen activeEvent={EV} patchEvent={patchEvent} showToast={() => {}} /></MemoryRouter>);
  return patchEvent;
};

describe("opened in WhatsApp is not sent", () => {
  it("opening marks nothing; the row asks; 'כן' records it in messagesSent", async () => {
    const patchEvent = mount();
    fireEvent.click(screen.getByRole("button", { name: "שלחו בוואטסאפ" }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(patchEvent).not.toHaveBeenCalled();
    expect(screen.getByText("נפתח בוואטסאפ — נשלח?")).toBeInTheDocument();
    expect(screen.queryByText(/^נשלח$/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "כן, נשלחה לטל שוורץ" }));
    expect(patchEvent).toHaveBeenCalledTimes(1);
    const out = patchEvent.mock.calls[0][0](EV);
    expect(Object.keys(out.messagesSent.invitation)).toEqual(["g1"]);
    expect(out.messagesSent.invitation.g1).toBeTypeOf("number");
  });

  it("'לא' writes nothing and the send button is back", async () => {
    const patchEvent = mount();
    fireEvent.click(screen.getByRole("button", { name: "שלחו בוואטסאפ" }));
    await screen.findByText("נפתח בוואטסאפ — נשלח?");
    fireEvent.click(screen.getByRole("button", { name: "לא נשלחה לטל שוורץ" }));
    expect(patchEvent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "שלחו בוואטסאפ" })).toBeInTheDocument();
  });

  it("coming back to the tab puts focus on the question", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "שלחו בוואטסאפ" }));
    await screen.findByText("נפתח בוואטסאפ — נשלח?");
    document.body.focus();
    window.dispatchEvent(new Event("focus"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "כן, נשלחה לטל שוורץ" }));
  });

  it("the question survives a reload of the tab", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "שלחו בוואטסאפ" }));
    await screen.findByText("נפתח בוואטסאפ — נשלח?");
    cleanup();
    mount();
    expect(screen.getByText("נפתח בוואטסאפ — נשלח?")).toBeInTheDocument();
  });
});
