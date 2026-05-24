import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// supabase is null when env vars are not configured.
// All admin components must check for null before calling any method.
// Customer app code never imports this file.
export const supabase = (url && key) ? createClient(url, key) : null;
