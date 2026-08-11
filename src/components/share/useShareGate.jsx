import { useCallback, useState } from "react";
import { useAuth } from "../../hooks/useAuth.js";
import ShareGateDialog from "./ShareGate.jsx";

export function useShareGate() {
  const { user } = useAuth();
  const [pending, setPending] = useState(null);

  /**
   * guard(what, run) — runs `run` when there is an account, otherwise explains.
   * Returns true when the action went ahead, so callers can branch if needed.
   */
  const guard = useCallback((what, run) => {
    if (user) { run?.(); return true; }
    setPending({ what });
    return false;
  }, [user]);

  const close = useCallback(() => setPending(null), []);

  const gate = pending
    ? <ShareGateDialog what={pending.what} onClose={close} />
    : null;

  return { guard, gate, isGuest: !user };
}
