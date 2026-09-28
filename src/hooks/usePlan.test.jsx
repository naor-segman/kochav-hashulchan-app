// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./../test/dom.js";

// usePlan resolves the plan that featureGates consumes. featureGates itself is
// well tested; the thing feeding it had nothing. Every branch here fails the
// same direction on purpose — towards "free" — because the alternative is
// showing a paying customer a locked feature, or a free account a paid one, on
// the strength of a network error.
//
// It is now PER EVENT, and the shape of the query changed with it: the hook used
// to end its chain on `.maybeSingle()` and take one row, which is precisely how
// a per-event model collapses into a per-account one. It now reads every live
// purchase and resolves the event against them, so the mock below is thenable at
// `.order()` and `data` is an ARRAY.

let authValue;   // what useAuth returns
let queryResult; // what the subscriptions query resolves (or rejects) with

vi.mock("./useAuth.js", () => ({ useAuth: () => authValue }));

// A thenable query builder: the real chain now ends on .order() and is awaited.
export let chain = [];
const settle = () => queryResult instanceof Error
  ? Promise.reject(queryResult)
  : Promise.resolve(queryResult);
const builder = {
  from(t) { chain.push(["from", t]); return this; },
  select(c) { chain.push(["select", c]); return this; },
  eq(c, v) { chain.push(["eq", c, v]); return this; },
  in(c, v) { chain.push(["in", c, v]); return this; },
  limit(n) { chain.push(["limit", n]); return this; },
  order(c, o) { chain.push(["order", c, o]); return this; },
  maybeSingle() { chain.push(["maybeSingle"]); return settle(); },
  // Awaiting the builder is what the hook does now.
  then(res, rej) { return settle().then(res, rej); },
};
vi.mock("../lib/supabase.js", () => ({
  supabase: { from: (t) => builder.from(t) },
  isSupabaseConfigured: true,
}));

const { usePlan } = await import("./usePlan.js");

/** An event as the app holds it: routed on `id`, purchased on `cloudId`. */
const ev = (localId, cloudId) => ({ id: localId, cloudId });
const WEDDING = ev("local-wedding", "cloud-wedding");

/** `event === undefined` exercises the account-level form: the hook branches on
    the argument being undefined, so passing it through is the same call. */
function Probe({ event }) {
  const { plan, limits, loading } = usePlan(event);
  return <div data-testid="p">{`${plan}|${loading ? "loading" : "ready"}|${limits ? "limits" : "NO-LIMITS"}`}</div>;
}
const planOf = () => screen.getByTestId("p").textContent.split("|")[0];
const limitsOf = () => screen.getByTestId("p").textContent.split("|")[2];

/** One live purchase for the wedding. */
const boughtWedding = (plan = "pro") => ({
  data: [{ plan, event_id: "cloud-wedding", status: "active", expires_at: null, started_at: "2026-09-01" }],
  error: null,
});

beforeEach(() => {
  authValue = { user: { id: "u1" }, loading: false };
  queryResult = { data: [], error: null };
  chain = [];
});

