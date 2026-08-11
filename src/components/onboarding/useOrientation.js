import { useCallback, useState } from "react";

const KEY = "kochav_orientation_v1";

function readDismissed() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

/**
 * Orientation, not a tour.
 *
 * The thing it replaces was a six-item checklist that opened by naming every
 * screen in the product — a wall of obligation handed to somebody who has not
 * done one thing yet. What a first-time host actually needs is smaller and
 * comes earlier: *what are the parts of this thing, and which part is today's*.
 * So this says three things and stops.
 *
 * Dismissed once, never shown again (localStorage, per browser — the same place
 * the guest-mode data lives, so it cannot get out of step with it), and always
 * reachable again from the "איך זה עובד" button that sits next to it.
 */
export function useOrientation() {
  // Lazy initial state, deliberately not an effect: this is a read, and the
  // codebase already carries 24 load-then-setState sites it does not want more of.
  const [open, setOpen] = useState(() => !readDismissed());

  const dismiss = useCallback(() => {
    try { localStorage.setItem(KEY, "1"); } catch { /* private mode — it just shows again */ }
    setOpen(false);
  }, []);

  const show = useCallback(() => setOpen(true), []);

  return { open, dismiss, show };
}
