import { useState, useEffect } from "react";
import { isSupabaseConfigured } from "../lib/supabase.js";
import {
  fetchActiveCloudTemplates,
  getTemplateCache,
  LOCAL_MAIN_TEMPLATES,
  EMPTY_TEMPLATE,
} from "../utils/templateHelpers.js";

// ── useTemplates ──────────────────────────────────────────────────────────────
//
// Returns the template list for the create-event picker.
//
// Behaviour:
//  1. Reads the module-level cache synchronously on mount — avoids any flash
//     where local templates appear briefly before the cloud swap.
//  2. If Supabase is configured and the cache is cold, fetches once and stores
//     the result in the module cache for the rest of the page session.
//  3. Falls back to LOCAL_MAIN_TEMPLATES silently on any error, empty result,
//     or when Supabase is not configured.
//  4. emptyTemplate is always the hardcoded "start from scratch" option —
//     it is never replaced by a cloud template.
//  5. loading is true only while a first-time cloud fetch is in-flight.
// ─────────────────────────────────────────────────────────────────────────────

export function useTemplates() {
  // Read cache synchronously to avoid flash from local→cloud swap.
  const [mainTemplates, setMainTemplates] = useState(
    () => getTemplateCache() || LOCAL_MAIN_TEMPLATES
  );
  const [source, setSource] = useState(
    () => getTemplateCache() ? "cloud" : "local"
  );
  // Loading only when Supabase is configured AND cache is cold.
  const [loading, setLoading] = useState(
    () => isSupabaseConfigured && !getTemplateCache()
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (getTemplateCache()) return; // cache warm — skip fetch

    let cancelled = false;

    fetchActiveCloudTemplates().then(cloudTemplates => {
      if (cancelled) return;
      if (cloudTemplates && cloudTemplates.length > 0) {
        setMainTemplates(cloudTemplates);
        setSource("cloud");
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []); // run once on mount

  return {
    mainTemplates,
    emptyTemplate: EMPTY_TEMPLATE,
    source,   // "local" | "cloud"
    loading,  // true while first-time cloud fetch is in-flight
  };
}
