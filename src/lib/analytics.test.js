// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* What reaches Google Analytics (127, owner 3.10 — moved from PostHog).
 *
 * Each rule here was a leak in this product once, under PostHog, and each one
 * is a DEFAULT of gtag.js that we override — the kind of thing that comes back
 * with a copied snippet from the docs, silently, into a third-party tool:
 *   • the automatic page view sends the raw URL, and nine public routes carry a
 *     TOKEN in the path (a token opens somebody's guest list);
 *   • every hit carries the page title, and a guest page's title is the hosts'
 *     names; the referrer can be a token-bearing URL too;
 *   • Google signals / ad personalisation share the data for advertising.
 * The people in that data never visited this site and never agreed to
 * anything. */

const gtag = vi.fn();
let loads = 0;
// analytics.js sets gtag.js up through ./gaLoader.js; standing in for it keeps
// the test off the network and lets it read every call gtag would receive.
vi.mock("./gaLoader.js", () => ({ loadGtag: () => { loads++; return gtag; } }));

const ID = "G-TEST12345";
const yes = () => localStorage.setItem("kochav_consent_v1", JSON.stringify({ analytics: true, at: "2026-10-03T00:00:00.000Z" }));
const calls = (kind) => gtag.mock.calls.filter(c => c[0] === kind);
const all = () => JSON.stringify(gtag.mock.calls);

beforeEach(() => {
  vi.resetModules();
  gtag.mockClear();
  loads = 0;
  localStorage.clear();
  history.replaceState({}, "", "/");
  document.title = "כוכב השולחן";
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("analytics is dark until an id exists", () => {
  it("does nothing at all without VITE_GA_ID — even after a yes", async () => {
    yes();
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.track("anything", { a: 1 });
    a.trackPageview("/rsvp/abc");
    a.identifyUser("u1");
    expect(loads, "no id means no script, no cookies, no consent question").toBe(0);
    expect(gtag).not.toHaveBeenCalled();
    expect(a.analyticsConfigured).toBe(false);
  });

  it("an id that is not a GA measurement id is ignored — it would go into a script URL", async () => {
    vi.stubEnv("VITE_GA_ID", 'G-X"><script>');
    yes();
    const a = await import("./analytics.js");
    a.initAnalytics();
    expect(a.analyticsConfigured).toBe(false);
    expect(loads).toBe(0);
  });
});

describe("and when it is on, gtag's defaults that leak stay off", () => {
  beforeEach(() => { vi.stubEnv("VITE_GA_ID", ID); yes(); });

  it("no automatic page view — it would send the raw URL", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    const [, id, cfg] = calls("config")[0];
    expect(id).toBe(ID);
    expect(cfg.send_page_view).toBe(false);
  });

  it("no Google signals, no ad personalisation, ad storage denied", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    const cfg = calls("config")[0][2];
    expect(cfg.allow_google_signals).toBe(false);
    expect(cfg.allow_ad_personalization_signals).toBe(false);
    const [, mode, consent] = calls("consent")[0];
    expect(mode).toBe("default");
    expect(consent).toMatchObject({ ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    expect(calls("consent")[0], "consent defaults go before the config").toBe(gtag.mock.calls[0]);
  });

  it("its cookie is ours: prefixed, on this host only, 13 months at most", async () => {
    // The site moves under unica-events.co.il, whose own GA writes _ga on the
    // top domain. Shared, a withdrawal here would delete theirs.
    const a = await import("./analytics.js");
    a.initAnalytics();
    const cfg = calls("config")[0][2];
    expect(cfg.cookie_prefix).toBe("kh");
    expect(cfg.cookie_domain).toBe(location.hostname);
    expect(cfg.cookie_expires).toBeLessThanOrEqual(60 * 60 * 24 * 396);
  });

  it("sends its own page view with the token taken out — and nothing anywhere carries it", async () => {
    history.replaceState({}, "", "/rsvp/8f3c9a2b-1111-2222-3333-444455556666");
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.trackPageview("/rsvp/8f3c9a2b-1111-2222-3333-444455556666");
    const [, name, params] = calls("event")[0];
    expect(name).toBe("page_view");
    expect(params.page_location).toBe(location.origin + "/rsvp/:token");
    expect(all(), "the raw token must never reach a third party").not.toContain("8f3c9a2b");
  });

  it("the page title gtag would attach is the scrubbed path, never document.title", async () => {
    document.title = "אישור הגעה · דנה ויוסי";
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.trackPageview("/gift/abc123token");
    const set = calls("set").at(-1)[1];
    expect(set.page_title).toBe("/gift/:token");
    expect(all()).not.toContain("דנה");
  });

  it("a referrer from another site is cut to its origin; ours is scrubbed", async () => {
    Object.defineProperty(document, "referrer", { value: "https://wa.me/some/path?text=" + encodeURIComponent("שלום"), configurable: true });
    const a = await import("./analytics.js");
    a.initAnalytics();
    expect(calls("set")[0][1].page_referrer).toBe("https://wa.me/");
    Object.defineProperty(document, "referrer", { value: location.origin + "/collab/SECRETTOKEN99", configurable: true });
    a.trackPageview("/home");
    expect(calls("set").at(-1)[1].page_referrer).toBe(location.origin + "/collab/:token");
    expect(all()).not.toContain("SECRETTOKEN99");
    Object.defineProperty(document, "referrer", { value: "", configurable: true });
  });

  it("does not lose events fired before the yes — the first page is the top of the funnel", async () => {
    localStorage.clear();                       // not answered yet
    const a = await import("./analytics.js");
    a.trackPageview("/home");
    a.track(a.EVENTS.SIGNED_UP, { needs_confirmation: false });
    expect(gtag, "nothing can be sent yet").not.toHaveBeenCalled();
    a.applyConsent(true);
    expect(calls("event").map(c => c[1])).toEqual(["page_view", "signed_up"]);
  });

  it("identifies by id and never by email; sign-out clears it", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.identifyUser("user-123");
    expect(calls("config").at(-1)[2].user_id).toBe("user-123");
    expect(calls("config").at(-1)[2].send_page_view, "re-configuring must not send a page view").toBe(false);
    expect(all()).not.toContain("@");
    a.resetAnalytics();
    expect(calls("config").at(-1)[2].user_id).toBeNull();
  });

  it("event parameters that are paths or URLs are scrubbed too", async () => {
    const a = await import("./analytics.js");
    a.initAnalytics();
    a.track("share_link_copied", { link: "https://revaya-events.co.il/collab/TOKEN1234567", where: "/card/TOK777?n=" + encodeURIComponent("יעל"), count: 3 });
    const p = calls("event")[0][2];
    expect(JSON.stringify(p)).not.toMatch(/TOKEN1234567|TOK777|%D7%99|יעל/);
    expect(p.where).toBe("/card/:token?n=:v");
    expect(p.count).toBe(3);
  });
});

describe("scrubParams", () => {
  it("drops the title and scrubs every path or URL value; leaves the rest", async () => {
    const { scrubParams } = await import("./analytics.js");
    const out = scrubParams({ title: "דנה ויוסי", page_title: "x", p: "/album/abc12345zz", n: 4, s: "plain" });
    expect(out).toEqual({ p: "/album/:token", n: 4, s: "plain" });
  });

  it("never throws, whatever it is handed", async () => {
    const { scrubParams } = await import("./analytics.js");
    for (const junk of [null, undefined, 42, "x", { properties: null }]) {
      expect(() => scrubParams(junk)).not.toThrow();
    }
  });
});
