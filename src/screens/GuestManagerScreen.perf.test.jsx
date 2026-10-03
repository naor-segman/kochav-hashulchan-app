// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";

/* סב58: typing in the add form re-rendered every guest row. Measured in
 * Chromium, 800 guests, 4x CPU throttle, keydown→paint per character: ~240ms
 * before, ~40–56ms after (memoised rows ~110–150 alone, content-visibility
 * ~140–220 alone — both were needed).
 *
 * jsdom has no paint, so this pins the React half: a row renders by calling
 * guestCompanionNames(g) — counted here — and a keystroke in the name field
 * must not render the rows again. */

const calls = { n: 0 };
vi.mock("../utils/eventHelpers.js", async (orig) => {
  const m = await orig();
  return { ...m, guestCompanionNames: (g) => { calls.n++; return m.guestCompanionNames(g); } };
});
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
window.scrollTo = () => {};

const { normalizeEvent } = await import("../utils/eventHelpers.js");
const GuestManagerScreen = (await import("./GuestManagerScreen.jsx")).default;

const N = 200;
const ev = normalizeEvent({ id: "e1", name: "x", type: "חתונה",
  guests: Array.from({ length: N }, (_, i) => ({ id: "g" + i, name: "אורח " + i, side: "bride", count: 2, companions: ["מלווה " + i] })) });

describe("GuestManagerScreen — typing does not re-render the list (סב58)", () => {
  it("a keystroke in the name field renders no guest row", () => {
    render(<GuestManagerScreen activeEvent={ev} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /^מחקו: / })).toHaveLength(N);
    // Found by its placeholder: the form no longer focuses it on mount (V6).
    const name = screen.getByPlaceholderText("שם ושם משפחה");
    expect(name.tagName).toBe("INPUT");
    calls.n = 0;
    fireEvent.change(name, { target: { value: "ד" } });
    fireEvent.change(name, { target: { value: "דנ" } });
    expect(name.value).toBe("דנ");
    expect(calls.n).toBe(0);
  });

  it("but a row whose guest changed does render", () => {
    const { rerender } = render(<GuestManagerScreen activeEvent={ev} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />);
    calls.n = 0;
    const next = { ...ev, guests: ev.guests.map((g, i) => (i === 3 ? { ...g, name: "שונה" } : g)) };
    rerender(<GuestManagerScreen activeEvent={next} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />);
    expect(screen.getByRole("button", { name: "מחקו: שונה" })).toBeInTheDocument();
    expect(calls.n).toBeGreaterThan(0);
    expect(calls.n).toBeLessThan(N);
  });

  /* audit 3.10, V6: focusing the name field on mount scrolled a phone ~1,070px
   * down past the "how to add" choice before the host chose anything. */
  it("does not grab focus on arrival; picking manual entry focuses the name field", async () => {
    render(<GuestManagerScreen activeEvent={ev} patchEvent={vi.fn()} go={vi.fn()} showToast={vi.fn()} />);
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole("button", { name: /פשוט להקליד בעצמכם/ }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText("שם ושם משפחה")));
  });

  it("rows off screen skip layout and paint (the other half of the measurement)", () => {
    const css = readFileSync("src/screens/GuestManagerScreen.module.css", "utf8");
    expect(css).toMatch(/\.gRowLazy\s*\{[^}]*content-visibility:\s*auto/);
  });
});
