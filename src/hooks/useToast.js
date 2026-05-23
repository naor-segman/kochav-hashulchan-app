import { useState, useRef, useCallback } from "react";

export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const showToast = useCallback((msg, variant) => {
    clearTimeout(timer.current);
    setToast({ msg, variant: variant || "ok" });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  return { toast, showToast };
}
