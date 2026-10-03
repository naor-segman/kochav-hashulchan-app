import { scrubRoute } from "../utils/errorReport.js";
import { readConsent } from "../utils/consent.js";
import { isGuestRoute } from "../utils/guestRoutes.js";
import { loadGtag } from "./gaLoader.js";

/**
 * Product analytics.  Checklist 18; Google Analytics 4 since 127 (owner 3.10).
 *
 * The question it exists to answer is not "how many visitors" — during the
 * pilot there will be five, and we know their names. It is "where do they
 * stop": of the people who sign up, how many create an event, reach the tables,
 * actually run the seating, and send a link to a guest. Without that we will
 * hear "it went fine" and learn nothing. In GA that is Explore → Funnel
 * exploration over the EVENTS below.
 *
 * ── Why GA and not PostHog (owner, 3.10) ─────────────────────────────────────
 * The owner already runs GA for Unica and wants one place. PostHog was chosen
 * on 31.8 for its funnels; GA4 has them too, and no PostHog key was ever set,
 * so nothing collected was lost.
 *
 * ── Nothing without the visitor's yes (126) ──────────────────────────────────
 * gtag.js is not even requested until the cookie question is answered yes
 * (src/components/consent/ConsentBanner.jsx). Calls made before the answer are
 * held IN MEMORY, so a yes still counts the page it was given on; a no empties
 * them. A guest page with no answer holds nothing at all — a guest who goes on
 * to our home page and says yes there must not send the RSVP page after the
 * fact (3.10 review, measured).
 *
 * ── What PostHog's before_send did, GA has no hook for ───────────────────────
 * PostHog let every outgoing event pass one scrubber. gtag.js does not, and it
 * attaches the page's URL, referrer and title to every hit on its own. Nine
 * public routes carry a TOKEN in the path (a token opens a guest list), the
 * personal card carries a guest's NAME in its query, and a guest page's title
 * is the hosts' names. So:
 *   • page_location, page_referrer and page_title are SET to scrubbed values
 *     before every hit, so anything gtag adds by itself carries those;
 *   • send_page_view is off — we send our own, after the path is scrubbed;
 *   • every event parameter that looks like a path or a URL goes through the
 *     same scrubRoute as the error reporter (scrubParams);
 *   • Google signals and ad personalisation are off; ad storage is denied.
 * What code cannot reach, the owner switches off in GA itself (WORKPLAN 127):
 * ENHANCED MEASUREMENT, ALL OF IT. Its history-based page views, site search
 * and form interactions read the raw URL, and its outbound-click event sends
 * the link's href — the WhatsApp share buttons are wa.me links whose text
 * carries a guest link with its token.
 *
 * ── Its cookies are its own ─────────────────────────────────────────────────
 * The site is moving under unica-events.co.il, whose own site runs GA too. By
 * default GA writes `_ga` on the top domain — shared with that site, and a
 * withdrawal here would delete theirs. So the cookie is prefixed (kh_…) and
 * scoped to this host, and lasts 13 months rather than GA's two years.
 */

/**
 * Take the tokens out of every URL-ish string in a set of event parameters.
 * Pure, exported for the test. Returns a copy, or null to drop the event —
 * never throws, because analytics must never break the app.
 */
