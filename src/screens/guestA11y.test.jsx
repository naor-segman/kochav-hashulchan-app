// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, act, waitFor } from "../test/dom.js";
import { defaultEventSite } from "../data/eventSiteTemplates.js";

/* סב89 / 37f — guest-page accessibility, read back out of the DOM:
 *  - RSVP: each step replaces the card; focus stayed on a button that no
 *    longer existed. It goes to the new step's h1;
 *  - gift amount chips said which one was chosen by colour only;
 *  - the site's FAQ and section menu had no aria-expanded; the menu had no Escape;
 *  - the shared table's name/phone inputs were placeholder-only;
 *  - a dangerous ConfirmDialog opened with focus on "כן, המשיכו";
 *  - the QR scanner had no Escape;
 *  - loading states were a bare "טוען…" with no live region. */
let EVENT;
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => EVENT,
  fetchCollabEvent: async () => ({ cloudId: "c1", name: "החתונה", type: "חתונה", brideName: "דנה", groomName: "יוסי" }),
  fetchCollabGuests: async () => [{ id: "r1", name: "משפחת כהן", phone: "050", side: "bride", guest_group: "משפחה", guests_count: 1, companions: [] }],
}));
vi.mock("../utils/scanPayload.js", async (orig) => ({ ...(await orig()), isScanSupported: () => false }));
const { default: RSVPScreen } = await import("./RSVPScreen.jsx");
const { default: GiftScreen } = await import("./GiftScreen.jsx");
const { default: EventSiteScreen } = await import("./EventSiteScreen.jsx");
const { default: CollabScreen } = await import("./CollabScreen.jsx");
const { default: ConfirmDialog } = await import("../components/ui/ConfirmDialog.jsx");
const { default: QrScanner } = await import("../components/ui/QrScanner.jsx");

const at = (path, route, el) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /></Routes></MemoryRouter>);
const FUTURE = { cloudId: "c1", name: "החתונה של דנה", date: "2099-06-01", type: "חתונה", brideName: "דנה", groomName: "יוסי" };

describe("RSVP steps move focus to their heading", () => {
  it("choice → details → back", async () => {
    EVENT = FUTURE;
    at("/rsvp/tok12345", "/rsvp/:token", <RSVPScreen />);
    const yes = await screen.findByRole("button", { name: /כן, אגיע/ });
    yes.focus();
    fireEvent.click(yes);
    await waitFor(() => expect(document.activeElement?.tagName).toBe("H1"));
    expect(document.activeElement.textContent).toBe("החתונה של דנה");
    fireEvent.click(screen.getByRole("button", { name: /חזרו/ }));
    await waitFor(() => expect(document.activeElement?.tagName).toBe("H1"));
  });
});

describe("gift amount chips", () => {
  it("say which one is chosen", async () => {
    EVENT = FUTURE;
    at("/gift/tok12345", "/gift/:token", <GiftScreen />);
    const chip = await screen.findByRole("button", { name: "₪500" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("event site menu and FAQ", () => {
  const renderSite = () => render(<MemoryRouter><EventSiteScreen localEvent={{
    name: "החתונה", type: "חתונה", date: "2099-06-01", brideName: "דנה", groomName: "יוסי", tokens: {},
    eventSite: { ...defaultEventSite("חתונה"), enabled: true,
      sections: { ...defaultEventSite("חתונה").sections, faq: true, schedule: true },
      schedule: [{ id: "s1", time: "20:00", title: "חופה" }],
      faq: [{ id: "f1", q: "חניה?", a: "יש" }] },
  }} /></MemoryRouter>);

  it("the menu reports its state and closes on Escape, back to its button", () => {
    renderSite();
    const burger = screen.getByRole("button", { name: "תפריט" });
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(burger);
    expect(burger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(burger);
  });

  it("an FAQ question reports whether it is open", () => {
    renderSite();
    const q = screen.getByRole("button", { name: /חניה\?/ });
    expect(q.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(q);
    expect(q.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(q.getAttribute("aria-controls"))?.textContent).toBe("יש");
  });
});

describe("shared table inputs", () => {
  it("name and phone have accessible names", async () => {
    at("/collab/tok12345", "/collab/:token", <CollabScreen />);
    expect(await screen.findByLabelText("שם מלא")).toBeTruthy();
    expect(screen.getByLabelText("טלפון")).toBeTruthy();
  });
});

describe("ConfirmDialog initial focus", () => {
  it("is on Cancel for a dangerous action, on confirm otherwise", () => {
    const { unmount } = render(<ConfirmDialog message="למחוק?" danger onClose={() => {}} />);
    expect(document.activeElement?.textContent).toBe("ביטול");
    unmount();
    render(<ConfirmDialog message="להמשיך?" onClose={() => {}} />);
    expect(document.activeElement?.textContent).toBe("אישור");
  });
});

describe("QR scanner", () => {
  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<QrScanner onScan={() => {}} onClose={onClose} />);
    await act(async () => {});
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("loading states are announced", () => {
  it("the RSVP page's loading line is a status", () => {
    EVENT = new Promise(() => {});                         // never resolves: stays loading
    at("/rsvp/tok12345", "/rsvp/:token", <RSVPScreen />);
    expect(screen.getByRole("status").textContent).toMatch(/טוען/);
  });
});
