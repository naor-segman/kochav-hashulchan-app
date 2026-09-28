/**
 * Applying an RSVP answer onto a guest row.
 *
 * Extracted from RSVPResponsesScreen so it can be tested, because this is the
 * shape that has already destroyed data twice in this codebase: a field that is
 * ABSENT from an incoming record is read as an instruction to CLEAR it. It
 * wiped companion names typed in the shared table, and it would wipe a meal the
 * host recorded by hand for a guest who then answered the link without picking
 * one. Silence is not an answer.
 */

/**
 * The meal to store for a guest, given one RSVP response and whatever the guest
 * row already had.
 *
 * The guest's own answer wins — they are the one who knows. An empty answer
 * means "no special request", which is not the same as "delete what is there",
 * so the existing value survives. Returns `undefined` when there is nothing to
 * store, so spreading the result never writes an empty string over a field.
 *
 * @param {{meal?: string}} response one row from `rsvp_responses`
 * @param {string} [existing] the guest row's current `meal`
 * @returns {string|undefined}
 */
export function pickMeal(response, existing) {
  const answered = typeof response?.meal === "string" ? response.meal.trim() : "";
  if (answered) return answered;
  const current = typeof existing === "string" ? existing.trim() : "";
  return current || undefined;
}

/**
 * The companion names to store for a guest, given one RSVP response and
 * whatever the guest row already had.
 *
 * The RSVP form renders `guestsCount - 1` OPTIONAL name boxes and drops the
 * blanks, so a guest who says "nine of us are coming" and types one name sends
 * exactly one name. Replacing an eight-name list with that one name — which is
 * what "non-empty wins" did — deletes seven names the host typed by hand, while
 * leaving `count` at nine. Measured: stored 8, response carried 1, result was 1.
 *
 * The rule that survives both cases: an answer only replaces the stored list
 * when it carries AT LEAST AS MANY names. Fewer names is a partially filled
 * form, not a deletion — the guest was never shown what the host already had,
 * so they cannot have meant to remove it.
 *
 * @param {{companions?: string[]}} response one row from `rsvp_responses`
 * @param {string[]} [existing] the guest row's current `companions`
 * @returns {string[]}
 */
export function pickCompanions(response, existing) {
  const answered = Array.isArray(response?.companions)
    ? response.companions.map(c => (c || "").trim()).filter(Boolean)
    : [];
  const current = Array.isArray(existing)
    ? existing.map(c => (c || "").trim()).filter(Boolean)
    : [];
  return answered.length >= current.length ? answered : current;
}

// Normalize a display name for fuzzy matching between an RSVP response and a
// guest-list row: trim, collapse inner whitespace, lowercase.
export function normName(s) {
  return (s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Normalize an Israeli phone to a comparable local form (05x…) for matching.
export function normPhone(p) {
  let d = (p || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d;
}

// A response's answer: prefer the new status column, fall back to the boolean.
export const respStatus = (r) => r.status || (r.attending ? "yes" : "no");

/**
 * Each respondent's LATEST answer, for counting (107/ת4, 28.9). A respondent
 * is their phone when they gave one, else their name — the same keys the
 * screen matches guests with. Rows without either are kept as they are.
 * Input order is kept for the survivors.
 */
export function latestPerRespondent(responses) {
  const list = Array.isArray(responses) ? responses : [];
  const key = r => (normPhone(r?.phone) ? "p:" + normPhone(r.phone) : normName(r?.guest_name) ? "n:" + normName(r.guest_name) : null);
  const ts  = r => new Date(r?.created_at).getTime() || 0;
  const best = new Map();
  for (const r of list) {
    const k = key(r);
    if (!k) continue;
    const prev = best.get(k);
    if (!prev || ts(r) >= ts(prev)) best.set(k, r);
  }
  return list.filter(r => { const k = key(r); return !k || best.get(k) === r; });
}
