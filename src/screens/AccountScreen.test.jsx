// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../test/dom.js";

/* The account screen's route to feedback.  Checklist 25.
 *
 * WHY THIS FILE EXISTS. The link was verified in a real browser and the check
 * reported FAIL — not because the link was missing, but because `/account`
 * redirects a signed-out visitor to `/login`, so the harness never reached the
 * screen at all. "The link is in the source" is then an assertion, not a
 * measurement, and this repo has already been bitten twice by exactly that gap
 * (see the note at the top of ShareLinksScreen.test.jsx).
 *
 * So it is measured here instead, on the rendered output of the real screen
 * with a signed-in user — the same shape as the fix that closed item 1.
 *
 * What it guards: the link used to be a `mailto:` that went to a mailbox which
 * does not exist yet. Reverting it to one is silent — nothing throws, the link
 * still renders, and a pilot user's bug report goes nowhere.
 */

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1", email: "host@example.com" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));

/* The plan cards live behind `{sub !== undefined && …}`, and `useSubscription`
   never resolves without Supabase — there is no local .env, so a local render is
   permanently "still loading" and the cards are simply absent. That is why this
   mock exists: a signed-in host on the FREE plan, which is the state the plan
   comparison is for. Without it the assertions below would pass on an empty
   document, which is the shape of hole this repo has hit twice. */
vi.mock("../hooks/useSubscription.js", () => ({
  useSubscription: () => ({
    subscription: null, planKey: "free", statusKey: null,
    isPaymentFailed: false, isCancelling: false, refresh: () => {},
    refreshUntilPlanChanges: () => {},
  }),
}));

const AccountScreen = (await import("./AccountScreen.jsx")).default;

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={["/account"]}>
      <AccountScreen eventCount={3} showToast={() => {}} />
    </MemoryRouter>,
  );

describe("AccountScreen — reporting a problem", () => {
  it("routes to the feedback form, not to a mailbox", () => {
    renderScreen();
    const link = screen.getByRole("link", { name: /משוב|בעיה/ });
    expect(link.getAttribute("href")).toBe("/feedback");
  });

  it("does not offer a mailto: as the way to report a bug", () => {
    // The specific regression this closes. A `mailto:` here depends on the
    // reader having a mail client, carries no context about which screen or
    // browser, and points at a domain with no mailbox behind it until
    // checklist 13 lands.
    renderScreen();
    const link = screen.getByRole("link", { name: /משוב|בעיה/ });
    expect(link.getAttribute("href")).not.toMatch(/^mailto:/);
  });
});

/* The plan cards, measured on the rendered DOM rather than read out of the
 * function that builds them.
 *
 * WHAT WENT WRONG. `planFeatures()` built its rows out of `maxEvents` and
 * `maxGuests`. When both went to Infinity on every paid plan, the ₪690 card and
 * the ₪1,290 card came out BYTE-IDENTICAL — "∞ אירועים" and "∞ אורחים" twice —
 * and `free` differed from them in one row. This is the screen where someone
 * decides to pay, and its comparison table had stopped comparing.
 *
 * Nothing failed. No test covered it, `eslint` had nothing to say, and the two
 * cards still rendered beautifully.
 */
describe("AccountScreen — the plan cards actually differ", () => {
  const cardTexts = () => {
    renderScreen();
    return [...document.querySelectorAll("ul")]
      .map(ul => [...ul.querySelectorAll("li")].map(li => li.textContent.trim()).join(" | "))
      .filter(t => t.includes("הושבה אוטומטית"));
  };

  it("renders three feature lists, no two the same", () => {
    const lists = cardTexts();
    expect(lists.length).toBe(3);
    expect(new Set(lists).size).toBe(3);
  });

  it("the seating ceiling is what separates free from paid", () => {
    const lists = cardTexts();
    expect(lists.filter(t => /עד 200 אנשים/.test(t)).length).toBe(1);
    expect(lists.filter(t => /בלי תקרה/.test(t)).length).toBe(2);
  });

  it("only the top package names the person at the door, and says it is a service", () => {
    // The equivalent of the pricing page's "בשטח" badge. A human standing at a
    // door must never read as something the software does.
    const lists = cardTexts();
    const human = lists.filter(t => /מנהל הושבה/.test(t));
    expect(human.length).toBe(1);
    expect(human[0]).toMatch(/בשטח/);
  });
});

describe("AccountScreen — landmarks (38a)", () => {
  it("is one <main>, holding the page's h1", () => {
    // A top-level route outside Shell, so nothing else supplies the landmark —
    // and the browser harness cannot reach it signed out (it redirects).
    renderScreen();
    expect(document.querySelectorAll("main, [role=main]")).toHaveLength(1);
    expect(screen.getByRole("main").querySelector("h1")?.textContent).toBe("החשבון שלי");
  });
});
