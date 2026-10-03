// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, within } from "../../test/dom.js";

/* סב39: "active purchases" on the dashboard and on the purchases screen's plan
 * cards are counted by the customer app's entitlement rule (entitlement.js),
 * not by the status column. Every row below says status active or trialing;
 * only two of them grant anything. */
const FUTURE = "2099-01-01T00:00:00Z";
const PAST   = "2020-01-01T00:00:00Z";
const base = { created_at: "2026-09-30T10:00:00Z", profiles: { email: "h@x.test" }, events: { name: "אירוע" } };
const ROWS = [
  // grants pro — live, attached to an event
  { ...base, id: "s1", plan: "pro", status: "active", expires_at: null, event_id: "e1", is_manually_managed: false },
  // grants enterprise — an admin comp on the whole account, trialing
  { ...base, id: "s2", plan: "enterprise", status: "trialing", expires_at: FUTURE, event_id: null, is_manually_managed: true },
  // grants nothing — refunded: still "active", expires_at in the past
  { ...base, id: "s3", plan: "pro", status: "active", expires_at: PAST, event_id: "e3", is_manually_managed: false },
  // grants nothing — its event was deleted (orphan), not a comp
  { ...base, id: "s4", plan: "pro", status: "active", expires_at: null, event_id: null, is_manually_managed: false },
  // grants nothing — an unknown plan key
  { ...base, id: "s5", plan: "gold", status: "active", expires_at: null, event_id: "e5", is_manually_managed: false },
];
let REFUSE_EMBED = false;
let SUBS_COUNT = null;   // the exact count PostgREST reports beside the rows
function builder(table) {
  const q = { head: false, cols: "" };
  const b = {
    select: (c, opts) => { q.cols = c || ""; if (opts?.head) q.head = true; return b; },
    order: () => b, limit: () => b, eq: () => b, in: () => b,
    then: (res, rej) => {
      let out;
      if (table !== "subscriptions") out = { data: null, count: 3, error: null };
      else if (q.head) out = { data: null, count: ROWS.length, error: null };
      else if (REFUSE_EMBED && q.cols.includes("events!")) out = { data: null, error: { message: "Could not find a relationship" } };
      else out = { data: ROWS, count: SUBS_COUNT ?? ROWS.length, error: null };
      return Promise.resolve(out).then(res, rej);
    },
  };
  return b;
}
vi.mock("../../lib/supabase.js", () => ({
  isSupabaseConfigured: true,
  supabase: { from: (t) => builder(t), auth: { getUser: async () => ({ data: { user: { email: "admin@x.test" } } }), signOut: async () => ({}) } },
}));
const { default: AdminDashboardScreen } = await import("./AdminDashboardScreen.jsx");
const { default: AdminSubscriptionsScreen } = await import("./AdminSubscriptionsScreen.jsx");

beforeEach(() => { REFUSE_EMBED = false; SUBS_COUNT = null; });

describe("admin dashboard — active purchases by the entitlement rule", () => {
  it("counts the two rows that grant something, not the five that say active", async () => {
    const { container } = render(<MemoryRouter><AdminDashboardScreen /></MemoryRouter>);
    const label = await screen.findByText(/^רכישות פעילות/);
    const card = label.parentElement;
    await within(card).findByText("2");
    expect(within(card).queryByText("5")).toBeNull();
    expect(container.textContent).not.toMatch(/לפחות/);
  });

  it("says 'at least' when PostgREST returned fewer rows than it counted", async () => {
    SUBS_COUNT = 1500;
    render(<MemoryRouter><AdminDashboardScreen /></MemoryRouter>);
    expect(await screen.findByText(/רכישות פעילות · לפחות/)).toBeTruthy();
  });
});

describe("admin purchases — plan cards by the entitlement rule", () => {
  it("pro: one (the refund and the orphan do not count); enterprise: the comp counts", async () => {
    render(<MemoryRouter><AdminSubscriptionsScreen /></MemoryRouter>);
    await screen.findByText("סקירת תוכניות");
    const counts = [...document.querySelectorAll("[class*=planCardCount]")].map(n => n.textContent);
    // PLAN_KEYS order: free, pro, enterprise. "free" is never a live purchase:
    // what grants nothing resolves to "free", so it must not count those.
    expect(counts).toEqual(["אין רכישות פעילות", "רכישה פעילה אחת", "רכישה פעילה אחת"]);
  });

  it("without the event columns it says it cannot count, rather than zero", async () => {
    REFUSE_EMBED = true;
    render(<MemoryRouter><AdminSubscriptionsScreen /></MemoryRouter>);
    await screen.findByText("סקירת תוכניות");
    const counts = [...document.querySelectorAll("[class*=planCardCount]")].map(n => n.textContent);
    expect(new Set(counts)).toEqual(new Set(["לא ניתן לספור — חסר שיוך לאירוע"]));
  });
});
