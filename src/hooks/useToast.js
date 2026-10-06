import { useState, useRef, useCallback } from "react";

/* How long a message stays. A flat 3.2s closed a 30-word message (the seating
   run's "why they did not fit") before it could be read — review 6.10. Short
   ones keep 3.2s; longer ones get ~60ms a character, up to 9s. */
export const toastDuration = (msg) =>
  Math.min(9000, Math.max(3200, String(msg ?? "").length * 60));

export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const showToast = useCallback((msg, variant) => {
    clearTimeout(timer.current);
    setToast({ msg, variant: variant || "ok" });
    timer.current = setTimeout(() => setToast(null), toastDuration(msg));
  }, []);

  return { toast, showToast };
}
