import { useEffect } from "react";
import { trackPageview, identifyUser } from "../lib/analytics.js";

/* Pageviews, with the tokens taken out of the path (checklist 18), and the
 * account id once it is known.
 *
 * PostHog's own pageview capture is off, because it sends the raw URL — and
 * nine public routes carry a token there, which is a credential. This sends
 * the scrubbed path instead, so `/rsvp/8f3c…` arrives as `/rsvp/:token`.
 *
 * TWO effects, not one (37c). They used to share one effect keyed on
 * [path, userId], so the session restoring a moment after first paint — user
 * null, then the id — re-ran it and recorded a SECOND pageview of the same
 * path for every signed-in visit; signing in or out on a page did the same.
 * Every step of the funnel was then measured against an inflated top.
 *
 * identify is declared first so that, when the id is already known on a
 * navigation, it is sent before that path's pageview. When it arrives later,
 * PostHog joins the anonymous events to the account on identify, so the
 * pageview fired before it is not lost to the funnel. The id only — an email
 * address in a third-party tool is a liability with no benefit. */
export function usePageAnalytics(pathname, userId) {
  useEffect(() => {
    if (userId) identifyUser(userId);
  }, [userId]);

  useEffect(() => {
    trackPageview(pathname);
  }, [pathname]);
}
