// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, act } from "../test/dom.js";

// 136 stage D (review 5.10). After an automatic run that left families
// standing, the toast said "הוסיפו מקומות נוספים" even with 70 seats free —
// the seats were scattered and a family does not split. It now says which of
// the two it is: scattered free seats, or a real shortage of N.

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1", email: "host@example.com" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));

const SeatingScreen = (await import("./SeatingScreen.jsx")).default;

const event = (tables, cap, families, size) => ({
  id: "e1", name: "אירוע", type: "חתונה", date: "2027-06-01",
  guests: Array.from({ length: families }, (_, i) => ({ id: "g" + i, name: "משפחה " + i, rsvp: "confirmed", count: size })),
  tables: Array.from({ length: tables }, (_, i) => ({ id: "t" + i, name: "שולחן " + (i + 1), capacity: cap })),
  seating: {}, constraints: [], lockedGuests: [], lockedTables: [],
});

function run(ev) {
  const showToast = vi.fn();
  const { container } = render(
    <MemoryRouter><SeatingScreen activeEvent={ev} patchEvent={() => {}} go={() => {}} showToast={showToast} /></MemoryRouter>,
  );
  const btn = [...container.querySelectorAll("button")].find(b => /הושבה אוטומטית/.test(b.textContent));
  expect(btn).toBeTruthy();
  act(() => { btn.click(); });
  return showToast.mock.calls.map(c => c[0]).join(" | ");
}

describe("SeatingScreen — what the automatic run says when families are left", () => {
  it("free seats that would hold them, scattered: says so, not 'add seats'", () => {
    // 35 tables of 10, 82 families of 4: two per table = 70 placed, 70 seats
    // free in twos, 12 families (48 people) waiting.
    const msg = run(event(35, 10, 82, 4));
    expect(msg).toMatch(/12 לא נכנסו/);
    expect(msg).toMatch(/יש 70 מקומות פנויים, אבל מפוזרים/);
    expect(msg).not.toMatch(/חסרים/);
  });

  it("a real shortage: says how many seats are missing", () => {
    // 5 × 10 for 20 families of 4: 10 placed (40), 10 seats free, 40 waiting.
    const msg = run(event(5, 10, 20, 4));
    expect(msg).toMatch(/חסרים עוד 30 מקומות/);
    expect(msg).not.toMatch(/מפוזרים/);
  });
});