export function scrubParams(params) {
  try {
    if (params == null) return {};
    if (typeof params !== "object") return null;
    const out = { ...params };
    // A guest page's title is the hosts' names ("אישור הגעה · דנה ויוסי" —
    // useGuestTitle). Names are not what the funnel needs (29.9 review).
    delete out.title;
    delete out.page_title;
    for (const [k, v] of Object.entries(out)) {
      if (typeof v === "string" && (v.startsWith("/") || /^https?:\/\//i.test(v))) {
        out[k] = scrubUrl(v);
      }
    }
    return out;
  } catch {
    return null;   // if we cannot be sure it is clean, it does not leave
  }
}

/** A full URL with its path scrubbed; another site's URL is cut to its origin. */
function scrubUrl(v) {
  if (v.startsWith("/")) return scrubRoute(v);
  const u = new URL(v);
  if (typeof location !== "undefined" && u.origin !== location.origin) return u.origin + "/";
  return u.origin + scrubRoute(u.pathname + u.search + u.hash);
}

// Only a real measurement id reaches the script URL.
const RAW_ID = import.meta.env?.VITE_GA_ID || "";
const GA_ID = /^G-[A-Z0-9]{4,20}$/.test(RAW_ID) ? RAW_ID : "";

const COOKIE_PREFIX = "kh";
const BASE_CONFIG = {
  send_page_view: false,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
  cookie_prefix: COOKIE_PREFIX,
  cookie_expires: 60 * 60 * 24 * 395,   // 13 months
};

let gtag    = null;    // set once gtag.js is set up
let stopped = false;   // withdrawn in this visit
let allowed = null;    // this visit's answer: null = not asked yet
let userId  = null;
const queue = [];      // calls made before consent
const QUEUE_MAX = 20;  // a visitor who never answers must not grow memory

/** Whether there is anything to ask about — no id, no banner. */
export const analyticsConfigured = !!GA_ID;

function onGuestPage() {
  try { return isGuestRoute(globalThis.location?.pathname); } catch { return false; }
}

function consented() {
  return allowed ?? readConsent()?.analytics ?? null;
}

function run(fn) {
  try {
    if (!GA_ID || stopped) return;          // dark, or withdrawn this visit
    const c = consented();
    if (c === false) return;                // said no: not even held
    // A guest page with no answer: not held either (see the header).
    if (c === null && onGuestPage()) return;
    if (gtag && c) { fn(gtag); return; }
    if (queue.length < QUEUE_MAX) queue.push(fn);
  } catch { /* analytics must never break the app */ }
}

function cookieDomain() {
  try { return globalThis.location?.hostname || "auto"; } catch { return "auto"; }
}

function config(extra) {
  gtag("config", GA_ID, { ...BASE_CONFIG, cookie_domain: cookieDomain(), user_id: userId, ...extra });
}

/** Starts measurement — only if this browser has said yes. */
export function initAnalytics() {
  if (!GA_ID || gtag || stopped || consented() !== true) return;
  try {
    const g = loadGtag(GA_ID);
    // Ads never: nothing here is advertising, and these stay denied whatever
    // the visitor answered.
    g("consent", "default", {
      ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
      analytics_storage: "granted",
    });
    g("js", new Date());
    gtag = g;
    setPage(globalThis.location?.pathname || "/");
    config();
    // Flush in the order the app made them, so the funnel keeps its shape.
    while (queue.length) { try { queue.shift()(g); } catch { /* ignore */ } }
  } catch { /* blocked, no document — analytics must never break the app */ }
}

/** The page every later hit is attributed to — scrubbed, so whatever gtag
 *  attaches by itself carries the clean values too. */
function setPage(pathname) {
  const path = scrubRoute(pathname);
  let referrer = "";
  try { referrer = document.referrer ? scrubUrl(document.referrer) : ""; } catch { /* none */ }
  gtag("set", {
    page_location: (globalThis.location?.origin || "") + path,
    page_referrer: referrer,
    page_title: path,
  });
  return path;
}

/** Delete the GA cookies this site wrote — ours only (the kh prefix).
 *  Matched on "kh_" and not on an exact name: whether gtag.js joins the prefix
 *  as kh_ga or kh__ga could not be checked from here (Google's hosts are
 *  blocked), and the 3.10 audit found the exact-name match missed kh__ga. */
function deleteCookies() {
  try {
    const host = globalThis.location?.hostname || "";
    const names = document.cookie.split(";").map(c => c.split("=")[0].trim())
      .filter(n => n.startsWith(COOKIE_PREFIX + "_"));
    for (const n of names) {
      for (const d of ["", host, "." + host]) {
        document.cookie = `${n}=; Max-Age=0; path=/${d ? "; domain=" + d : ""}`;
      }
    }
  } catch { /* no document */ }
}

/**
 * The visitor answered (the banner, or the preferences later). Yes starts
 * measurement and sends what was held; no drops what was held and, if
 * measurement was already running, stops it and deletes its cookies.
 *
 * A yes AFTER a withdrawal takes effect from the next page load. gtag.js may
 * still hold the old client id in memory, and a fresh load is the one way to be
 * sure the visits before the no are not tied to the ones after.
 */
export function applyConsent(yes) {
  allowed = yes === true;
  if (!GA_ID) return;
  if (allowed) { initAnalytics(); return; }
  queue.length = 0;
  if (!gtag) return;
  stopped = true;
  try { window["ga-disable-" + GA_ID] = true; } catch { /* ignore */ }
  try { gtag("consent", "update", { analytics_storage: "denied" }); } catch { /* ignore */ }
  deleteCookies();
}

/** A named event. Parameters are passed explicitly — nothing is inferred. */
export function track(event, props) {
  const clean = scrubParams(props);
  if (clean === null) return;
  run(g => g("event", event, clean));
}

/** A pageview with the tokens taken out of the path. */
export function trackPageview(pathname) {
  run(() => {
    const path = setPage(pathname);
    gtag("event", "page_view", {
      page_location: (globalThis.location?.origin || "") + path,
      page_title: path,
    });
  });
}

/**
 * Tie the events to an account once we know who it is.
 *
 * The id only — not the email. The funnel question is "did THIS person get
 * stuck", which an opaque id answers; Google's terms forbid sending anything
 * that identifies a person, and an email address would.
 */
export function identifyUser(id) {
  if (!id) return;
  run(() => { userId = String(id); config(); });
}

export function resetAnalytics() {
  run(() => { userId = null; config(); });
}

/* The funnel, named in one place so a typo cannot silently split a step in two.
 * Ordered as the host meets them. */
export const EVENTS = {
  SIGNED_UP:      "signed_up",
  EVENT_CREATED:  "event_created",
  SEATING_RUN:    "seating_run",
  SHARE_COPIED:   "share_link_copied",
  RSVP_RECEIVED:  "rsvp_received",
  // The gift page's only step (WORKPLAN מ2). Guest's device, like RSVP.
  // GA shows a parameter in reports only once it is registered as a custom
  // dimension (type, source, answer, amount_band, …) — WORKPLAN 127.
  GIFT_DECLARED:  "gift_declared",
};

/** A declared gift amount as a coarse band — the funnel needs the shape of
 *  the money, not a guest's exact figure. */
export function amountBand(ils) {
  const n = Number(ils);
  if (!Number.isFinite(n) || n <= 0) return "none";
  if (n < 200) return "<200";
  if (n < 500) return "200-499";
  if (n < 1000) return "500-999";
  return "1000+";
}
