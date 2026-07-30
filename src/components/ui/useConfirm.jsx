import { useCallback, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog.jsx";

/**
 * The in-product replacement for the native `confirm()` / `prompt()`.
 *
 * Deliberately promise-based so the thirteen call sites keep their shape —
 * `if (!await confirm(msg)) return;` reads the same as the line it replaces,
 * which is what kept this from turning into a rewrite of nine screens.
 *
 * Usage:
 *   const { confirm, prompt, dialog } = useConfirm();
 *   const ok = await confirm("למחוק?", { danger: true });  // → boolean
 *   const v  = await prompt("שם הקבוצה");                   // → string | null
 *   return <>{dialog}…</>;
 */
export function useConfirm() {
  const [req, setReq] = useState(null);
  const resolveRef = useRef(null);

  const close = useCallback((value) => {
    setReq(null);
    const r = resolveRef.current;
    resolveRef.current = null;
    r?.(value);
  }, []);

  const open = useCallback((cfg) => new Promise((resolve) => {
    // A second dialog opening while one is up would strand the first promise.
    resolveRef.current?.(cfg.mode === "prompt" ? null : false);
    resolveRef.current = resolve;
    setReq(cfg);
  }), []);

  const confirm = useCallback(
    (message, opts = {}) => open({ mode: "confirm", message, ...opts }),
    [open]
  );

  const prompt = useCallback(
    (message, opts = {}) => open({ mode: "prompt", message, ...opts }),
    [open]
  );

  const dialog = req ? <ConfirmDialog {...req} onClose={close} /> : null;

  return { confirm, prompt, dialog };
}

export default useConfirm;
