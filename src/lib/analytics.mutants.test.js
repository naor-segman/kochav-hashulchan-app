// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Edits to analytics.js that once passed the whole suite in a mutation run
// (29.9), kept watched after the move to Google Analytics (127).

const gtag = vi.fn();
vi.mock("./gaLoader.js", () => ({ loadGtag: () => gtag }));

beforeEach(() => {
  vi.resetModules();
  gtag.mockClear();
  localStorage.clear();
  vi.stubEnv("VITE_GA_ID", "G-TEST12345");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("scrubParams fails CLOSED", () => {
  // It is the last thing between a token-bearing URL and Google. If scrubbing
  // throws, the only safe answer is to drop the event — sending it as it came
  // sends exactly the unscrubbed payload the function exists to stop.
  it("parameters it cannot read are dropped (null), and the event is not sent", async () => {
    localStorage.setItem("kochav_consent_v1", JSON.stringify({ analytics: true, at: "x" }));
    const a = await import("./analytics.js");
    a.initAnalytics();
    const hostile = new Proxy({}, { ownKeys() { throw new Error("cannot enumerate"); } });
    // Compared as a boolean on purpose: handing the proxy itself to expect()
    // makes the failure message try to print it, and that throws too.
    expect(a.scrubParams(hostile) === null, "the parameters came back instead of being dropped").toBe(true);
    a.track("x", hostile);
    expect(gtag.mock.calls.filter(c => c[0] === "event")).toHaveLength(0);
  });
});

describe("the pre-consent queue is bounded", () => {
  // A visitor who never answers keeps calling track() for as long as the tab
  // is open. Twenty keeps the top of the funnel and caps the rest.
  it("25 calls before the yes → 20 delivered, in order", async () => {
    const a = await import("./analytics.js");
    for (let i = 0; i < 25; i++) a.track("e" + i);
    a.applyConsent(true);
    const events = gtag.mock.calls.filter(c => c[0] === "event");
    expect(events).toHaveLength(20);
    expect(events[0][1]).toBe("e0");
  });
});

describe("the queue is flushed once", () => {
  it("a second yes does not send the held events again", async () => {
    const a = await import("./analytics.js");
    a.track("once");
    a.applyConsent(true);
    a.applyConsent(true);
    expect(gtag.mock.calls.filter(c => c[0] === "event").map(c => c[1])).toEqual(["once"]);
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
