import { useEffect } from "react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusWithin(el) {
  if (!el?.isConnected) return false;
  const target = el.matches?.(FOCUSABLE) ? el : el.querySelector?.(FOCUSABLE);
  if (!target) return false;
  target.focus();
  return document.activeElement === target;
}

/* Where the opener stood: every ancestor with the siblings it had then. When
 * the opener itself is gone — the row the "delete" confirm just removed — focus
 * goes to the neighbour that took its place, else the nearest control in the
 * closest container still on the page, instead of <body>. */
function placeOf(el) {
  const chain = [];
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    chain.push({ node: n, next: n.nextElementSibling, prev: n.previousElementSibling });
  }
  return chain;
}

function refocusNear(chain) {
  for (const { node, next, prev } of chain) {
    if (node.isConnected) return focusWithin(node);
    if (focusWithin(next) || focusWithin(prev)) return true;
  }
  return false;
}

const lost = () => !document.activeElement || document.activeElement === document.body;

/**
 * Give focus back to whatever had it when the dialog opened.
 *
 * Every dialog moved focus IN; none moved it back. Closing one — Escape,
 * "ביטול", confirming — left focus on <body>, so a keyboard or screen-reader
 * user was thrown to the top of the page after every confirm (fourth review
 * 30.9, measured on the re-seat confirm, the share gate and the delete
 * confirm). Call it BEFORE the effect that focuses the dialog's first control,
 * so the opener is read while it still has focus.
 *
 * A confirmed delete removes the opener AFTER the dialog closes (the caller
 * awaits the answer, then deletes), so the check runs again once that render
 * has landed (fifth review 30.9, סב88).
 */
export function useRestoreFocus() {
  useEffect(() => {
    const opener = document.activeElement;
    if (!opener || opener === document.body) return undefined;
    const chain = placeOf(opener);
    return () => {
      if (opener.isConnected && typeof opener.focus === "function") opener.focus();
      else refocusNear(chain);
      const recheck = () => { if (lost() && !opener.isConnected) refocusNear(chain); };
      setTimeout(recheck, 0);
      setTimeout(recheck, 300);
    };
  }, []);
}
