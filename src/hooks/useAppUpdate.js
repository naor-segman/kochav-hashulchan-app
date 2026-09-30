import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { isGuestRoute } from "../utils/guestRoutes.js";

/**
 * Keep the running app on the deployed version, without interrupting anyone.
 *
 * THE PROBLEM THIS SOLVES
 * The owner opened the site on his phone twice after a deploy and saw the old
 * version — old colours, missing screens — and reasonably concluded the deploy
 * had failed. It had not. `registerType: 'autoUpdate'` only takes effect once
 * the browser bothers to CHECK for a new service worker, and a phone tab that
 * is restored from memory rather than loaded fresh may not check for hours. So
 * the person holding the link is stranded on whatever build they first opened.
 *
 * That is a product problem, not a caching curiosity: an RSVP link handed to
 * 300 guests must not serve half of them a build from last week.
 *
 * HOW
 *   1. Ask far more often than the browser would on its own — on an interval,
 *      when the tab comes back to the foreground, and when the network returns.
 *      Those are exactly the moments a stale tab wakes up.
 *   2. Apply the update the moment it is SAFE, not the moment it arrives.
 *
 * WHY THE SAFETY RULE
 * `updateServiceWorker(true)` reloads the page. Doing that while somebody is
 * typing a guest's name throws away the half-typed field — this app persists on
 * a 1500ms debounce, so the last keystrokes are genuinely not saved yet. So the
 * reload waits for the tab to be hidden, or for nothing to be focused. In
 * practice that means it lands the instant they put the phone down, and they
 * come back to the current version having never seen it happen.
 */

/** How often to ask the server whether a newer build exists. */
const CHECK_EVERY_MS = 60_000;

/* ── The reload that never asked (second review 29.9, סב13) ─────────────────
   Everything above described what SHOULD happen, and none of it ran. With
   `registerType: 'autoUpdate'` the plugin itself calls
   `window.location.reload()` the moment the new service worker activates —
   `needRefresh` never becomes true in that mode, so the safety rule below was
   never consulted. Measured: a field focused, "half-typed-addr@exam" typed, a
   new build deployed, the hourly check fired — the page reloaded and the field
   was empty. The plugin takes an `onNeedReload` that replaces its reload; that
   is where the rule now sits.

   And a guest's form lives only in memory. A guest who typed into the RSVP or
   the blessing and switched to WhatsApp came back to a blank form, because a
   hidden tab counted as safe. So once a guest page has had anything typed into
   it, it is never reloaded for an update: the guest finishes on this build, and
   the next visit opens the new one. */

/** Is a reload safe right now — i.e. would it interrupt anybody? */
export function isSafeToReload(doc = document, guestFormTouched = false) {
  if (guestFormTouched) return false;                  // a guest's unsent form
  if (doc.visibilityState === "hidden") return true;   // nobody is looking
  const el = doc.activeElement;
  if (!el) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  if (el.isContentEditable) return false;
  return true;
}

