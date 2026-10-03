// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "../test/dom.js";

/* audit 3.10, C23. The product sells a one-time package per event — no
 * subscription, nothing to "upgrade" to — and no checkout is live yet. The
 * account screen's banners and section title still spoke of signing up to a
 * plan and upgrading. Rendered here in every state that shows one of them. */

const sub = { statusKey: "trialing" };
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1", email: "host@example.com" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../hooks/useSubscription.js", () => ({
  useSubscription: () => ({
    subscription: { plan: "pro", status: sub.statusKey }, planKey: "pro", statusKey: sub.statusKey,
    isPaymentFailed: false, isCancelling: false, refresh: () => {},
    refreshUntilPlanChanges: () => {},
  }),
}));

const AccountScreen = (await import("./AccountScreen.jsx")).default;
const textAt = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <AccountScreen eventCount={1} showToast={() => {}} />
  </MemoryRouter>,
).container.textContent;

const SUBSCRIPTION_WORDS = /לשדרג|שדרוג|שדרגו|הרשמה לתוכנית|ההרשמה לתוכנית|מנוי|תוכניות/;

describe("AccountScreen — no subscription vocabulary (audit 3.10, C23)", () => {
  it("the trial banner and the packages section", () => {
    const t = textAt("/account");
    expect(t).toMatch(/תקופת ניסיון/);           // the banner did render
    expect(t).toMatch(/החבילות לאירוע/);
    expect(t).not.toMatch(SUBSCRIPTION_WORDS);
  });

  it("after a completed checkout", () => {
    const t = textAt("/account?checkout=success");
    expect(t).toMatch(/התשלום התקבל/);
    expect(t).not.toMatch(SUBSCRIPTION_WORDS);
  });

  it("after a cancelled checkout", () => {
    const t = textAt("/account?checkout=cancelled");
    expect(t).toMatch(/הרכישה בוטלה — לא חויבתם/);
    expect(t).not.toMatch(SUBSCRIPTION_WORDS);
  });
});
