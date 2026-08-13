import { useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

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

/** Is a reload safe right now — i.e. would it interrupt anybody? */
export function isSafeToReload(doc = document) {
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

  const { needRefresh, updateServiceWorker } = useRegisterSW({
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
    if (!needRefresh[0]) return undefined;
    pendingRef.current = true;

    const applyIfSafe = () => {
      if (!pendingRef.current) return;
      if (!isSafeToReload()) return;
      pendingRef.current = false;
      updateServiceWorker(true);   // reloads
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
  }, [needRefresh, updateServiceWorker]);

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
