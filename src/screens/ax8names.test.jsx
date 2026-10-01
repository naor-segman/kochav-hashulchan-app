// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, within } from "../test/dom.js";
import { normalizeEvent } from "../utils/eventHelpers.js";

/* AX8 — controls a screen reader could not tell apart.
 *  - the event-site editor's nine section switches were all called
 *    "פעיל"/"כבוי" (and the name flipped with the state);
 *  - segmented choices (constraint type, couple type, parents, side) showed
 *    their state by colour alone — no aria-pressed;
 *  - every guest row had "עריכה" / "מחקו", every constraint "הסר" — 300 of
 *    each with nothing saying whose. */

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
window.scrollTo = () => {};

const EventSiteEditorScreen = (await import("./EventSiteEditorScreen.jsx")).default;
const ConstraintsScreen = (await import("./ConstraintsScreen.jsx")).default;
const EventSetupScreen = (await import("./EventSetupScreen.jsx")).default;
const GuestManagerScreen = (await import("./GuestManagerScreen.jsx")).default;

const ev = normalizeEvent({
  id: "e1", name: "החתונה של דנה ויוסי", type: "חתונה", date: "2026-12-01",
  tokens: { invite: "t1", album: "t2" },
  eventSite: { enabled: true },
  guests: [
    { id: "g1", name: "רות לוי", side: "bride", phone: "050-1234567" },
    { id: "g2", name: "משה כהן", side: "groom" },
    { id: "g3", name: "אבי בן דוד", side: "groom" },
  ],
  constraints: [
    { id: "c1", type: "together", guestA: "g1", guestB: "g2" },
    { id: "c2", type: "apart", guestA: "g2", guestB: "g3" },
  ],
});
const props = { activeEvent: ev, patchEvent: vi.fn(), go: vi.fn(), showToast: vi.fn() };
const inRouter = (el) => render(<MemoryRouter>{el}</MemoryRouter>);

describe("AX8 — event-site section switches are named by section", () => {
  it("nine switches, nine different names, none of them the state", () => {
    inRouter(<EventSiteEditorScreen {...props} />);
    const toggles = screen.getAllByRole("button").filter(b => b.hasAttribute("aria-pressed") && b.className.includes("toggle"));
    const names = toggles.map(b => b.getAttribute("aria-label"));
    expect(names).toHaveLength(9);
    expect(new Set(names).size).toBe(9);
    expect(names).not.toContain("פעיל");
    expect(names).not.toContain("כבוי");
    expect(names).toEqual(expect.arrayContaining(["גלריית תמונות", "שאלות נפוצות", "קיר ברכות", "מתנה"]));
  });
});

describe("AX8 — segmented choices carry aria-pressed", () => {
  it("constraints: the chosen type is pressed and follows a click", () => {
    inRouter(<ConstraintsScreen {...props} />);
    const group = screen.getByRole("group", { name: "סוג האילוץ" });
    const [together, apart] = within(group).getAllByRole("button");
    expect(together).toHaveAttribute("aria-pressed", "true");
    expect(apart).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(apart);
    expect(apart).toHaveAttribute("aria-pressed", "true");
    expect(together).toHaveAttribute("aria-pressed", "false");
  });

  it("event setup: the couple-type choice has exactly one pressed", () => {
    render(<EventSetupScreen {...props} />);
    const btns = within(screen.getByRole("group", { name: "בני הזוג" })).getAllByRole("button");
    expect(btns.length).toBeGreaterThan(1);
    expect(btns.filter(b => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
  });

  it("guest manager: the side choice has exactly one pressed", () => {
    render(<GuestManagerScreen {...props} />);
    const btns = within(screen.getByRole("group", { name: "מי הזמין אותם" })).getAllByRole("button");
    expect(btns).toHaveLength(2);
    expect(btns.filter(b => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
  });
});

describe("AX8 — repeated row buttons say whose they are", () => {
  it("guest rows: edit, delete and WhatsApp name the guest, visible word first", () => {
    render(<GuestManagerScreen {...props} />);
    expect(screen.getByRole("button", { name: "עריכה: רות לוי" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "מחקו: משה כהן" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "וואטסאפ: רות לוי" })).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: "מחקו" })).toHaveLength(0);
  });

  it("constraint rows: remove names both guests", () => {
    inRouter(<ConstraintsScreen {...props} />);
    expect(screen.getByRole("button", { name: "הסירו: רות לוי יחד עם משה כהן" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הסירו: משה כהן בנפרד מ-אבי בן דוד" })).toBeInTheDocument();
  });
});
