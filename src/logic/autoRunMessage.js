/* What the automatic seating run says when it finishes (SeatingScreen runAuto).
 *
 * Pure, so every branch is pinned by a test and not by a browser run. The
 * message has to name the REAL reason someone is left standing, because each
 * one has a different fix:
 *   • every table is locked              → unlock one, or add one
 *   • a row is bigger than any open table → enlarge one table, or split the row
 *   • the open tables are simply full    → N seats short (locked tables' empty
 *                                          chairs are not counted as free —
 *                                          the engine will not use them)
 *   • the free seats exist but are scattered → families do not split, and
 *                                          "apart" rules narrow where people go
 * Review 6.10 drove it in a browser: a family of 14 with three tables of 10
 * was told the seats were "scattered"; eight free chairs that were all at a
 * locked table were called free; one person held out by "apart" rules was
 * told "a family does not split"; an overbooked locked table cancelled
 * another table's free seats out of the shortfall; and "1 מקומות".
 */

const size = (g) => Math.max(1, Number(g?.count) || 1);

/**
 * @param {object} a
 * @param {object[]} a.active      rows that are coming (not declined)
 * @param {object[]} a.allGuests   every row (declined passengers at locked tables take chairs)
 * @param {object[]} a.tables
 * @param {object}   a.seating     the run's result { guestId: tableId }
 * @param {string[]} [a.lockedTables]
 * @param {object[]} [a.constraints]
 * @param {number}   a.violations  constraints still broken after the run
 * @returns {{ text: string, variant: "ok"|"warn"|"err" }}
 */
export function autoRunMessage({ active, allGuests, tables, seating, lockedTables = [], constraints = [], violations = 0 }) {
  const placed = active.filter(g => seating[g.id]).length;
  const waiting = active.filter(g => !seating[g.id]);

  if (!waiting.length) {
    const all = placed === 1 ? "הרשומה שובצה" : `כל ${placed} הרשומות שובצו`;
    if (violations > 0) {
      return { variant: "warn", text: `${all}, אבל ${violations === 1 ? "אילוץ אחד לא מתקיים" : violations + " אילוצים לא מתקיימים"} — פירוט למטה` };
    }
    return { variant: "ok", text: `${all} ✓` };
  }

  const head = (placed === 1 ? "שובצה רשומה אחת. " : `שובצו ${placed} רשומות. `) +
    (waiting.length === 1 ? "אחת לא נכנסה — " : `${waiting.length} לא נכנסו — `);

  const byId = new Map(allGuests.map(g => [g.id, g]));
  const used = new Map();
  for (const [gid, tid] of Object.entries(seating)) {
    const g = byId.get(gid);
    if (g) used.set(tid, (used.get(tid) || 0) + size(g));
  }
  const locked = new Set(lockedTables);
  const open = tables.filter(t => !locked.has(t.id));
  const freeAt = (t) => Math.max(0, (Number(t.capacity) || 0) - (used.get(t.id) || 0));
  const openFree = open.reduce((n, t) => n + freeAt(t), 0);
  const lockedFree = tables.filter(t => locked.has(t.id)).reduce((n, t) => n + freeAt(t), 0);
  const waitingSeats = waiting.reduce((n, g) => n + size(g), 0);
  const maxCap = open.reduce((m, t) => Math.max(m, Number(t.capacity) || 0), 0);

  let why;
  if (!open.length) {
    why = "כל השולחנות נעולים. פתחו שולחן, או הוסיפו שולחן חדש.";
  } else if (waiting.some(g => size(g) > maxCap)) {
    const big = waiting.filter(g => size(g) > maxCap);
    why = big.length === 1
      ? `"${big[0].name}" (${size(big[0])} מקומות) גדולים מכל שולחן. הגדילו שולחן אחד ל-${size(big[0])} מקומות לפחות, או פצלו את השורה.`
      : `${big.length} רשומות גדולות מכל שולחן. הגדילו שולחנות, או פצלו אותן.`;
  } else if (openFree < waitingSeats) {
    if (lockedFree > 0 && openFree + lockedFree >= waitingSeats) {
      why = `המקומות הפנויים נמצאים בשולחנות נעולים. פתחו אותם, או הוסיפו שולחנות.`;
    } else {
      const short = waitingSeats - openFree;
      why = (short === 1 ? "חסר עוד מקום אחד." : `חסרים עוד ${short} מקומות.`) +
        " הוסיפו שולחנות, או הגדילו את מספר המקומות בשולחנות.";
    }
  } else {
    const waitingIds = new Set(waiting.map(g => g.id));
    const apart = constraints.some(c => c?.type === "apart" && (waitingIds.has(c.guestA) || waitingIds.has(c.guestB)));
    const families = waiting.some(g => size(g) > 1);
    const free = `יש ${openFree === 1 ? "מקום פנוי אחד" : openFree + " מקומות פנויים"}`;
    if (families && apart) why = `${free}, אבל מפוזרים: משפחה לא מתפצלת בין שולחנות, ויש מי שאסור שיישבו יחד. הוסיפו שולחנות או הגדילו כמה מהם.`;
    else if (families) why = `${free}, אבל מפוזרים, ומשפחה לא מתפצלת בין שולחנות. הוסיפו שולחנות או הגדילו כמה מהם.`;
    else why = `${free}, אבל האילוצים לא מאפשרים להושיב שם את מי שנשאר. בדקו את האילוצים, או הוסיפו שולחן.`;
  }
  return { variant: "err", text: head + why };
}
