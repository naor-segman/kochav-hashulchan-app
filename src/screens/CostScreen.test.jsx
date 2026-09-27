// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../test/dom.js";

/* The budget screen's guest count, measured on the rendered DOM.
 *
 * WHAT WENT WRONG. `totalGuests` summed `count` over EVERY guest row, including
 * the ones who had said no. It was the only guest aggregate on the screen that
 * did: the three right below it filter `rsvp !== "declined"`, and so do the
 * seating screen, the entrance counter, the name-tag printer, the analytics and
 * the Excel export.
 *
 * Three numbers on the screen came out of it, and the third is the one that costs
 * money: "מספר אורחים", "עלות לאורח", and the catering hint — "קייטרינג = N
 * אורחים × ₪X לאורח" — which is a figure a host reads out to a caterer. A
 * declined family of six inflated it by six covers.
 *
 * It is measured here and not asserted from the function because the function is
 * a `useMemo` inside the component, and because the failure is what the host
 * READS, not what the reducer returns.
 */

// Supabase is absent locally (no .env), so the gift read on mount resolves to
// nothing. Mocked anyway so the test never depends on that being true.
vi.mock("../utils/publicTokens.js", () => ({
  fetchEventGifts: () => Promise.resolve([]),
  setGiftHidden:   () => Promise.resolve(),
}));

const CostScreen = (await import("./CostScreen.jsx")).default;

/** 100 attending people in 25 rows, plus a family of six who declined. */
const ev = {
  id: "e1",
  type: "חתונה",
  guests: [
    ...Array.from({ length: 25 }, (_, i) => ({ id: `g${i}`, name: `א${i}`, count: 4, rsvp: "yes" })),
    { id: "no1", name: "משפחה שלא באה", count: 6, rsvp: "declined" },
  ],
  tables: [],
  // ₪20,000 actual, all of it catering, so both per-guest figures are exact.
  costs: { categories: [{ id: "c1", name: "קייטרינג", budget: "20000", actual: "20000" }] },
};

const renderScreen = () =>
  render(<CostScreen activeEvent={ev} patchEvent={() => {}} showToast={() => {}} />);

describe("CostScreen — a guest who said no is not a cover", () => {
  it("counts 100 attending people, not 106", () => {
    renderScreen();
    // The stat is rendered with he-IL grouping, so the string is what to look for.
    expect(screen.getByText("מספר אורחים")).toBeInTheDocument();
    const stat = screen.getByText("מספר אורחים").previousSibling;
    expect(stat.textContent.replace(/[^\d]/g, "")).toBe("100");
  });

  it("divides the cost by the people who are coming", () => {
    renderScreen();
    // ₪20,000 / 100 = ₪200. Over 106 it would have read ₪189.
    const stat = screen.getByText("עלות לאורח").previousSibling;
    expect(stat.textContent).toContain("200");
    expect(stat.textContent).not.toContain("189");
  });

  it("quotes the caterer the number of covers they will serve", () => {
    renderScreen();
    const hint = screen.getByText(/קייטרינג =/);
    expect(hint.textContent).toContain("100");
    expect(hint.textContent).not.toContain("106");
  });
});