describe("usePlan — the plan featureGates is handed", () => {
  it("is free for a visitor who is not signed in", async () => {
    authValue = { user: null, loading: false };
    render(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("free"));
  });

  it("is free for a signed-in account that has bought nothing", async () => {
    render(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("free"));
  });

  it("is the purchased plan for the event it was bought for", async () => {
    queryResult = boughtWedding();
    render(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("pro"));
  });

  it("is free for the host's OTHER event", async () => {
    // The bug this hook was rewritten to not have: one payment unlocked the
    // account, so the bar mitzvah came pre-paid with the wedding.
    queryResult = boughtWedding();
    render(<Probe event={ev("local-bar", "cloud-bar")} />);
    await waitFor(() => expect(planOf()).toBe("free"));
  });

  it("is free when handed the LOCAL id instead of the event object", async () => {
    // An event has two ids and only `cloudId` is the one a purchase references.
    // A call site passing `ev.id` is the quiet version of this bug: it matches
    // nothing, so a paying customer sees the free tier and nothing throws.
    queryResult = boughtWedding();
    render(<Probe event={{ id: "cloud-wedding" }} />);
    await waitFor(() => expect(planOf()).toBe("free"));
  });

  // Failing towards "free" is the deliberate choice: a network blip must not
  // unlock paid features, and it must not crash the screen either.
  it("falls back to free when the query throws rather than breaking the screen", async () => {
    queryResult = new Error("network down");
    render(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("free"));
  });

  it("falls back to free on a malformed payload", async () => {
    for (const data of [null, undefined, {}, [null], [{ plan: null, event_id: "cloud-wedding" }]]) {
      queryResult = { data, error: null };
      const { unmount } = render(<Probe event={WEDDING} />);
      await waitFor(() => expect(planOf()).toBe("free"));
      unmount();
    }
  });

  // limits is read without checking, so an undefined here is a crash on every
  // screen that shows a cap.
  it("always hands back a limits object, whatever the plan resolved to", async () => {
    for (const plan of ["pro", "enterprise", "לא קיים"]) {
      queryResult = boughtWedding(plan);
      const { unmount } = render(<Probe event={WEDDING} />);
      await waitFor(() => expect(limitsOf()).toBe("limits"));
      unmount();
    }
  });

  it("moves off free when the user arrives after auth finishes loading", async () => {
    authValue = { user: null, loading: true };
    const { rerender } = render(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("free"));
    queryResult = boughtWedding();
    authValue = { user: { id: "u1" }, loading: false };
    rerender(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("pro"));
  });

  // Only an active or trialing purchase counts. Without the filter a cancelled
  // row still resolves as paid, and a refunded event keeps every paid feature.
  it("only counts a purchase that is actually live", async () => {
    render(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("free"));
    const statuses = chain.find(c => c[0] === "in" && c[1] === "status");
    expect(statuses, "the status filter is missing entirely").toBeTruthy();
    expect(statuses[2]).toEqual(["active", "trialing"]);
  });

  it("scopes the query to this user", async () => {
    render(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("free"));
    expect(chain.find(c => c[0] === "eq" && c[1] === "user_id")).toEqual(["eq", "user_id", "u1"]);
  });

  it("asks for event_id and expires_at, or per-event entitlement cannot work", async () => {
    // The column this whole model rests on, and the one a refund revokes with.
    // Selecting neither is a silent regression: every event reads free.
    render(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("free"));
    const sel = chain.find(c => c[0] === "select");
    expect(sel[1]).toContain("event_id");
    expect(sel[1]).toContain("expires_at");
  });

  it("does not take just the newest purchase", async () => {
    // `.limit(1)` is how three events' worth of purchases became one plan.
    render(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("free"));
    expect(chain.find(c => c[0] === "limit")).toBeUndefined();
  });

  it("resolves several events from one query", async () => {
    queryResult = {
      data: [
        { plan: "pro",        event_id: "cloud-wedding", status: "active", expires_at: null, started_at: "2026-09-01" },
        { plan: "enterprise", event_id: "cloud-bar",     status: "active", expires_at: null, started_at: "2026-09-02" },
      ],
      error: null,
    };
    const { unmount } = render(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("pro"));
    unmount();
    render(<Probe event={ev("local-bar", "cloud-bar")} />);
    await waitFor(() => expect(planOf()).toBe("enterprise"));
  });

  // Signing OUT has to drop the plan back, or a shared device keeps showing the
  // previous account's paid features to whoever picks it up next.
  it("falls back to free when the user signs out of a paid account", async () => {
    queryResult = boughtWedding();
    const { rerender } = render(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("pro"));
    authValue = { user: null, loading: false };
    rerender(<Probe event={WEDDING} />);
    await waitFor(() => expect(planOf()).toBe("free"));
  });
});

describe("usePlan() with no event — the account-level form", () => {
  it("reports the best purchase anywhere, for the screens with no event", async () => {
    queryResult = boughtWedding();
    render(<Probe />);
    await waitFor(() => expect(planOf()).toBe("pro"));
  });

  it("is free when nothing has been bought", async () => {
    render(<Probe />);
    await waitFor(() => expect(planOf()).toBe("free"));
  });
});
