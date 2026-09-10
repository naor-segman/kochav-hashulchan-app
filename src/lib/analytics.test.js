import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* The three settings that stop analytics leaking other people's data.
 *
 * This file exists because all three are DEFAULTS in posthog-js that we turn
 * off, and a default is exactly the kind of thing that comes back — a version
 * bump, a copied snippet from the docs, someone enabling session replay to
 * debug one thing and not turning it off again. None of those break a test
 * unless a test is watching, and none of them are visible in the UI: the leak
 * is silent and it lands in a third-party tool.
 *
 * What is actually at stake, concretely:
 *   • autocapture sends the TEXT of every clicked element. On the guest
 *     manager that is a real person's name; on the RSVP list, their phone.
 *   • the automatic pageview sends the raw URL, and nine public routes carry a
 *     TOKEN in the path. A token is a credential — it opens somebody's guest
 *     list — and this would hand it to a third party in plain text.
 *   • session recording is the first one again, as video.
 *
 * The people in that data never visited this site and never agreed to
 * anything.
 */

const init = vi.fn();
const capture = vi.fn();
const identify = vi.fn();

vi.mock("posthog-js", () => ({
  default: { init, capture, identify, reset: vi.fn() },
}));

// posthog-js is imported dynamically now (it was 85 KB of the initial chunk),
// so every call is queued until the module lands. One turn of the microtask
// queue is enough for the mocked import to resolve.
const settle = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { vi.resetModules(); init.mockClear(); capture.mockClear(); identify.mockClear(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("analytics is dark until a key exists", () => {
  it("does not touch the network without VITE_POSTHOG_KEY", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    await settle();
    expect(init, "no key means no cookies, no requests, no consent question")
      .not.toHaveBeenCalled();

    // And every call site is a no-op rather than a crash.
    a.track("anything", { a: 1 });
    a.trackPageview("/rsvp/abc");
    a.identifyUser("u1");
    expect(capture).not.toHaveBeenCalled();
    expect(identify).not.toHaveBeenCalled();
  });
});

describe("and when it is on, three defaults stay off", () => {
  beforeEach(() => { vi.stubEnv("VITE_POSTHOG_KEY", "phc_test"); });

  it("never autocaptures — element text is guest names", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    await settle();
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0][1].autocapture).toBe(false);
  });

  it("never records sessions", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    await settle();
    expect(init.mock.calls[0][1].disable_session_recording).toBe(true);
  });

  it("never lets posthog send its own pageview — the URL holds tokens", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    await settle();
    expect(init.mock.calls[0][1].capture_pageview).toBe(false);
  });

  it("sends its own pageview with the token taken out of the path", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    await settle();
    a.trackPageview("/rsvp/8f3c9a2b-1111-2222-3333-444455556666");
    const [event, props] = capture.mock.calls[0];
    expect(event).toBe("$pageview");
    expect(props.$current_url).toBe("/rsvp/:token");
    expect(props.$current_url, "the raw token must never reach a third party")
      .not.toContain("8f3c9a2b");
  });

  it("does not lose events fired before the module lands", async () => {
    /* The risk the dynamic import introduces. posthog now arrives a beat after
       the app starts, and the FIRST pageview is the top of the funnel — drop it
       and every step below it reads low, which is worse than no funnel because
       it looks like data. */
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.trackPageview("/home");                    // both fired while the module
    a.track(a.EVENTS.SIGNED_UP, { needs_confirmation: false });  // is still in flight
    expect(capture, "nothing can be sent yet — the module is not here")
      .not.toHaveBeenCalled();

    await settle();

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture.mock.calls[0][0]).toBe("$pageview");
    expect(capture.mock.calls[1][0], "and the funnel keeps its order")
      .toBe("signed_up");
  });

  it("identifies by id and never by email", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    await settle();
    a.identifyUser("user-123");
    expect(identify).toHaveBeenCalledWith("user-123");
    expect(JSON.stringify(identify.mock.calls)).not.toContain("@");
  });
});
