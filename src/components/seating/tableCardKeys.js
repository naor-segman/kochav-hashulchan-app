/**
 * One unique key per table card, in table order.
 *
 * The seating screen keys its cards — and its expanded/collapsed Set — on
 * `table.id`. Two tables answering to one id therefore behave as ONE card:
 * opening the first opens the second, React warns "two children with the same
 * key", and the two cards share their identity through every re-render.
 *
 * Nothing in the app mints that shape today: every table is created through
 * `uid()` (TableBuilderScreen's batch add, the floor-plan detector), and
 * normalizeEvent passes `ev.tables` through untouched. But the array is stored
 * data — it survives a cloud round-trip, an import and a hand-edited
 * localStorage — and a duplicate id there is not a reason for a screen to fold
 * two of the host's tables into one silently.
 *
 * So the card's IDENTITY comes from here, and everything that addresses the
 * TABLE (drop targets, seating writes, locks, renames) still uses `table.id`,
 * which is the only thing `ev.seating` can mean.
 *
 * @param {Array<{id?: string}>} tables
 * @returns {string[]} one key per table, unique, same length and order.
 */
export function tableCardKeys(tables) {
  const list = Array.isArray(tables) ? tables : [];
  const used = new Set();
  return list.map((t, i) => {
    const id = t?.id == null ? "" : String(t.id);
    // A table with no id at all is corrupt too, and index is the only thing
    // left to tell it apart by.
    const base = id || `#${i}`;
    let key = base;
    // The suffix can itself collide with a real id, so this loops rather than
    // trusting one attempt.
    for (let n = 2; used.has(key); n++) key = `${base}#dup${n}`;
    used.add(key);
    return key;
  });
}
