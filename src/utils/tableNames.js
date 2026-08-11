/**
 * Fresh table names that cannot collide with the ones already in the event.
 *
 * Two tables answering to one name is not cosmetic. The WhatsApp message, the
 * printed entry card and the violation list all address a table BY NAME, so a
 * duplicate sends two families to the same words and SeatingScreen's rename
 * guard refuses one outright. Anything that CREATES tables owes the same
 * promise the rename does.
 *
 * Counting from `tables.length` does not keep it: delete "שולחן 5" from a
 * fourteen-table event and the next table is named "שולחן 14", which is already
 * on the floor. So the count continues from the highest number ALREADY used
 * with this prefix, and every candidate is still checked against the names in
 * hand — a host who renamed a table by hand can have left "שולחן 20" sitting
 * above a much shorter list.
 *
 * (TableBuilderScreen's batch-add carries the same rule inline, written when
 * that screen hit this bug. It is the older of the two; if it is ever touched
 * again it should call this instead of keeping a second copy.)
 *
 * @param {Array<{name?: string}>} existing — the event's current tables.
 * @param {number} count — how many new names are wanted.
 * @param {string} [prefix] — the word the numbering hangs off.
 * @returns {string[]} `count` names, unique against `existing` and each other.
 */
export function nextTableNames(existing, count, prefix = "שולחן") {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (n === 0) return [];

  const tables = Array.isArray(existing) ? existing : [];
  const taken  = new Set(tables.map(t => String(t?.name ?? "").trim()));

  // The prefix is data — a host can call their tables "שולחן (VIP)" — so it is
  // escaped before it becomes a pattern.
  const rx = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+(\\d+)$");
  let highest = 0;
  for (const name of taken) {
    const m = rx.exec(name);
    if (m) highest = Math.max(highest, Number(m[1]));
  }

  const names = [];
  let next = highest;
  while (names.length < n) {
    let candidate = prefix + " " + (++next);
    while (taken.has(candidate)) candidate = prefix + " " + (++next);
    taken.add(candidate);
    names.push(candidate);
  }
  return names;
}

export default nextTableNames;
