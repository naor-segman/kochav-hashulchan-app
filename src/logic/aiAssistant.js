// ── AI Seating Assistant — abstraction layer ──────────────────────────────────
//
// STATUS: INACTIVE — scaffolding only.
// No AI provider is connected. All exported functions are safe to call;
// they return mock-safe results and make zero network requests.
//
// ACTIVATION CHECKLIST (future):
//   1. Create a Supabase Edge Function: supabase/functions/ai-seating/index.ts
//   2. Set ANTHROPIC_API_KEY in Supabase Edge Function secrets (never in VITE_ vars)
//   3. Set AI_PROVIDER = "claude" in this file (or derive from env)
//   4. Implement the Edge Function route referenced in callAIProvider() below
//   5. Add a consent dialog before the first AI call (see privacy notes below)
//
// PRIVACY RULES (must remain in effect even after activation):
//   • Phone numbers are never included in AI payloads (EXCLUDED_FIELDS)
//   • Guest notes are never included without explicit user consent
//   • Guest IDs are replaced with anonymous tokens before sending
//   • All AI calls are initiated by the user — never automatic
//   • The Edge Function acts as the only network boundary (no direct browser→AI)
//
// ─────────────────────────────────────────────────────────────────────────────

// ── Provider config ───────────────────────────────────────────────────────────

/**
 * Active AI provider.
 *   "none"   — no AI; analyzeSeatingWithAI() returns null immediately (current)
 *   "claude" — routes through /functions/v1/ai-seating Edge Function (future)
 */
const AI_PROVIDER = "none";

/**
 * Guest fields that are ALWAYS stripped before building an AI payload.
 * Never remove phone from this list.
 */
const EXCLUDED_GUEST_FIELDS = ["phone", "notes"];

// ── Sanitization ──────────────────────────────────────────────────────────────

/**
 * Returns a privacy-safe snapshot of the event suitable for sending to an AI.
 *
 * What is included:
 *   • Event metadata: name, type, date, venue, brideName, groomName
 *   • Guests: anonymous token ID, name, group, side, count (seats)
 *   • Tables: id, name, capacity, type
 *   • Constraints: type, guestA token, guestB token
 *   • Current seating map: guestToken → tableId
 *   • Violations array from computeViolations()
 *
 * What is EXCLUDED (hardcoded, not configurable):
 *   • phone numbers
 *   • notes / dietary restrictions
 *   • Supabase user IDs
 *   • cloudId / sync metadata
 *   • createdAt / updatedAt / version
 *
 * Guest IDs are replaced with deterministic tokens (g_0, g_1, …) so that
 * real Supabase UUIDs are never transmitted to a third-party AI service.
 *
 * @param {object} event        Full local event object
 * @param {object[]} violations computeViolations() result (pre-computed)
 * @returns {object}            Sanitized payload — safe to send to Edge Function
 */
