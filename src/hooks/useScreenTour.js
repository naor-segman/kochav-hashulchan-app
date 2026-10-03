import { useCallback, useEffect, useState } from "react";
import { hasTour } from "../data/tours.js";
import { hasSeenTour, markTourSeen } from "../utils/tourState.js";

/**
 * The guided tour (124) for one screen: opens by itself the first time this
 * browser shows the screen, and on demand after that.
 *
 * Shared by the Shell and by the one host screen that has no Shell (the door),
 * so the rules are written once:
 *   • after the screen has painted, never over another open dialog (the name
 *     gate, the share gate), and not while the screen is still loading — it
 *     waits for either to finish, and after 30 seconds gives up for this
 *     visit instead of opening on top of them;
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
    let tries = 0, timer = 0, lastInput = 0;
    // A host already typing (the start form and the guest form focus a field
    // as they open) would have the tour take their focus mid-word. Wait for a
    // pause of a second and a half in their typing or tapping first.
    // `input` / `beforeinput` too: dictation, a predictive-text tap, a paste
    // and some IMEs put text in a field with no keydown at all (3.10, the
    // final verification run caught the tour opening mid-dictation).
    const onInput = () => { lastInput = Date.now(); };
    const INPUT_EVENTS = ["keydown", "pointerdown", "input", "beforeinput"];
    INPUT_EVENTS.forEach(t => window.addEventListener(t, onInput, true));
    const open = () => {
      // Another dialog is open, or the screen is still loading (a Loading
      // skeleton is aria-busy): the tour decides which parts exist when it
      // opens, so opening now would drop the ones about to arrive.
      if (document.querySelector('[aria-modal="true"], [aria-busy="true"]') || Date.now() - lastInput < 1500) {
        // Still blocked after ~30s: give up for this visit rather than open
        // over a dialog the host is in the middle of, or over a screen whose
        // parts never arrived. Not marked seen — it opens next time.
        if (tries++ < 40) timer = setTimeout(open, 750);
        return;
      }
      setOpenFor(key);
    };
    timer = setTimeout(open, 700);
    return () => {
      clearTimeout(timer);
      INPUT_EVENTS.forEach(t => window.removeEventListener(t, onInput, true));
    };
  }, [key, available]);

  const start = useCallback(() => setOpenFor(key), [key]);
  const close = useCallback(() => {
    markTourSeen(key);
    setOpenFor(null);
  }, [key]);

  return { available, open: available && openFor === key, start, close };
}
