import { useState, useRef } from "react";

/**
 * A <select> that commits on a deliberate choice, not on every arrow key (AX2).
 *
 * In Chromium on Windows/Linux, ArrowDown on a CLOSED select changes its
 * value and fires `change` synchronously, inside the keydown's default action
 * (measured: keydown → change → the keydown's setTimeout(0)). The seating
 * selects committed on `change`, so a keyboard user browsing the tables seated
 * the guest at the first one, the row left the waiting list, and focus fell to
 * <body>.
 *
 * So a change that happens inside an arrow / Home / End / PageUp / PageDown or
 * type-ahead keydown is held as PENDING (shown in the select, not saved) and
 * committed on Enter or when focus leaves; Escape drops it. Every other change
 * — a click in the open list, the phone's native picker, Enter inside an open
 * list — commits at once, as before.
 *
 * @param {string}   value     the saved value the select shows
 * @param {(v:string, el:HTMLSelectElement) => void} commit  called with a NEW value only
 */
const BROWSE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);

export function useDeferredSelect(value, commit) {
  const [pending, setPending] = useState(null);
  const browsing = useRef(false);

  const flush = (v, el) => {
    setPending(null);
    if (v != null && v !== value) commit(v, el);
  };

  return {
    value: pending ?? value,
    onKeyDown: (e) => {
      if (e.key === "Enter") {
        if (pending != null) { e.preventDefault(); flush(pending, e.currentTarget); }
        return;
      }
      if (e.key === "Escape") {
        if (pending != null) { e.preventDefault(); e.stopPropagation(); setPending(null); }
        return;
      }
      if (BROWSE_KEYS.has(e.key) || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        browsing.current = true;
        setTimeout(() => { browsing.current = false; }, 0);
      }
    },
    onChange: (e) => {
      const v = e.target.value;
      if (browsing.current) { setPending(v); return; }
      flush(v, e.target);
    },
    onBlur: (e) => { if (pending != null) flush(pending, e.target); },
  };
}

/**
 * After a commit removes the select's own row, put focus on the select that
 * took its place (the next row), or the one before it when it was the last —
 * instead of letting it fall to <body>. `scope` is the element whose selects
 * form the list (the waiting list, one table card); `selector` picks them.
 * `fallback` is focused when the list is now empty.
 */
export function refocusAfterRemoval(el, scope, selector, fallback) {
  if (!el || !scope) return;
  const before = [...scope.querySelectorAll(selector)];
  const idx = before.indexOf(el);
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body && scope.contains(document.activeElement) && document.activeElement.isConnected) return;
    const after = [...scope.querySelectorAll(selector)];
    const target = after[Math.min(Math.max(idx, 0), after.length - 1)];
    (target || fallback)?.focus?.();
  });
}
