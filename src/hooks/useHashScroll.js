import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scroll to the element named by the URL's #hash once React has rendered it.
 * Moved out of LandingScreen (1.10) when the privacy page needed the same
 * thing for `/privacy#guests`, the link every guest form points at.
 */
export function useHashScroll() {
  // ── Arriving with a #hash ───────────────────────────────────────────────────
  //
  // The browser's own hash scrolling does not work on this page, and only
  // measuring finds that out: loading /#features fresh leaves scrollY at 0 while
  // the section sits at y=3320. The browser looks for the element while parsing
  // the HTML shell, long before React has rendered anything, finds nothing, and
  // never tries again.
  //
  // So every link into a section was broken for EVERY visitor, not only for the
  // signed-in ones who got redirected to /app — "תכונות" and "איך זה עובד" in
  // the pricing nav and in the footer simply dropped you at the top of the page.
  //
  // Keyed on `key` as well as `hash`, and both are load-bearing:
  //
  //   hash — a footer link clicked while already on this page changes the hash
  //          without remounting anything.
  //   key  — react-router mints a new one PER NAVIGATION. Without it, clicking
  //          the same anchor twice was a dead click: the second click produces
  //          a new location object carrying the identical hash string, the
  //          dependency array does not change, and nothing scrolls. Measured:
  //          first click landed at y=3324, scroll back to 0, second click left
  //          it at 0.
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!hash) return;
    // decodeURIComponent throws URIError on a lone `%` — and a throw in an
    // effect reaches the root ErrorBoundary, so `/home#50%` white-screened the
    // PUBLIC MARKETING PAGE with "אירעה שגיאה בלתי צפויה". Measured before this
    // guard on all of `#50%`, `#%E0` and `#utm_x%`. That is one mangled or
    // tracking-suffixed link away from being what a visitor sees.
    //
    // The decode itself was added for a Hebrew id that does not exist yet, so
    // the raw hash is the right fallback: it is what the browser would have
    // matched anyway.
    let id;
    try { id = decodeURIComponent(hash.slice(1)); }
    catch { id = hash.slice(1); }
    // Two frames, not zero: the section sits below the hero, whose height
    // settles after its media lays out. Scrolling immediately lands short.
    //
    // Then corrected after the fonts. The site font is a self-hosted Open Sans
    // with `font-display: swap`: the page first lays out in the fallback, and
    // when the font arrives the text above the section re-wraps SHORTER —
    // /privacy#device ended 64px above the top of the screen. Waiting for the
    // fonts before scrolling at all (the first fix) left the page at the top
    // for the whole font delay, and forever if a font request hung (review
    // 5.10, measured). So: scroll now; correct at 1.5s and again when the fonts
    // land (whichever order — a font arriving right at 1.5s re-wrapped after the
    // first correction, measured 25px off); and stop correcting the moment the
    // visitor moves the page themselves. `document.fonts` is absent in jsdom.
    const go = (smooth) => document.getElementById(id)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    let raf = 0;
    let cancelled = false;
    let userMoved = false;
    const stopOnUser = () => { userMoved = true; };
    const USER_EVENTS = ["wheel", "touchstart", "keydown", "mousedown"];
    USER_EVENTS.forEach(e => window.addEventListener(e, stopOnUser, { passive: true, once: true }));
    const correct = () => {
      if (cancelled || userMoved) return;
      const el = document.getElementById(id);
      if (el && Math.abs(el.getBoundingClientRect().top) > 8) go(false);
    };
    raf = requestAnimationFrame(() => requestAnimationFrame(() => { if (!cancelled) go(true); }));
    const timer = setTimeout(correct, 1500);
    document.fonts?.ready?.then(() => setTimeout(correct, 50)).catch(() => {});
    const giveUp = setTimeout(() => { cancelled = true; }, 8000);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf); clearTimeout(timer); clearTimeout(giveUp);
      USER_EVENTS.forEach(e => window.removeEventListener(e, stopOnUser));
    };
  }, [hash, key]);
}
