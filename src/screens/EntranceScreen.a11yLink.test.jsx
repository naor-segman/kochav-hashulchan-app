// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";

/* AX4 — the door's buttons were "הגיע/ה" forty times down the list; a screen
 * reader could not tell whose. RG4 — a mark waiting on a CLOSED link said
 * "ננסה שוב כשהחיבור יחזור" (it would not be retried until the host reopened
 * marking), and a link replaced mid-shift dropped its queued marks silently.
 * Walk-in sheet: the name field had only a placeholder, the side buttons no
 * pressed state, and Tab walked out of an aria-modal dialog. */

const hostess = vi.fn();
const mark = vi.fn();
vi.mock("../utils/publicTokens.js", () => ({
  fetchHostessData: (...a) => hostess(...a),
  markArrivalByToken: (...a) => mark(...a),
}));
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
const { default: EntranceScreen } = await import("./EntranceScreen.jsx");

const EV = {
  id: "e1", name: "החתונה", cloudId: null, tokens: { hostess: "h1234567" },
  tables: [{ id: "t1", name: "שולחן 1", capacity: 10, shape: "round" }],
  guests: [{ id: "g1", name: "יעל", count: 1, rsvp: "confirmed" }, { id: "g2", name: "דן", count: 2, rsvp: "confirmed" }],
  seating: { g1: "t1", g2: "t1" },
};
const owner = () => render(<MemoryRouter initialEntries={["/events/e1/entrance"]}><Routes>
  <Route path="/events/:eventId/entrance" element={
    <EntranceScreen mode="owner" events={[EV]} loading={false} patchEventById={vi.fn()} />} />
</Routes></MemoryRouter>);
const greeter = () => render(<MemoryRouter initialEntries={["/entrance/tok12345678"]}><Routes>
  <Route path="/entrance/:token" element={<EntranceScreen mode="token" />} />
</Routes></MemoryRouter>);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem("kochav_orientation_v1", "1");
  hostess.mockReset(); mark.mockReset();
});

describe("AX4 — every door button says whose it is", () => {
  it("row, partial, stepper and table buttons carry the name", () => {
    owner();
    fireEvent.click(screen.getByRole("tab", { name: /לפי שולחן/ }));
    expect(screen.getByRole("button", { name: "הגיע/ה — יעל" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "כולם הגיעו · 2 — דן" })).toBeInTheDocument();
    const partial = screen.getByRole("button", { name: "סימון חלקי — דן, 0 מתוך 2 הגיעו" });
    fireEvent.click(partial);
    expect(screen.getByRole("button", { name: "הוסיפו אחד — דן" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הפחיתו אחד — דן" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "כולם הגיעו — שולחן 1" })).toBeInTheDocument();
  });
});

describe("walk-in sheet", () => {
  it("has a labelled name field, pressed side buttons, and keeps Tab inside", () => {
    owner();
    fireEvent.click(screen.getByRole("button", { name: /אורח שהגיע/ }));
    const dialog = screen.getByRole("dialog");
    expect(screen.getByLabelText("שם האורח")).toBeInTheDocument();
    const sides = [...dialog.querySelectorAll("[aria-pressed]")].filter(b => !/פנויים/.test(b.textContent));
    expect(sides.map(b => b.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    const focusables = [...dialog.querySelectorAll("button:not([disabled]), input")];
    focusables.at(-1).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(focusables[0]);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(focusables.at(-1));
  });
});

describe("RG4 — the greeter is told what will and will not be sent", () => {
  const data = (writesOpen) => ({
    cloudId: "c1", name: "החתונה", writesOpen,
    guests: [{ id: "g1", name: "יעל כהן", count: 1 }], tables: [], seating: {},
  });

  it("marking closed by the host: the waiting mark says it waits for that, not for the signal", async () => {
    hostess.mockResolvedValueOnce(data(true)).mockResolvedValue(data(false));
    mark.mockRejectedValue(new Error("invalid token"));
    greeter();
    fireEvent.change(await screen.findByLabelText("חיפוש אורח"), { target: { value: "יעל" } });
    fireEvent.click(screen.getByRole("button", { name: /^הגיע\/ה/ }));
    const msg = await screen.findByText(/לא נשמר: יעל כהן/);
    await waitFor(() => expect(msg.textContent).toMatch(/סגר את הסימון/));
    expect(msg.textContent).not.toMatch(/כשהחיבור יחזור/);
  });

  it("link replaced mid-shift: the marks that can never be sent are named", async () => {
    hostess.mockResolvedValueOnce(data(true)).mockResolvedValue(null);
    mark.mockRejectedValue(new Error("invalid token"));
    greeter();
    fireEvent.change(await screen.findByLabelText("חיפוש אורח"), { target: { value: "יעל" } });
    fireEvent.click(screen.getByRole("button", { name: /^הגיע\/ה/ }));
    expect(await screen.findByText(/הסימונים של יעל כהן לא נשמרו/)).toBeInTheDocument();
  });
});
