import { useState, useEffect } from "react";
import { isSupabaseConfigured } from "../lib/supabase.js";
import {
  fetchActiveCloudTemplates,
  LOCAL_MAIN_TEMPLATES,
  EMPTY_TEMPLATE,
} from "../utils/templateHelpers.js";

// ── useTemplates ──────────────────────────────────────────────────────────────
//
// Returns the template list for the create-event picker.
//
// Behaviour:
//  1. Starts immediately with LOCAL_MAIN_TEMPLATES so the picker is usable
//     even before any network request completes.
//  2. If Supabase is configured, attempts a background fetch of active cloud
//     templates and swaps to them when the fetch succeeds.
//  3. Falls back to LOCAL_MAIN_TEMPLATES silently on any error, empty result,
//     or when Supabase is not configured.
//  4. emptyTemplate is always the hardcoded "start from scratch" option —
//     it is never replaced by a cloud template.
// ─────────────────────────────────────────────────────────────────────────────

export function useTemplates() {
  const [mainTemplates, setMainTemplates] = useState(LOCAL_MAIN_TEMPLATES);
  const [source,        setSource]        = useState("local"); // "local" | "cloud"

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let cancelled = false;

    fetchActiveCloudTemplates().then(cloudTemplates => {
      if (cancelled) return;
      if (cloudTemplates && cloudTemplates.length > 0) {
        setMainTemplates(cloudTemplates);
        setSource("cloud");
      }
      // else: leave local fallback in place
    });

    return () => { cancelled = true; };
  }, []); // run once on mount

  return {
    mainTemplates,
    emptyTemplate: EMPTY_TEMPLATE,
    source, // "local" | "cloud" — available for subtle UI hints if needed
  };
}
