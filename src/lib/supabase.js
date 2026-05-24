import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * True when both env vars are present and non-empty.
 * Use this for conditional UI (setup banners, disabled states).
 * Customer app never imports this file.
 */
export const isSupabaseConfigured = !!(url && key);

/**
 * Supabase client — null when env vars are missing.
 * All admin components must check isSupabaseConfigured (or supabase !== null)
 * before making any API call.
 *
 * To configure: copy .env.example to .env.local and fill in your project values.
 *   VITE_SUPABASE_URL      — Project Settings → API → Project URL
 *   VITE_SUPABASE_ANON_KEY — Project Settings → API → anon / public key
 */
export const supabase = isSupabaseConfigured ? createClient(url, key) : null;
