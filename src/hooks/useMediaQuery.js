import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, kept live. useSyncExternalStore rather than
 * a state + effect pair (the 21 set-state-in-effect warnings in this codebase
 * are that shape). `fallback` is the answer where there is no matchMedia
 * (jsdom, very old browsers).
 */
export function useMediaQuery(query, fallback = false) {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener?.("change", onChange);
      return () => mq.removeEventListener?.("change", onChange);
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}

/** Reduced motion, or a connection that asked to save data: show stills. */
export function useStillOnly() {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  if (reduced) return true;
  if (typeof navigator === "undefined") return false;
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return Boolean(c && (c.saveData || /^(slow-)?2g$/.test(c.effectiveType || "")));
}
