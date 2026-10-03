import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* Measurement waits for the visitor's yes (owner 3.10, the cookie question).
 *
 * Before this, a configured VITE_POSTHOG_KEY loaded posthog-js on the first
 * page of every visit and wrote its random id to the browser — nobody asked.
 * The law reading of 3.10: essential storage needs no consent; measurement is
 * not essential. So: nothing loads or is stored before a yes, a no keeps
 * nothing at all, and withdrawing stops it and deletes what it kept. */

const init = vi.fn();
const capture = vi.fn();
const optOut = vi.fn();
const optIn = vi.fn();
const reset = vi.fn();
// Counts how often the module is actually FETCHED: before a yes, not even the
// 85 KB download should happen.
let fetched = 0;
// analytics.js loads posthog-js through ./posthogLoader.js (so the service
// worker can leave its chunk out of the precache); mocking that module keeps
// the load one hop, as it was.
vi.mock("./posthogLoader.js", () => {
  fetched++;
  return { default: { init, capture, identify: vi.fn(), reset, opt_out_capturing: optOut, opt_in_capturing: optIn } };
});
const settle = () => new Promise(r => setTimeout(r, 0));

function fakeStorage(entries = {}) {
  const m = new Map(Object.entries(entries));
  const s = {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    keys: () => [...m.keys()],
  };
  // Object.keys(localStorage) lists the keys in a browser; the fake matches.
  return new Proxy(s, {
    ownKeys: () => [...m.keys()],
    getOwnPropertyDescriptor: (_, k) => (m.has(k) ? { enumerable: true, configurable: true, value: m.get(k) } : undefined),
  });
}
const answered = (yes) => JSON.stringify({ analytics: yes, at: "2026-10-03T00:00:00.000Z" });

let local, session;
beforeEach(() => {
  vi.resetModules();
  fetched = 0;
  [init, capture, optOut, optIn, reset].forEach(f => f.mockClear());
  vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
  local = fakeStorage();
  session = fakeStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("before the visitor answers", () => {
  it("posthog is not loaded, and nothing is sent", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.trackPageview("/home");
    await settle();
    expect(fetched, "downloaded with no answer").toBe(0);
    expect(init, "loaded with no answer — the banner would be decoration").not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("a yes then sends what was held, in order — the page it was given on counts", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.trackPageview("/home");
    a.track(a.EVENTS.SIGNED_UP);
    a.applyConsent(true);
    await settle();
    expect(init).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls.map(c => c[0])).toEqual(["$pageview", "signed_up"]);
  });

  it("a no drops what was held, and nothing ever loads", async () => {
    const a = await import("./analytics.js");
    a.trackPageview("/home");
    a.applyConsent(false);
    a.track("after");
    await settle();
    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    // Changing their mind later sends only what comes after the yes — not the
    // page they were on when they said no.
    a.applyConsent(true);
    a.track("later");
    await settle();
    expect(capture.mock.calls.map(c => c[0])).toEqual(["later"]);
  });
});

describe("guest pages", () => {
  // A guest is never asked on the RSVP page. If they tap "לדף הבית" and say
  // yes THERE (client-side navigation, same JS), the RSVP page's view and
  // their answer must not go out after the fact (3.10 review, measured).
  it("with no answer, a guest page's calls are not even held", async () => {
    vi.stubGlobal("location", { pathname: "/rsvp/abc123token" });
    const a = await import("./analytics.js");
    a.trackPageview("/rsvp/abc123token");
    a.track(a.EVENTS.RSVP_RECEIVED, { attending: true });
    vi.stubGlobal("location", { pathname: "/" });
    a.trackPageview("/");
    a.applyConsent(true);
    await settle();
    expect(capture.mock.calls.map(c => c[1]?.$current_url || c[0])).toEqual(["/"]);
  });

  it("a browser that already said yes (the host trying the link) is measured there", async () => {
    local.setItem("kochav_consent_v1", answered(true));
    vi.stubGlobal("location", { pathname: "/rsvp/abc123token" });
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.trackPageview("/rsvp/abc123token");
    await settle();
    expect(capture.mock.calls.map(c => c[1]?.$current_url)).toEqual(["/rsvp/:token"]);
  });
});

describe("an answer given on an earlier visit", () => {
  it("yes: starts on load", async () => {
    local.setItem("kochav_consent_v1", answered(true));
    const a = await import("./analytics.js");
    a.initAnalytics();
    await settle();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("no: never starts, and calls are not even held", async () => {
    local.setItem("kochav_consent_v1", answered(false));
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.trackPageview("/home");
    a.applyConsent(true);              // changed their mind later in the visit
    await settle();
    expect(init).toHaveBeenCalledTimes(1);
    expect(capture, "the page viewed under a NO must not be sent after a later yes").not.toHaveBeenCalled();
  });
});

describe("withdrawing", () => {
  it("stops capture and deletes posthog's id — and only posthog's", async () => {
    local.setItem("kochav_consent_v1", answered(true));
    const a = await import("./analytics.js");
    a.initAnalytics();
    await settle();
    local.setItem("ph_phc_test_posthog", "{\"distinct_id\":\"abc\"}");
    local.setItem("__ph_opt_in_out_phc_test", "0");
    local.setItem("kochav_hashulchan_v1", "{}");
    session.setItem("ph_phc_test_window_id", "w");

    a.applyConsent(false);
    a.track("after");

    expect(optOut).toHaveBeenCalledTimes(1);
    // reset() FIRST: the id is in posthog's memory too, and a later yes
    // brought the same id back when only storage was cleared (3.10 review).
    // reset() also clears the opt-out mark, so it cannot come second.
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(optOut.mock.invocationCallOrder[0]);
    expect(capture).not.toHaveBeenCalled();
    expect(local.getItem("ph_phc_test_posthog"), "the random id stays behind").toBeNull();
    expect(session.getItem("ph_phc_test_window_id")).toBeNull();
    // posthog's own opt-out mark is what the loaded instance checks; deleting
    // it would read as "never asked" and capture would resume.
    expect(local.getItem("__ph_opt_in_out_phc_test")).toBe("0");
    expect(local.getItem("kochav_hashulchan_v1"), "the host's events are not posthog's").toBe("{}");
  });

  it("a yes again resumes — without sending an $opt_in event of its own", async () => {
    local.setItem("kochav_consent_v1", answered(true));
    const a = await import("./analytics.js");
    a.initAnalytics();
    await settle();
    a.applyConsent(false);
    a.applyConsent(true);
    a.track("back");
    expect(optIn).toHaveBeenCalledWith({ captureEventName: false });
    expect(capture.mock.calls.map(c => c[0])).toEqual(["back"]);
  });

  it("withdrawn while the module is still loading: it is never started", async () => {
    const a = await import("./analytics.js");
    a.applyConsent(true);
    a.applyConsent(false);
    await settle();
    expect(init).not.toHaveBeenCalled();
    a.applyConsent(true);
    await settle();
    expect(init, "and a later yes still starts it").toHaveBeenCalledTimes(1);
  });
});

describe("no key", () => {
  it("nothing to ask about: analyticsConfigured is false", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    const a = await import("./analytics.js");
    expect(a.analyticsConfigured).toBe(false);
    a.applyConsent(true);
    await settle();
    expect(init).not.toHaveBeenCalled();
  });
});
