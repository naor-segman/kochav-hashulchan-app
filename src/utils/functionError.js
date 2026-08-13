/**
 * What actually went wrong inside an Edge Function.
 *
 * WHY THIS EXISTS
 * `supabase.functions.invoke` wraps any non-2xx in a `FunctionsHttpError` whose
 * `.message` is always the same sentence — "Edge Function returned a non-2xx
 * status code" — and puts the RESPONSE BODY, the only part that says what
 * happened, on `.context`. Code that does `if (error) throw error` therefore
 * throws away its own diagnosis and shows the host a sentence that means
 * nothing to anybody.
 *
 * Measured the hard way, 13.8: the floor-plan detector had been failing for
 * days. The host saw "שגיאה בזיהוי: Edge Function returned a non-2xx status
 * code" while the function's own log said, plainly,
 * `Anthropic API error: 401 … invalid x-api-key`. That is a misconfigured key
 * and a two-minute fix, and it cost a round of screenshots and log-hunting
 * because the message never crossed the wire.
 *
 * SECOND BUG THE SAME LINE HID
 * The server's rate limit answers `{ error: "rate_limited", note }` with status
 * 429. 429 is a non-2xx, so it lands in `error` and `data` is null — meaning a
 * `data?.error === "rate_limited"` branch can never run, and a host who hit the
 * ceiling got a raw error toast instead of "try again in an hour". Reading the
 * body is what makes that branch reachable at all.
 */

/**
 * @returns {Promise<{code: string, note: string, status: number|null} | null>}
 *   `null` when there is nothing wrong. `code` is the function's own error
 *   string when it sent one, so callers can branch on it.
 */
export async function readFunctionFailure(error, data) {
  if (!error) {
    // A 2xx that still carries an error field — the shape our functions use
    // for "handled, but not a success".
    if (data && typeof data === "object" && data.error) {
      return { code: String(data.error), note: data.note ? String(data.note) : "", status: 200 };
    }
    return null;
  }

  const status = error?.context?.status ?? null;
  try {
    // `.json()` on the stored Response. Wrapped because the body may be empty,
    // may not be JSON, or may already have been read — none of which should
    // turn a diagnosable failure into a thrown one.
    const body = await error?.context?.json?.();
    if (body && typeof body === "object" && body.error) {
      return { code: String(body.error), note: body.note ? String(body.note) : "", status };
    }
  } catch { /* fall through to the transport message */ }

  return { code: error?.message || String(error), note: "", status };
}

/** The sentence to actually show a host, given a failure. */
export function functionFailureMessage(failure) {
  if (!failure) return "";
  return failure.note || failure.code || "שגיאה לא ידועה";
}
