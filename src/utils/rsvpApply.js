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