export function useAppUpdate() {
  const registrationRef = useRef(null);
  const pendingRef      = useRef(false);
  const touchedRef      = useRef(false);
  const [needReload, setNeedReload] = useState(false);

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    // autoUpdate mode: the new worker is already in control; only the reload
    // is left, and it waits for the same safe moment as everything else.
    onNeedReload() { setNeedReload(true); },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      // The browser's own update check is far too lazy for a link handed out to
      // hundreds of people. `registration.update()` is cheap — one conditional
      // request for the service worker file.
      const ask = () => { registration.update().catch(() => {}); };
      // Clear first. The unmount cleanup below already clears this timer — a
      // review reported it as never cleared, which is not what the code does —
      // but nothing stops `onRegisteredSW` from firing twice for the same
      // registration, and the second call would orphan the first interval with
      // no handle left to clear it.
      if (registration.__kochavTimer) clearInterval(registration.__kochavTimer);
      registration.__kochavTimer = setInterval(ask, CHECK_EVERY_MS);
    },
    onRegisterError() {},
  });

  /* ── While the reload waits, the OLD build's files are gone (סב47) ─────────
     Holding the reload back (above) had a cost the first version missed: the
     new worker is already in control and has dropped the old build's chunks,
     and Netlify answers a request for a missing file with index.html. A screen
     this tab had not opened yet then failed to load — "Failed to fetch
     dynamically imported module" and the error page, measured with two real
     builds; on a typed-into guest page, for good (third review 30.9).
     Vite reports exactly that failure as `vite:preloadError`: reload then —
     the user just asked for another screen, so nothing typed is being
     interrupted. Once per 10 seconds, so a real outage cannot become a reload
     loop. (A reload on every navigation while one is pending was tried too; it
     cannot run when the failing import takes the router down with it.) */
  // When the address last changed to another screen — what tells a failed
  // screen from a failed library (above). The router moves through
  // history.pushState / replaceState, which fire no event of their own.
  const navAtRef = useRef(0);
  useEffect(() => {
    const mark = () => { navAtRef.current = Date.now(); };
    const wrap = (k) => {
      const orig = window.history[k];
      window.history[k] = function (...args) {
        const before = window.location.pathname;
        const out = orig.apply(this, args);
        if (window.location.pathname !== before) mark();
        return out;
      };
      return () => { window.history[k] = orig; };
    };
    const undoPush = wrap("pushState"), undoReplace = wrap("replaceState");
    window.addEventListener("popstate", mark);
    return () => { undoPush(); undoReplace(); window.removeEventListener("popstate", mark); };
  }, []);

  useEffect(() => {
    const onChunkFail = (e) => {
      // Not every lazy chunk is a screen: analytics, the Excel export and the
      // door's QR decoder load the same way, at any moment. A failure there
      // reloaded a guest's half-typed form and a focused field away (fourth
      // review 30.9, a regression from this very fix). So: right after a
      // navigation, the failed chunk is the screen that was asked for, and the
      // page being left is going anyway — reload. Otherwise the update rule
      // applies (a failed analytics or export load is then just an error).
      const navigating = Date.now() - navAtRef.current < 10_000;
      if (!navigating && !isSafeToReload(document, touchedRef.current)) return;
      let last = 0;
      try { last = Number(sessionStorage.getItem("kh_chunk_reload") || 0); } catch { /* blocked */ }
      if (Date.now() - last < 10_000) return;           // already tried; let the error show
      try { sessionStorage.setItem("kh_chunk_reload", String(Date.now())); } catch { /* blocked */ }
      e.preventDefault?.();
      window.location.reload();
    };
    window.addEventListener("vite:preloadError", onChunkFail);
    return () => window.removeEventListener("vite:preloadError", onChunkFail);
  }, []);

  useEffect(() => {
    const onInput = () => { if (isGuestRoute(window.location.pathname)) touchedRef.current = true; };
    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, []);

  useEffect(() => {
    if (!needRefresh[0] && !needReload) return undefined;
    pendingRef.current = true;

    const applyIfSafe = () => {
      if (!pendingRef.current) return;
      if (!isSafeToReload(document, touchedRef.current)) return;
      pendingRef.current = false;
      if (needReload) window.location.reload();
      else updateServiceWorker(true);   // reloads
    };

    applyIfSafe();
    // If it was not safe, wait for a moment when it is — putting the phone
    // down, or simply clicking out of the field.
    document.addEventListener("visibilitychange", applyIfSafe);
    window.addEventListener("blur", applyIfSafe);
    const poll = setInterval(applyIfSafe, 3000);
    return () => {
      document.removeEventListener("visibilitychange", applyIfSafe);
      window.removeEventListener("blur", applyIfSafe);
      clearInterval(poll);
    };
  }, [needRefresh, needReload, updateServiceWorker]);

  // Ask again whenever the tab wakes up or the network comes back — the two
  // states a phone spends most of its life transitioning between.
  useEffect(() => {
    const ask = () => registrationRef.current?.update().catch(() => {});
    const onVisible = () => { if (document.visibilityState === "visible") ask(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", ask);
    window.addEventListener("focus", ask);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", ask);
      window.removeEventListener("focus", ask);
      const reg = registrationRef.current;
      if (reg?.__kochavTimer) clearInterval(reg.__kochavTimer);
    };
  }, []);
}
