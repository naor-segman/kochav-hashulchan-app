import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";

// Supabase v2 auth hook — null-safe when VITE_SUPABASE_* env vars are missing.
//
// Returns:
//   user    — Supabase User object | null
//   loading — true only during initial session restore; false immediately when
//             Supabase is not configured
//   signIn(email, password) — throws on error
//   signUp(email, password) — resolves { needsConfirmation: bool }; throws on error
//   signOut()               — no-op when not configured

export function useAuth() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(!!supabase);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email, password) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email, password) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    // session is null when email confirmation is required
    return { needsConfirmation: !data.session };
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return { user, loading, signIn, signUp, signOut };
}
