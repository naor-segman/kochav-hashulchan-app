// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../test/dom.js";

/* The event's package card — the only place in the product where money can be
 * spent, measured on the rendered DOM.
 *
 * The assertion that matters most is the last one: that the click hands
 * `startCheckout` the EVENT and not just a plan key. A purchase unlocks one
 * event, so a checkout opened without one writes an account-wide entitlement —
 * one payment, every event unlocked, which is exactly the model this change
 * removes. And it would never show up as an error: the charge succeeds, the
 * host gets more than they paid for, and the only trace is revenue that never
 * arrived.
 */

let authValue;
let purchases;
let stripeConfigured;
const startCheckout = vi.fn();

vi.mock("../../hooks/useAuth.js", () => ({ useAuth: () => authValue }));
vi.mock("../../hooks/usePlan.js", async () => {
  const { planForEvent } = await import("../../utils/entitlement.js");
  return {
    usePlan: (ev) => ({ plan: planForEvent(purchases, ev), loading: false }),
  };
});
vi.mock("../../hooks/useBilling.js", () => ({
  useBilling: () => ({ startCheckout, checkoutTarget: null, error: null }),
}));
vi.mock("../../admin/lib/stripeConfig.js", () => ({
  get isStripeConfigured() { return stripeConfigured; },
  isPaidPlan: (p) => p === "pro" || p === "enterprise",
}));

const EventPlanCard = (await import("./EventPlanCard.jsx")).default;

const WEDDING = { id: "local-wedding", cloudId: "cloud-wedding", name: "נאור ומיכל" };

beforeEach(() => {
  authValue = { user: { id: "u1" }, loading: false };
  purchases = [];
  stripeConfigured = true;
  startCheckout.mockClear();
});

describe("EventPlanCard — an unpaid event", () => {
  it("offers the ₪690 package, with the price on the button", () => {
    render(<EventPlanCard ev={WEDDING} />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("₪690");
  });

  it("says the payment is per event and not a subscription", () => {
    render(<EventPlanCard ev={WEDDING} />);
    expect(document.body.textContent).toContain("לא מנוי");
  });

  it("hands startCheckout the EVENT, not just a plan", () => {
    render(<EventPlanCard ev={WEDDING} />);
    screen.getByRole("button").click();
    expect(startCheckout).toHaveBeenCalledTimes(1);
    const [planKey, event] = startCheckout.mock.calls[0];
    expect(planKey).toBe("pro");
    // The event object, because the cloud id is what a purchase references and
    // no caller should have to remember which of an event's two ids that is.
    expect(event).toBe(WEDDING);
    expect(event.cloudId).toBe("cloud-wedding");
  });
});

describe("EventPlanCard — when buying is not possible, it says why", () => {
  /* A disabled button with no explanation is what makes a host think the
     product is broken. Each of these is a real state: signed out (guest mode is
     a supported way to use this app), an event that has not reached the cloud
     yet, and Stripe not configured — which is the state TODAY. */

  it("signed out", () => {
    authValue = { user: null, loading: false };
    render(<EventPlanCard ev={WEDDING} />);
    expect(screen.getByRole("button").disabled).toBe(true);
    expect(document.body.textContent).toContain("מחוברים לחשבון");
  });

  it("an event that has never reached the cloud", () => {
    // No cloudId — a guest-mode draft, or a sync that has not landed. The
    // purchase could not be attached to anything, so it must not be offered.
    render(<EventPlanCard ev={{ id: "local-x", cloudId: null, name: "טיוטה" }} />);
    expect(screen.getByRole("button").disabled).toBe(true);
    expect(document.body.textContent).toContain("בענן");
  });

  it("Stripe not configured — which is the state right now", () => {
    stripeConfigured = false;
    render(<EventPlanCard ev={WEDDING} />);
    expect(screen.getByRole("button").disabled).toBe(true);
    expect(document.body.textContent).toContain("בקרוב");
  });

  it("never fires a checkout while blocked", () => {
    stripeConfigured = false;
    render(<EventPlanCard ev={WEDDING} />);
    screen.getByRole("button").click();
    expect(startCheckout).not.toHaveBeenCalled();
  });
});

describe("EventPlanCard — a paid event", () => {
  const bought = [{ plan: "pro", event_id: "cloud-wedding", status: "active", expires_at: null }];

  it("says it was purchased, in a word and not only in a colour", () => {
    purchases = bought;
    render(<EventPlanCard ev={WEDDING} />);
    expect(document.body.textContent).toContain("נרכש");
  });

  it("stops offering to sell it again", () => {
    purchases = bought;
    render(<EventPlanCard ev={WEDDING} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("still offers the package on the host's OTHER event", () => {
    // The point of the whole change: the wedding is paid for, the bar mitzvah
    // is not, and the same host sees both answers.
    purchases = bought;
    render(<EventPlanCard ev={{ id: "local-bar", cloudId: "cloud-bar", name: "בר מצווה" }} />);
    expect(screen.getByRole("button").textContent).toContain("₪690");
  });
});
