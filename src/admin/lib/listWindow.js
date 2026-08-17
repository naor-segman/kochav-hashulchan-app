/* The admin lists load a capped window of a table. This is how a screen knows
 * it is holding one, and how many rows it is a window ONTO.
 *
 * Shared because four admin screens have the same cap and, at the time of
 * writing, three of them still print the size of their window as if it were
 * the table: events (500 — fixed, checklist 7), subscriptions (500), activity
 * (200) and errors (200). AdminUsersScreen was the only one doing it right,
 * and it carries the edge case below.
 */

/** Attach `total` and `truncated` to a loaded window, in place.
 *
 *  @param rows        the loaded array (mutated and returned)
 *  @param limit       the cap the query was made with
 *  @param exactCount  `count` from a `{ count: "exact", head: true }` select,
 *                     or null/undefined if that query failed or was not made
 */
export function attachWindowMeta(rows, limit, exactCount) {
  // `typeof === "number"` first, deliberately: this codebase has already been
  // bitten by null coercing to a number (`null / 100 === 0`), and
  // `Number.isFinite(null)` is false but `null >= 0` is true.
  const known = typeof exactCount === "number" && Number.isFinite(exactCount);

  rows.total = known ? exactCount : rows.length;

  // With a real count, truncation is simply "the table holds more than we do".
  //
  // THE EDGE THIS EXISTS FOR: `rows.length >= limit` on its own — the test
  // AdminUsersScreen uses — is wrong at exactly `limit` rows. A table with
  // precisely 500 events returns a full window of a COMPLETE list, and that
  // test calls it truncated, so the screen tells the operator rows are hidden
  // when none are. Rare, but it is a lie in the one direction that matters:
  // this notice exists to be believed.
  //
  // Without a count all we have is the window, and a full one is the only
  // signal there is — so the imprecise test stays as the fallback. Better to
  // over-warn than to present a window as a table.
  rows.truncated = known ? exactCount > rows.length : rows.length >= limit;

  return rows;
}
