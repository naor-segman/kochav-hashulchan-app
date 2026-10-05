// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { render, screen, act } from "../../test/dom.js";

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
// What the server holds when the card re-reads it; null = same as `purchases`.
let serverRows = null;
let refreshes = 0;
vi.mock("../../hooks/usePlan.js", async () => {
  const { planForEvent } = await import("../../utils/entitlement.js");
  const React = await import("react");
  return {
    usePlan: (ev) => {
      const [rows, setRows] = React.useState(purchases);
      return {
        plan: planForEvent(rows, ev), loading: false,
        refresh: async () => { refreshes++; const r = serverRows ?? purchases; setRows(r); return r; },
      };
    },
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

let lastSearch = null;
function Spy() { lastSearch = useLocation().search; return null; }
const renderCard = (el, url = "/events/local-wedding") => render(
  <MemoryRouter initialEntries={[url]}><Routes><Route path="/events/:id" element={<>{el}<Spy /></>} /></Routes></MemoryRouter>);

// 320 people in two rows — the price is per PERSON and rounds UP to the 350
// step (₪399); to the nearest it would be the 300 step, ₪349.
const WEDDING = { id: "local-wedding", cloudId: "cloud-wedding", name: "נאור ומיכל",
  guests: [{ id: "g1", count: 200 }, { id: "g2", count: 120 }] };

beforeEach(() => {
  authValue = { user: { id: "u1" }, loading: false };
  purchases = [];
  stripeConfigured = true;
  startCheckout.mockClear();
  serverRows = null; refreshes = 0; lastSearch = null;
});

describe("EventPlanCard — an unpaid event", () => {
  it("offers the package at THIS event's price, on the button", () => {
    renderCard(<EventPlanCard ev={WEDDING} />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("₪399");
    expect(document.body.textContent).toContain("עד 350 מוזמנים");
  });

  it("people who declined are not priced — the same count as the seating gate", () => {
    // 320 coming + 200 declined: still the 350 step, not 550.
    renderCard(<EventPlanCard ev={{ ...WEDDING, guests: [...WEDDING.guests, { id: "g3", count: 200, rsvp: "declined" }, null] }} />);
    expect(screen.getByRole("button").textContent).toContain("₪399");
  });

  it("signed out: the price line stays, and the reason comes with a way forward", () => {
    authValue = { user: null, loading: false };
    renderCard(<EventPlanCard ev={WEDDING} />);
    expect(document.body.textContent).toContain("עד 350 מוזמנים");
    expect(document.body.textContent).toContain("כדי לרכוש צריך להיות מחוברים לחשבון");
    expect(screen.getByRole("link", { name: "פתיחת חשבון חינם" }).getAttribute("href")).toBe("/signup");
  });

  it("above 1,000 people there is no price to press — a quote, on WhatsApp", () => {
    renderCard(<EventPlanCard ev={{ ...WEDDING, guests: [{ id: "g", count: 1001 }] }} />);
    expect(screen.queryByRole("button")).toBeNull();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(decodeURIComponent(link.getAttribute("href"))).toContain("1001 מוזמנים");
    expect(document.body.textContent).not.toMatch(/₪/);
  });

  it("says the payment is per event and not a subscription", () => {
    renderCard(<EventPlanCard ev={WEDDING} />);
    expect(document.body.textContent).toContain("לא מנוי");
  });

  it("hands startCheckout the EVENT, not just a plan", () => {
    renderCard(<EventPlanCard ev={WEDDING} />);
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
    renderCard(<EventPlanCard ev={WEDDING} />);
    expect(screen.getByRole("button").disabled).toBe(true);
    expect(document.body.textContent).toContain("מחוברים לחשבון");
  });

  it("an event that has never reached the cloud", () => {
    // No cloudId — a guest-mode draft, or a sync that has not landed. The
    // purchase could not be attached to anything, so it must not be offered.
    renderCard(<EventPlanCard ev={{ id: "local-x", cloudId: null, name: "טיוטה" }} />);
    expect(screen.getByRole("button").disabled).toBe(true);
    expect(document.body.textContent).toContain("בענן");
  });

  it("Stripe not configured — which is the state right now", () => {
    stripeConfigured = false;
    renderCard(<EventPlanCard ev={WEDDING} />);
    expect(screen.getByRole("button").disabled).toBe(true);
    expect(document.body.textContent).toContain("בקרוב");
  });

  it("never fires a checkout while blocked", () => {
    stripeConfigured = false;
    renderCard(<EventPlanCard ev={WEDDING} />);
    screen.getByRole("button").click();
    expect(startCheckout).not.toHaveBeenCalled();
  });
});

describe("EventPlanCard — a paid event", () => {
  const bought = [{ plan: "pro", event_id: "cloud-wedding", status: "active", expires_at: null }];

  it("says it was purchased, in a word and not only in a colour", () => {
    purchases = bought;
    renderCard(<EventPlanCard ev={WEDDING} />);
    expect(document.body.textContent).toContain("נרכש");
  });

  it("stops offering to sell it again", () => {
    purchases = bought;
    renderCard(<EventPlanCard ev={WEDDING} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("still offers the package on the host's OTHER event", () => {
    // The point of the whole change: the wedding is paid for, the bar mitzvah
    // is not, and the same host sees both answers.
    purchases = bought;
    // No guests yet: the smallest step, 100 people.
    renderCard(<EventPlanCard ev={{ id: "local-bar", cloudId: "cloud-bar", name: "בר מצווה" }} />);
    expect(screen.getByRole("button").textContent).toContain("₪149");
  });
});

describe("EventPlanCard — back from checkout (29.9 review)", () => {
  /* The checkout returns to /events/:id?checkout=success, and nothing on the
     event read it: the host who had just paid landed on a card still offering
     the purchase (the redirect beats the webhook), with a live button that
     would have charged them twice. */
  const bought = [{ plan: "pro", event_id: "cloud-wedding", status: "active", expires_at: null }];
  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

  it("says the payment arrived, and takes the buy button away while it waits for the webhook", async () => {
    vi.useFakeTimers();
    try {
      renderCard(<EventPlanCard ev={WEDDING} />, "/events/local-wedding?checkout=success");
      await flush();
      expect(document.body.textContent).toContain("התשלום התקבל — מעדכנים");
      expect(screen.queryByRole("button")).toBeNull();
      expect(lastSearch).toBe("");                                   // a refresh does not replay it
      serverRows = bought;                                           // the webhook lands
      await act(async () => { vi.advanceTimersByTime(3000); });
      await flush();
      expect(document.body.textContent).toContain("החבילה פעילה לאירוע הזה");
      expect(document.body.textContent).toContain("נרכש");
      expect(screen.queryByRole("button")).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it("a slow webhook: it stops asking, says so, and still does not offer to charge again", async () => {
    vi.useFakeTimers();
    try {
      renderCard(<EventPlanCard ev={WEDDING} />, "/events/local-wedding?checkout=success");
      for (let i = 0; i < 12; i++) { await flush(); await act(async () => { vi.advanceTimersByTime(3000); }); }
      expect(refreshes).toBe(10);
      expect(document.body.textContent).toContain("אין צורך לשלם שוב");
      expect(screen.queryByRole("button")).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it("a cancelled checkout says nothing was charged, and the offer stays", async () => {
    renderCard(<EventPlanCard ev={WEDDING} />, "/events/local-wedding?checkout=cancelled");
    await flush();
    expect(document.body.textContent).toContain("לא חויבתם");
    expect(screen.getByRole("button").textContent).toContain("₪399");
    expect(refreshes).toBe(0);
  });
});
