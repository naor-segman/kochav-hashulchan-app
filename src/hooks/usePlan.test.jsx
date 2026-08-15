// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./../test/dom.js";

// usePlan resolves the plan that featureGates consumes. featureGates itself is
// well tested; the thing feeding it had nothing. Every branch here fails the
// same direction on purpose — towards "free" — because the alternative is
// showing a paying customer a locked feature, or a free account a paid one, on
// the strength of a network error.

let authValue;   // what useAuth returns
let queryResult; // what the subscriptions query resolves (or rejects) with

vi.mock("./useAuth.js", () => ({ useAuth: () => authValue }));

// A thenable query builder: the real chain ends on .maybeSingle().
export let chain = [];
const builder = {
  from(t) { chain.push(["from", t]); return this; },
  select(c) { chain.push(["select", c]); return this; },
  eq(c, v) { chain.push(["eq", c, v]); return this; },
  in(c, v) { chain.push(["in", c, v]); return this; },
  order() { return this; }, limit() { return this; },
  maybeSingle() {
    return queryResult instanceof Error ? Promise.reject(queryResult)
                                        : Promise.resolve(queryResult);
  },
};
vi.mock("../lib/supabase.js", () => ({
  supabase: { from: (t) => builder.from(t) },
  isSupabaseConfigured: true,
}));

const { usePlan } = await import("./usePlan.js");

function Probe() {
  const { plan, limits, loading } = usePlan();
  return <div data-testid="p">{`${plan}|${loading ? "loading" : "ready"}|${limits ? "limits" : "NO-LIMITS"}`}</div>;
}
const planOf = () => screen.getByTestId("p").textContent.split("|")[0];
const limitsOf = () => screen.getByTestId("p").textContent.split("|")[2];

beforeEach(() => {
  authValue = { user: { id: "u1" }, loading: false };
  queryResult = { data: null, error: null };
  chain = [];
});

describe("usePlan — the plan featureGates is handed", () => {
  it("is free for a visitor who is not signed in", async () => {
    authValue = { user: null, loading: false };
    render(<Probe />);
    await waitFor(() => expect(planOf()).toBe("free"));
  });

  it("is free for a signed-in account with no subscription row", async () => {
    render(<Probe />);
    await waitFor(() => expect(planOf()).toBe("free"));
  });

  it("is the subscribed plan for an active subscription", async () => {
    queryResult = { data: { plan: "pro" }, error: null };
    render(<Probe />);
    await waitFor(() => expect(planOf()).toBe("pro"));
  });

  // Failing towards "free" is the deliberate choice: a network blip must not
  // unlock paid features, and it must not crash the screen either.
  it("falls back to free when the query throws rather than breaking the screen", async () => {
    queryResult = new Error("network down");
    render(<Probe />);
    await waitFor(() => expect(planOf()).toBe("free"));
  });

  it("falls back to free on a malformed row", async () => {
    for (const data of [{}, { plan: null }, { plan: undefined }]) {
      queryResult = { data, error: null };
      const { unmount } = render(<Probe />);
      await waitFor(() => expect(planOf()).toBe("free"));
      unmount();
    }
  });

  // limits is read without checking, so an undefined here is a crash on every
  // screen that shows a cap.
  it("always hands back a limits object, whatever the plan resolved to", async () => {
    for (const data of [null, { plan: "pro" }, { plan: "enterprise" }, { plan: "לא קיים" }]) {
      queryResult = { data, error: null };
      const { unmount } = render(<Probe />);
      await waitFor(() => expect(limitsOf()).toBe("limits"));
      unmount();
    }
  });

  it("moves off free when the user arrives after auth finishes loading", async () => {
    authValue = { user: null, loading: true };
    const { rerender } = render(<Probe />);
    await waitFor(() => expect(planOf()).toBe("free"));
    queryResult = { data: { plan: "pro" }, error: null };
    authValue = { user: { id: "u1" }, loading: false };
    rerender(<Probe />);
    await waitFor(() => expect(planOf()).toBe("pro"));
  });

  // Only an active or trialing subscription counts. Without the filter a
  // cancelled or past_due row still resolves as paid, and someone who stopped
  // paying keeps every paid feature.
  it("only counts a subscription that is actually live", async () => {
    render(<Probe />);
    await waitFor(() => expect(planOf()).toBe("free"));
    const statuses = chain.find(c => c[0] === "in" && c[1] === "status");
    expect(statuses, "the status filter is missing entirely").toBeTruthy();
    expect(statuses[2]).toEqual(["active", "trialing"]);
  });

  it("scopes the query to this user", async () => {
    render(<Probe />);
    await waitFor(() => expect(planOf()).toBe("free"));
    expect(chain.find(c => c[0] === "eq" && c[1] === "user_id")).toEqual(["eq", "user_id", "u1"]);
  });

  // Signing OUT has to drop the plan back, or a shared device keeps showing the
  // previous account's paid features to whoever picks it up next.
  it("falls back to free when the user signs out of a paid account", async () => {
    queryResult = { data: { plan: "pro" }, error: null };
    const { rerender } = render(<Probe />);
    await waitFor(() => expect(planOf()).toBe("pro"));
    authValue = { user: null, loading: false };
    rerender(<Probe />);
    await waitFor(() => expect(planOf()).toBe("free"));
  });
});