// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* Measurement waits for the visitor's yes (owner 3.10, the cookie question;
 * Google Analytics since 127).
 *
 * The law reading of 3.10: essential storage needs no consent; measurement is
 * not essential. So: nothing loads or is stored before a yes, a no keeps
 * nothing at all, and withdrawing stops it and deletes its cookies. */

const gtag = vi.fn();
let loads = 0;
// Counts how often gtag.js is actually SET UP — the script request included.
vi.mock("./gaLoader.js", () => ({ loadGtag: () => { loads++; return gtag; } }));

const ID = "G-TEST12345";
const answered = (yes) => JSON.stringify({ analytics: yes, at: "2026-10-03T00:00:00.000Z" });
const events = () => gtag.mock.calls.filter(c => c[0] === "event").map(c => c[1]);
const cookieNames = () => document.cookie.split(";").map(c => c.split("=")[0].trim()).filter(Boolean);

beforeEach(() => {
  vi.resetModules();
  gtag.mockClear();
  loads = 0;
  localStorage.clear();
  history.replaceState({}, "", "/home");
  for (const n of cookieNames()) document.cookie = `${n}=; Max-Age=0; path=/`;
  delete window["ga-disable-" + ID];
  vi.stubEnv("VITE_GA_ID", ID);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("before the visitor answers", () => {
  it("gtag.js is not loaded, and nothing is sent", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.trackPageview("/home");
    expect(loads, "loaded with no answer — the banner would be decoration").toBe(0);
    expect(gtag).not.toHaveBeenCalled();
  });

  it("a yes then sends what was held, in order — the page it was given on counts", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.trackPageview("/home");
    a.track(a.EVENTS.SIGNED_UP);
    a.applyConsent(true);
    expect(loads).toBe(1);
    expect(events()).toEqual(["page_view", "signed_up"]);
  });

  it("a no drops what was held, and nothing ever loads", async () => {
    const a = await import("./analytics.js");
    a.trackPageview("/home");
    a.applyConsent(false);
    a.track("after");
    expect(loads).toBe(0);
    expect(gtag).not.toHaveBeenCalled();
    // Changing their mind later sends only what comes after the yes — not the
    // page they were on when they said no.
    a.applyConsent(true);
    a.track("later");
    expect(events()).toEqual(["later"]);
  });
});

describe("guest pages", () => {
  // A guest is never asked on the RSVP page. If they tap "לדף הבית" and say
  // yes THERE (client-side navigation, same JS), the RSVP page's view and
  // their answer must not go out after the fact (3.10 review, measured).
  it("with no answer, a guest page's calls are not even held", async () => {
    history.replaceState({}, "", "/rsvp/abc123token");
    const a = await import("./analytics.js");
    a.trackPageview("/rsvp/abc123token");
    a.track(a.EVENTS.RSVP_RECEIVED, { answer: "yes" });
    history.replaceState({}, "", "/");
    a.trackPageview("/");
    a.applyConsent(true);
    const pages = gtag.mock.calls.filter(c => c[0] === "event").map(c => c[2].page_location);
    expect(pages).toEqual([location.origin + "/"]);
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/rsvp/);
  });

  it("a browser that already said yes (the host trying the link) is measured there", async () => {
    localStorage.setItem("kochav_consent_v1", answered(true));
    history.replaceState({}, "", "/rsvp/abc123token");
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.trackPageview("/rsvp/abc123token");
    expect(gtag.mock.calls.filter(c => c[0] === "event").map(c => c[2].page_location)).toEqual([location.origin + "/rsvp/:token"]);
  });
});

describe("an answer given on an earlier visit", () => {
  it("yes: starts on load", async () => {
    localStorage.setItem("kochav_consent_v1", answered(true));
    const a = await import("./analytics.js");
    a.initAnalytics();
    expect(loads).toBe(1);
  });

  it("no: never starts, and calls are not even held", async () => {
    localStorage.setItem("kochav_consent_v1", answered(false));
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.trackPageview("/home");
    a.applyConsent(true);              // changed their mind later in the visit
    expect(loads).toBe(1);
    expect(events(), "the page viewed under a NO must not be sent after a later yes").toEqual([]);
  });
});

describe("withdrawing", () => {
  it("stops sending and deletes OUR GA cookies — and only ours", async () => {
    localStorage.setItem("kochav_consent_v1", answered(true));
    const a = await import("./analytics.js");
    a.initAnalytics();
    // Both spellings: whether gtag joins the prefix as kh_ga or kh__ga could
    // not be checked from here, and an exact-name match missed kh__ga (audit).
    document.cookie = "kh_ga=GA1.1.123.456; path=/";
    document.cookie = "kh__ga=GA1.1.123.456; path=/";
    document.cookie = "kh__ga_TEST12345=GS1.1.789; path=/";
    document.cookie = "_ga=GA1.1.999.888; path=/";      // e.g. the Unica site's own
    document.cookie = "other=1; path=/";

    a.applyConsent(false);
    a.track("after");

    expect(window["ga-disable-" + ID], "Google's documented off switch").toBe(true);
    expect(gtag.mock.calls.some(c => c[0] === "consent" && c[1] === "update" && c[2].analytics_storage === "denied")).toBe(true);
    expect(events()).toEqual([]);
    expect(cookieNames()).not.toContain("kh_ga");
    expect(cookieNames()).not.toContain("kh__ga");
    expect(cookieNames()).not.toContain("kh__ga_TEST12345");
    expect(cookieNames(), "another site's GA cookie is not ours to delete").toContain("_ga");
    expect(cookieNames()).toContain("other");
  });

  it("a yes again in the same visit sends nothing until the next load — the old id may still be in memory", async () => {
    localStorage.setItem("kochav_consent_v1", answered(true));
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.applyConsent(false);
    a.applyConsent(true);
    a.track("back");
    expect(loads).toBe(1);
    expect(events()).toEqual([]);
  });

  it("a no before anything loaded leaves nothing to undo", async () => {
    const a = await import("./analytics.js");
    a.applyConsent(false);
    expect(window["ga-disable-" + ID]).toBeUndefined();
    a.applyConsent(true);
    expect(loads, "and a later yes in the visit still starts it").toBe(1);
  });
});

describe("no id", () => {
  it("nothing to ask about: analyticsConfigured is false", async () => {
    vi.stubEnv("VITE_GA_ID", "");
    const a = await import("./analytics.js");
    expect(a.analyticsConfigured).toBe(false);
    a.applyConsent(true);
    expect(loads).toBe(0);
  });
});
