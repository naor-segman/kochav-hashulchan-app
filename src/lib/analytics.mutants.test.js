import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Four edits to analytics.js passed the whole suite in the third-review mutation
// run (29.9). Two of them are privacy defaults of exactly the kind
// analytics.test.js exists for — a setting that comes back silently and leaks
// into a third-party tool — and that file did not watch them.

const init = vi.fn();
const capture = vi.fn();
vi.mock("posthog-js", () => ({
  default: { init, capture, identify: vi.fn(), reset: vi.fn() },
}));
const settle = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { vi.resetModules(); init.mockClear(); capture.mockClear(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("PostHog stores its id in localStorage, not a cookie", () => {
  // A cookie is sent with every request to the domain and, for posthog-js,
  // can be cross-subdomain. analytics.js promises "no cross-site cookie" and
  // main.jsx "no cookies" while dark; the product shows no consent banner.
  // Switching the persistence to a cookie would break that promise for every
  // visitor, including the guests on /rsvp who never chose to be here.
  it("init persistence: localStorage", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    const a = await import("./analytics.js");
    a.initAnalytics();
    await settle();
    expect(init.mock.calls[0][1].persistence).toBe("localStorage");
  });
});

describe("scrubEvent fails CLOSED", () => {
  // before_send is the last thing between a token-bearing URL and PostHog. If
  // scrubbing throws, the only safe answer is to drop the event — returning it
  // as it came sends exactly the unscrubbed payload the function exists to stop.
  it("an event it cannot read is dropped (null), not passed through", async () => {
    const { scrubEvent } = await import("./analytics.js");
    const hostile = new Proxy({}, { ownKeys() { throw new Error("cannot enumerate"); } });
    // Compared as a boolean on purpose: handing the proxy itself to expect()
    // makes the failure message try to print it, and that throws too.
    const out = scrubEvent({ event: "$pageview", properties: hostile });
    expect(out === null, "the event came back instead of being dropped").toBe(true);
  });
});

describe("the pre-load queue is bounded", () => {
  // posthog-js arrives late (it is dynamically imported), so calls made first
  // are queued. On a network where the import never resolves — venue wifi, an
  // ad blocker that stalls rather than refuses — an unbounded queue grows for
  // as long as the tab is open. Twenty keeps the top of the funnel and caps
  // the rest.
  it("25 calls before the module lands → 20 delivered", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    const a = await import("./analytics.js");
    a.initAnalytics();
    for (let i = 0; i < 25; i++) a.track("e" + i);
    await settle();
    expect(capture).toHaveBeenCalledTimes(20);
    expect(capture.mock.calls[0][0]).toBe("e0");
  });
});

describe("amountBand: 200 is in the 200 band", () => {
  // The bands are the only shape of the money the funnel sees, and the band
  // names say where each edge belongs: "<200" is below 200, "200-499" starts
  // at it. Exactly ₪200 — a round, ordinary amount — must land in the second.
  it("199 → <200, 200 → 200-499", async () => {
    const { amountBand } = await import("./analytics.js");
    expect(amountBand(199)).toBe("<200");
    expect(amountBand(200)).toBe("200-499");
  });
});
