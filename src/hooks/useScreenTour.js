import { useCallback, useEffect, useState } from "react";
import { hasTour } from "../data/tours.js";
import { hasSeenTour, markTourSeen } from "../utils/tourState.js";

/**
 * The guided tour (124) for one screen: opens by itself the first time this
 * browser shows the screen, and on demand after that.
 *
 * Shared by the Shell and by the one host screen that has no Shell (the door),
 * so the rules are written once:
 *   • after the screen has painted, and never over another open dialog (the
 *     name gate, the share gate) — it waits for that one to close;
 *   • never in an automated browser (navigator.webdriver): every qa/ harness
 *     would find its clicks landing on the tour. qa/guidedTour.mjs turns that
 *     flag off to test the tour itself;
 *   • finished or skipped, it is remembered and does not open by itself again.
 *
 * `openFor` holds WHICH key it is open for, so moving to another screen closes
 * it without an effect having to reset anything.
 */
export function useScreenTour(key) {
  const [openFor, setOpenFor] = useState(null);
  const available = !!key && hasTour(key);

  useEffect(() => {
    if (!available || hasSeenTour(key) || navigator.webdriver) return undefined;
    let tries = 0, timer = 0;
    const open = () => {
      if (document.querySelector('[aria-modal="true"]') && tries++ < 40) { timer = setTimeout(open, 750); return; }
      setOpenFor(key);
    };
    timer = setTimeout(open, 700);
    return () => clearTimeout(timer);
  }, [key, available]);

  const start = useCallback(() => setOpenFor(key), [key]);
  const close = useCallback(() => {
    markTourSeen(key);
    setOpenFor(null);
  }, [key]);

  return { available, open: available && openFor === key, start, close };
}
