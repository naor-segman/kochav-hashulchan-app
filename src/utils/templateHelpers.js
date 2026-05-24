import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import { EVENT_TEMPLATES } from "../data/eventTemplates.js";

// ── Local template constants ──────────────────────────────────────────────────

/** Hardcoded templates without the "empty" option. Always used as fallback. */
export const LOCAL_MAIN_TEMPLATES = EVENT_TEMPLATES.filter(t => t.id !== "empty");

/** The "start from scratch" template — always shown regardless of cloud state. */
export const EMPTY_TEMPLATE = EVENT_TEMPLATES.find(t => t.id === "empty");

// ── Cloud template helpers ────────────────────────────────────────────────────

/**
 * Map a Supabase templates row to the local template shape expected by the UI:
 *   { id, icon, label, type, desc }
 *
 * The `payload` column is intentionally ignored — customer event creation only
 * reads `type` from the template (no seed tables/guests/seating are applied).
 */
export function normalizeCloudTemplate(row) {
  return {
    id:    row.id,
    icon:  row.icon        || "✦",
    label: row.name        || "",
    type:  row.type        || "חתונה",
    desc:  row.description || "",
  };
}

/**
 * Fetch active templates from Supabase, ordered by sort_order then created_at.
 *
 * Returns:
 *  - Array of normalized template objects when successful and non-empty.
 *  - null when Supabase is not configured, the table is missing (42P01),
 *    the result is empty, or any other error occurs.
 *
 * Never throws — all errors are swallowed so callers can silently fall back
 * to LOCAL_MAIN_TEMPLATES.
 */
export async function fetchActiveCloudTemplates() {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from("templates")
      .select("id, name, type, icon, description, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at",  { ascending: true });

    if (error || !data || data.length === 0) return null;
    return data.map(normalizeCloudTemplate);
  } catch {
    return null;
  }
}
