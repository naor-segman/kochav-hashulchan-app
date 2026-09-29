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
