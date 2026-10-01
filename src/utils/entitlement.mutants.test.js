import { describe, it, expect, vi, afterEach } from "vitest";
import { planForEvent, isEventPaid, unpaidEventCount } from "./entitlement.js";

// Three edits to the entitlement rule passed the whole suite (third review,
// 29.9). This is the function that decides whether a host who paid sees the
// package they paid for, so each one is a paying customer on the free tier or a
// refunded one still on the paid tier.
//
// Not tested, because it cannot change any answer: dropping the unknown-plan
// guard in bestPlanOnAccount. `RANK[unknown]` is undefined, and `undefined > n`
// is false for every n, so an unknown plan can never become the best one —
// including "toString" and "__proto__" (a function / object compared with > is
// NaN, also false). The guard states the rule; the RANK lookup already enforces it.

const EV = { id: "local-1", cloudId: "cloud-1" };
const row = (over = {}) => ({ plan: "pro", event_id: "cloud-1", status: "active", expires_at: null, ...over });

afterEach(() => { vi.useRealTimers(); });

describe("isEventPaid: the top package is paid too", () => {
  // Enterprise is the ₪ on-site package — the most a host can pay. Asking
  // `=== "pro"` read it as unpaid: the event counts against the one-free-event
  // allowance, and the host who bought the biggest package is told to pay to
  // open their next event.
  it("an enterprise purchase makes the event paid and frees the allowance", () => {
    const purchases = [row({ plan: "enterprise" })];
    expect(isEventPaid(purchases, EV)).toBe(true);
    expect(unpaidEventCount(purchases, [EV, { id: "l2", cloudId: "cloud-2" }])).toBe(1);
  });
});

describe("a trialing row is live", () => {
  // `trialing` is one of the two statuses usePlan() selects (`.in("status",
  // ["active","trialing"])`) and the admin can set it on a comp. If this rule
  // disagreed, usePlan would fetch the row and planForEvent would throw it away:
  // support sees the comp in the admin panel, the host sees the free tier.
  it("status trialing → the plan applies", () => {
    expect(planForEvent([row({ status: "trialing" })], EV)).toBe("pro");
  });
  it("status cancelled → it does not", () => {
    expect(planForEvent([row({ status: "cancelled" })], EV)).toBe("free");
  });
});

describe("expires_at is the moment access ENDS", () => {
  // A refund writes expires_at = the moment of the refund. "Expires at T"
  // means not valid AT T — a row read in the same millisecond it was revoked is
  // revoked. Pinned with a frozen clock because it is a boundary: one
  // millisecond either side is covered by the other suites, this instant is not.
  it("expires_at === now → free; one ms later than now → still paid", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));
    expect(planForEvent([row({ expires_at: "2026-09-29T12:00:00.000Z" })], EV)).toBe("free");
    expect(planForEvent([row({ expires_at: "2026-09-29T12:00:00.001Z" })], EV)).toBe("pro");
  });
});