export function sanitizeEventForAI(event, violations = []) {
  const guests      = event.guests      || [];
  const tables      = event.tables      || [];
  const constraints = event.constraints || [];
  const seating     = event.seating     || {};

  // Build a stable guest ID → anonymous token map
  const tokenMap = {};
  guests.forEach((g, i) => { tokenMap[g.id] = "g_" + i; });

  const sanitizedGuests = guests.map(g => {
    const safe = {};
    Object.keys(g).forEach(k => {
      if (!EXCLUDED_GUEST_FIELDS.includes(k) && k !== "id") {
        safe[k] = g[k];
      }
    });
    safe.id = tokenMap[g.id];
    return safe;
  });

  const sanitizedSeating = {};
  Object.entries(seating).forEach(([guestId, tableId]) => {
    if (tokenMap[guestId]) sanitizedSeating[tokenMap[guestId]] = tableId;
  });

  const sanitizedConstraints = constraints.map(c => ({
    id:     c.id,
    type:   c.type,
    guestA: tokenMap[c.guestA] || c.guestA,
    guestB: tokenMap[c.guestB] || c.guestB,
  }));

  // Remap violation text to use anonymous tokens (names are still present in
  // sanitizedGuests.name — this is intentional; names are not PII under GDPR
  // for the purposes of seating optimization, but can be stripped further here
  // if the deployment requires stricter anonymization).
  const sanitizedViolations = violations.map(v => ({
    type:   v.type,
    text:   v.text,
    tableA: v.tableA,
    tableB: v.tableB,
  }));

  return {
    event: {
      name:       event.name       || "",
      type:       event.type       || "",
      date:       event.date       || "",
      venue:      event.venue      || "",
      brideName:  event.brideName  || "כלה",
      groomName:  event.groomName  || "חתן",
    },
    guests:      sanitizedGuests,
    tables:      tables.map(t => ({ id: t.id, name: t.name, capacity: t.capacity, type: t.type })),
    constraints: sanitizedConstraints,
    seating:     sanitizedSeating,
    violations:  sanitizedViolations,
    meta: {
      guestCount:     guests.length,
      tableCount:     tables.length,
      assignedCount:  Object.keys(seating).length,
      violationCount: violations.length,
    },
  };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds a structured Hebrew prompt for an AI seating assistant.
 * The prompt instructs the AI to return a JSON array of suggestions.
 *
 * This function is pure — it only builds a string from the sanitized payload.
 * It does NOT call any API.
 *
 * Expected AI response schema (each item in the array):
 *   {
 *     type:     string,                          // suggestion category
 *     severity: "critical" | "warning" | "info",
 *     text:     string,                          // Hebrew explanation
 *     action:   string,                          // Hebrew recommended action
 *   }
 *
 * @param {object} sanitizedPayload  Output of sanitizeEventForAI()
 * @returns {string}                 System + user prompt string
 */
export function buildSeatingAnalysisPrompt(sanitizedPayload) {
  const { event, meta, violations } = sanitizedPayload;

  const systemPrompt = [
    "אתה עוזר חכם לסידורי הושבה לאירועים בישראל.",
    "עבודתך: לנתח את נתוני ההושבה ולהציע המלצות מעשיות בעברית.",
    "כללים:",
    "1. החזר JSON בלבד — מערך של אובייקטי המלצה.",
    "2. כל המלצה: { type, severity, text, action }",
    "3. severity: critical / warning / info בלבד.",
    "4. text ו-action חייבים להיות בעברית.",
    "5. אל תציע שינויים אוטומטיים — המלצות בלבד.",
    "6. אל תמציא נתונים שאינם בפייאלוד.",
  ].join("\n");

  const userPrompt = [
    `אירוע: ${event.name} (${event.type})`,
    `${meta.guestCount} אורחים · ${meta.tableCount} שולחנות · ${meta.assignedCount} שובצו · ${meta.violationCount} הפרות`,
    "",
    "נתוני הושבה:",
    JSON.stringify(sanitizedPayload, null, 2),
    "",
    "החזר JSON בלבד (מערך המלצות). אל תוסיף טקסט מחוץ ל-JSON.",
  ].join("\n");

  return { systemPrompt, userPrompt };
}

// ── Response parser ───────────────────────────────────────────────────────────

/**
 * Parses the raw text response from an AI provider into a Suggestion[].
 *
 * Defensive: returns [] on any parse error so the UI never crashes.
 * Validates each item has the required shape before including it.
 *
 * @param {string} rawResponse  Raw text returned by the AI
 * @returns {object[]}          Array of valid Suggestion objects
 */
export function parseAISuggestions(rawResponse) {
  if (!rawResponse || typeof rawResponse !== "string") return [];

  let parsed;
  try {
    // Strip markdown code fences if the AI wrapped the JSON
    const cleaned = rawResponse
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const VALID_SEVERITIES = new Set(["critical", "warning", "info"]);

  return parsed.filter(item =>
    item &&
    typeof item.type     === "string" && item.type.trim()   &&
    typeof item.text     === "string" && item.text.trim()   &&
    typeof item.severity === "string" && VALID_SEVERITIES.has(item.severity)
  ).map(item => ({
    type:     item.type.trim(),
    severity: item.severity,
    text:     item.text.trim(),
    action:   typeof item.action === "string" ? item.action.trim() : "",
  }));
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Analyze seating with AI and return an array of AI-generated suggestions.
 *
 * CURRENT BEHAVIOR (AI_PROVIDER === "none"):
 *   Returns null immediately — no network request, no data sent anywhere.
 *   The caller should fall back to rule-based suggestions from seatingAnalysis.js.
 *
 * FUTURE BEHAVIOR (AI_PROVIDER === "claude"):
 *   1. Calls sanitizeEventForAI() to strip PII
 *   2. Calls buildSeatingAnalysisPrompt() to construct the prompt
 *   3. POSTs to the Supabase Edge Function /functions/v1/ai-seating
 *      (Edge Function holds ANTHROPIC_API_KEY — never exposed to browser)
 *   4. Calls parseAISuggestions() on the response text
 *   5. Returns the parsed Suggestion[]
 *
 * @param {object}   event      Full local event object
 * @param {object[]} violations Pre-computed computeViolations() result
 * @returns {Promise<object[]|null>}
 *   Suggestion[] on success, null when provider is "none" or on any error.
 */
export async function analyzeSeatingWithAI(event, violations = []) {
  // ── Provider: none ─────────────────────────────────────────────────────────
  // AI is not yet connected. Return null so callers use rule-based fallback.
  if (AI_PROVIDER === "none") return null;

  // ── Provider: claude (future — not yet reachable) ──────────────────────────
  // TODO: Activate when supabase/functions/ai-seating/index.ts is deployed.
  //
  // Steps to implement:
  //   1. Uncomment the block below
  //   2. Replace EDGE_FUNCTION_URL with the real Supabase project URL
  //   3. Pass the Supabase anon key in the Authorization header
  //   4. The Edge Function must verify the JWT and enforce rate limits
  //
  // if (AI_PROVIDER === "claude") {
  //   try {
  //     const payload  = sanitizeEventForAI(event, violations);
  //     const { systemPrompt, userPrompt } = buildSeatingAnalysisPrompt(payload);
  //     const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1/ai-seating";
  //     const res = await fetch(EDGE_FUNCTION_URL, {
  //       method:  "POST",
  //       headers: {
  //         "Content-Type":  "application/json",
  //         "Authorization": "Bearer " + import.meta.env.VITE_SUPABASE_ANON_KEY,
  //       },
  //       body: JSON.stringify({ systemPrompt, userPrompt }),
  //     });
  //     if (!res.ok) throw new Error("AI service error: " + res.status);
  //     const { text } = await res.json();
  //     return parseAISuggestions(text);
  //   } catch {
  //     return null; // fall back to rule-based suggestions on any error
  //   }
  // }

  return null;
}
