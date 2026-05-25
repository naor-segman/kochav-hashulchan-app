import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import { EVENT_TEMPLATES } from "../data/eventTemplates.js";

// ── Local template constants ──────────────────────────────────────────────────

/** Hardcoded templates without the "empty" option. Always used as fallback. */
export const LOCAL_MAIN_TEMPLATES = EVENT_TEMPLATES.filter(t => t.id !== "empty");

/** The "start from scratch" template — always shown regardless of cloud state. */
export const EMPTY_TEMPLATE = EVENT_TEMPLATES.find(t => t.id === "empty");

// ── In-memory template cache ──────────────────────────────────────────────────
//
// Module-level variable — lives for the duration of the current page session.
// Cleared on page refresh automatically (module re-evaluates).
//
// Why module-level (not sessionStorage / React state):
//   - Zero serialization overhead — no JSON parse on read.
//   - No TTL needed: admin changes are expected after a customer page refresh,
//     which clears the module cache naturally.
//   - Lets useTemplates() read the cached value synchronously on mount,
//     avoiding any flash where local templates show briefly before cloud ones.

let _templateCache = null; // null = cold, [] or [...] = fetched

/** Read the current in-memory template cache synchronously. Returns null if cold. */
export function getTemplateCache() {
  return _templateCache;
}

/** Invalidate the in-memory cache (e.g., after an admin operation in the same session). */
export function invalidateTemplateCache() {
  _templateCache = null;
}

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
 * Results are stored in the module-level cache so subsequent calls within the
 * same page session are instant (no network request).
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

  // Return cached result immediately — avoids repeated network requests.
  if (_templateCache !== null) return _templateCache;

  try {
    const { data, error } = await supabase
      .from("templates")
      .select("id, name, type, icon, description, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at",  { ascending: true });

    if (error || !data || data.length === 0) return null;

    _templateCache = data.map(normalizeCloudTemplate);
    return _templateCache;
  } catch {
    return null;
  }
}
