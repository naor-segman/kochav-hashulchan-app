import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";

/**
 * Sign out of the admin panel and return to its login screen.
 *
 * This was the same four lines copied into eight screens. Not a bug — the
 * localStorage prune that a sign-out has to perform lives on the SIGNED_OUT
 * auth EVENT in useAuth, precisely so it covers these direct calls too, and
 * `useAuth.signOut()` is deliberately not used here because it lands the
 * operator on the customer login page rather than /admin/login.
 *
 * It is still eight copies of one decision. The next change to what signing out
 * of the panel means — clearing a cached admin role, a confirmation prompt, an
 * audit row — would have to find all eight, and would find seven.
 */
export function useAdminLogout() {
  const navigate = useNavigate();
  return useCallback(async () => {
    // `supabase` is null when the environment has no cloud configured. The
    // navigate still runs, so the operator is not stranded on a panel screen
    // they can no longer authenticate against.
    if (supabase) await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  }, [navigate]);
}
