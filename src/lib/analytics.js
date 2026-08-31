import { scrubRoute } from "../utils/errorReport.js";

/**
 * Product analytics.  Checklist 18.
 *
 * The question it exists to answer is not "how many visitors" — during the
 * pilot there will be five, and we know their names. It is "where do they
 * stop": of the people who sign up, how many create an event, reach the tables,
 * actually run the seating, and send a link to a guest. Without that we will
 * hear "it went fine" and learn nothing.
 *
 * ── posthog-js is loaded DYNAMICALLY, and only when a key exists ────────────
 * Measured: importing it statically added 85 KB gzipped to the initial chunk —
 * 214 KB against 129 KB, so two fifths of everything a first-time visitor
 * downloads. That chunk is also what a GUEST downloads when they open an RSVP
 * link on venue wifi, and they get no benefit from it at all. With no key it is
 * now never fetched; with one it arrives after the app is interactive.
 *
 * Because the module arrives late, calls made before it lands are queued rather
 * than dropped — the first pageview is the top of the funnel, and losing it
 * would understate every step below it.
 *
 * ── Three things are deliberately turned OFF, and each one is a leak ─────────
 *
 * `autocapture: false`
 *   PostHog's default records every click INCLUDING the text of the element
 *   clicked. On the guest manager that text is a real person's name, and on
 *   the RSVP list it is their phone number. Those people never visited this
 *   site and never agreed to anything. It is the single most dangerous default
 *   in this library for a product shaped like ours.
 *
 * `capture_pageview: false`
 *   The automatic pageview sends `window.location.href`. Nine public routes
 *   carry a TOKEN in the path — /rsvp/<token>, /gift/<token>, /album/<token> —
 *   and a token is a credential: anyone holding one can open somebody's guest
 *   list. We send our own through the same `scrubRoute` the error reporter
 *   uses, so `/rsvp/8f3c…` arrives as `/rsvp/:token`. One implementation of
 *   that rule, not two.
 *
 * `disable_session_recording: true`
 *   Same reason as autocapture, one step worse: a replay of the guest screen
 *   is a recording of three hundred names and phone numbers.
 *
 * src/lib/analytics.test.js fails if any of the three comes back.
 */

const KEY  = import.meta.env?.VITE_POSTHOG_KEY;
const HOST = import.meta.env?.VITE_POSTHOG_HOST || "https://eu.i.posthog.com";

let ph      = null;    // the posthog module, once it has landed
let loading = false;
const queue = [];      // calls made while the module was still in flight
const QUEUE_MAX = 20;  // a load that never resolves must not grow memory

function run(fn) {
  try {
    if (ph) { fn(ph); return; }
    if (!KEY) return;                       // dark: nothing to queue for
    if (queue.length < QUEUE_MAX) queue.push(fn);
  } catch { /* analytics must never break the app */ }
}

export function initAnalytics() {
  if (!KEY || loading || ph) return;
  loading = true;
  import("posthog-js")
    .then((mod) => {
      const p = mod.default;
      p.init(KEY, {
        api_host: HOST,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        persistence: "localStorage",   // no cross-site cookie
      });
      ph = p;
      // Flush in the order the app made them, so the funnel keeps its shape.
      while (queue.length) { try { queue.shift()(p); } catch { /* ignore */ } }
    })
    .catch(() => { loading = false; });     // offline, blocked, ad-blocker
}

/** A named event. Properties are passed explicitly — nothing is inferred. */
export function track(event, props) {
  run(p => p.capture(event, props));
}

/** A pageview with the tokens taken out of the path. */
export function trackPageview(pathname) {
  const url = scrubRoute(pathname);
  run(p => p.capture("$pageview", { $current_url: url }));
}

/**
 * Tie the events to an account once we know who it is.
 *
 * The id only — not the email. The funnel question is "did THIS person get
 * stuck", which an opaque id answers, and an email address in a third-party
 * tool is a liability with no matching benefit.
 */
export function identifyUser(userId) {
  if (!userId) return;
  run(p => p.identify(userId));
}

export function resetAnalytics() {
  run(p => p.reset());
}

/* The funnel, named in one place so a typo cannot silently split a step in two.
 * Ordered as the host meets them. */
export const EVENTS = {
  SIGNED_UP:      "signed_up",
  EVENT_CREATED:  "event_created",
  SEATING_RUN:    "seating_run",
  SHARE_COPIED:   "share_link_copied",
  RSVP_RECEIVED:  "rsvp_received",
};
