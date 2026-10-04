/**
 * CORS for the three signed-in functions (detect-floor-plan,
 * create-checkout-session, create-billing-portal) — audit 3.10, S6.
 *
 * Plain JavaScript on purpose, like purgePaths.js: imported by the Deno
 * functions and by supabase/tests/cors.test.js (vitest).
 *
 * They answered `Access-Control-Allow-Origin: *`, so any website could drive
 * them from a signed-in host's browser session it had obtained a token for,
 * and read the answers. The browser is the only party CORS constrains, and the
 * only pages that should be calling these are the app's own: the request's
 * Origin is echoed back only when it is in APP_ORIGINS — the same list the
 * billing functions already use for return URLs. A localhost origin works
 * only when it is listed there too. Anything else gets no Allow-Origin header,
 * and the browser refuses to hand the response to the page.
 *
 * `Vary: Origin`, because the answer now depends on it and a cache must not
 * serve one origin's headers to another.
 *
 * @param {string|null} origin      the request's Origin header
 * @param {string|undefined} appOrigins  the APP_ORIGINS secret, comma-separated
 * @returns {Record<string,string>}
 */
export function corsHeaders(origin, appOrigins) {
  const headers = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const allowed = String(appOrigins ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
