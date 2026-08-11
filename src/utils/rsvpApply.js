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
