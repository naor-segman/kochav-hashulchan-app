import { useEffect } from "react";

/**
 * Give focus back to whatever had it when the dialog opened.
 *
 * Every dialog moved focus IN; none moved it back. Closing one — Escape,
 * "ביטול", confirming — left focus on <body>, so a keyboard or screen-reader
 * user was thrown to the top of the page after every confirm (fourth review
 * 30.9, measured on the re-seat confirm, the share gate and the delete
 * confirm). Call it BEFORE the effect that focuses the dialog's first control,
 * so the opener is read while it still has focus.
 */
export function useRestoreFocus() {
  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener && opener !== document.body && opener.isConnected && typeof opener.focus === "function") {
        opener.focus();
      }
    };
  }, []);
}
