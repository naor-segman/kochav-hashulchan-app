// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";
import { normalizeEvent } from "../utils/eventHelpers.js";

/**
 * Without an account an event lives in this browser only, so a link to it
 * does not open for the guest it is sent to. The share screen and the "copy"
 * buttons already went through the share gate; three other ways out did not
 * (found 3.10 by the tour-mapping agents, 124):
 *   • the QR next to the invitation's link,
 *   • the QR next to the collab table's link,
 *   • the event site's ready-made WhatsApp messages, which carry its link,
 *   • and the seating screen's per-guest WhatsApp list, which carries each
 *     guest's entry-card link (found by the final verification run).
 * Each now opens the gate's explanation instead. Signed in, nothing changes.
 */

let currentUser = null;
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: currentUser, loading: false }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchCollabGuestsOwner: vi.fn(async () => []),
  subscribeCollabGuests: vi.fn(() => () => {}),
}));

const { default: EventSiteEditorScreen }     = await import("./EventSiteEditorScreen.jsx");
const { default: AnnouncementsEditorScreen } = await import("./AnnouncementsEditorScreen.jsx");
const { default: CollabReviewScreen }        = await import("./CollabReviewScreen.jsx");
const { default: SeatingScreen }             = await import("./SeatingScreen.jsx");

const EV = normalizeEvent({
  id: "e1", name: "החתונה של דנה ויוסי", type: "חתונה", date: "2027-06-01",
  eventSite: { enabled: true },
});
const props = { activeEvent: EV, patchEvent: vi.fn(), showToast: vi.fn(), go: vi.fn() };
const mount = (Screen) => render(<MemoryRouter><Screen {...props} /></MemoryRouter>);
const gateOpen = () => screen.queryByText(/כדי לשתף צריך חשבון/) !== null;
const qrOpen = () => screen.queryByRole("dialog", { name: /קוד QR/ }) !== null;

beforeEach(() => { currentUser = null; });

describe("guest mode — no way out with a link that will not open", () => {
  it("the invitation's QR explains instead of opening", () => {
    mount(AnnouncementsEditorScreen);
    fireEvent.click(screen.getByRole("button", { name: "קוד QR" }));
    expect(gateOpen()).toBe(true);
    expect(qrOpen()).toBe(false);
  });

  it("the collab table's QR explains instead of opening", () => {
    mount(CollabReviewScreen);
    fireEvent.click(screen.getByRole("button", { name: "קוד QR" }));
    expect(gateOpen()).toBe(true);
    expect(qrOpen()).toBe(false);
  });

  it("the site's ready-made WhatsApp message explains instead of opening WhatsApp", () => {
    mount(EventSiteEditorScreen);
    const wa = screen.getAllByText("שלחו בוואטסאפ")[0];
    // fireEvent returns false when a handler called preventDefault — i.e. the
    // link to wa.me was not followed.
    expect(fireEvent.click(wa)).toBe(false);
    expect(gateOpen()).toBe(true);
  });

  it("the seating screen's per-guest WhatsApp message explains instead of opening WhatsApp", () => {
    const seated = normalizeEvent({
      ...EV, id: "e2", tokens: { invite: "inv12345" },
      guests: [{ id: "g1", name: "דנה כהן", phone: "0501234567", side: "bride", count: 1, rsvp: "confirmed" }],
      tables: [{ id: "t1", name: "1", capacity: 10, shape: "round" }],
      seating: { g1: "t1" },
    });
    render(<MemoryRouter><SeatingScreen {...props} activeEvent={seated} /></MemoryRouter>);
    const item = screen.getByText("דנה כהן", { selector: '[class*="waNotifyName"]' }).closest("a");
    expect(fireEvent.click(item)).toBe(false);
    expect(gateOpen()).toBe(true);
  });

  it("signed in, the QR simply opens", () => {
    currentUser = { id: "u1" };
    mount(AnnouncementsEditorScreen);
    fireEvent.click(screen.getByRole("button", { name: "קוד QR" }));
    expect(qrOpen()).toBe(true);
    expect(gateOpen()).toBe(false);
  });
});
