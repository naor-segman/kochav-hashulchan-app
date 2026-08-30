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
