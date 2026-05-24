// Rule-based smart seating suggestion engine.
// Pure function — no side effects, no API calls, no seating mutations.

/**
 * @typedef {{ type: string, severity: "critical"|"warning"|"info", text: string, action: string }} Suggestion
 */

/**
 * Generate smart seating suggestions from current event data.
 * Returns an array of Suggestion objects sorted critical → warning → info.
 *
 * @param {object[]} guests
 * @param {object[]} tables
 * @param {object[]} constraints
 * @param {object}   seating     { [guestId]: tableId }
 * @returns {Suggestion[]}
 */
export function generateSuggestions(guests, tables, constraints, seating) {
  if (!guests.length || !tables.length) return [];

  const suggestions = [];
  const guestMap    = Object.fromEntries(guests.map(g => [g.id, g]));
  const tableMap    = Object.fromEntries(tables.map(t => [t.id, t]));

  const tableSeats  = tid => guests
    .filter(g => seating[g.id] === tid)
    .reduce((s, g) => s + (g.count || 1), 0);

  const tableGuests = tid => guests.filter(g => seating[g.id] === tid);

  const assigned   = guests.filter(g =>  seating[g.id]);
  const unassigned = guests.filter(g => !seating[g.id]);

  // ── 1. Unassigned guests ──────────────────────────────────────────────────
  if (unassigned.length > 0 && assigned.length > 0) {
    const pct    = unassigned.length / guests.length;
    const seats  = unassigned.reduce((s, g) => s + (g.count || 1), 0);
    suggestions.push({
      type:     "unassigned",
      severity: pct > 0.2 ? "critical" : "warning",
      text:     `${unassigned.length} אורחים (${seats} מקומות) עדיין לא שובצו לשולחן`,
      action:   'הפעל "חשב הושבה" לשיבוץ אוטומטי, או שבץ ידנית מהרשימה',
    });
  }

  // ── 2. Together constraints violated ─────────────────────────────────────
  const togetherViol = [];
  constraints.forEach(c => {
    if (c.type !== "together") return;
    const ga = guestMap[c.guestA];
    const gb = guestMap[c.guestB];
    if (!ga || !gb) return;
    const ta = seating[c.guestA];
    const tb = seating[c.guestB];
    if (ta && tb && ta !== tb) togetherViol.push({ ga, gb, ta, tb });
  });

  if (togetherViol.length === 1) {
    const { ga, gb, ta, tb } = togetherViol[0];
    suggestions.push({
      type:     "together_violated",
      severity: "critical",
      text:     `${ga.name} ו${gb.name} חייבים לשבת יחד — שובצו ל${tableMap[ta]?.name || "?"} ו${tableMap[tb]?.name || "?"}`,
      action:   "העבר אחד מהם לשולחן של השני, או הפעל \"חשב מחדש\"",
    });
  } else if (togetherViol.length > 1) {
    suggestions.push({
      type:     "together_violated",
      severity: "critical",
      text:     `${togetherViol.length} זוגות אורחים עם אילוץ "יחד" שובצו לשולחנות שונים`,
      action:   "הפעל \"חשב מחדש\" לתיקון אוטומטי",
    });
  }

  // ── 3. Apart constraints violated ────────────────────────────────────────
  const apartViol = [];
  constraints.forEach(c => {
    if (c.type !== "apart") return;
    const ga = guestMap[c.guestA];
    const gb = guestMap[c.guestB];
    if (!ga || !gb) return;
    const ta = seating[c.guestA];
    const tb = seating[c.guestB];
    if (ta && tb && ta === tb) apartViol.push({ ga, gb, ta });
  });

  if (apartViol.length === 1) {
    const { ga, gb, ta } = apartViol[0];
    suggestions.push({
      type:     "apart_violated",
      severity: "critical",
      text:     `${ga.name} ו${gb.name} לא יכולים לשבת יחד — שניהם ב${tableMap[ta]?.name || "אותו שולחן"}`,
      action:   "העבר אחד מהם לשולחן אחר",
    });
  } else if (apartViol.length > 1) {
    suggestions.push({
      type:     "apart_violated",
      severity: "critical",
      text:     `${apartViol.length} זוגות אורחים עם אילוץ "בנפרד" שובצו לאותו שולחן`,
      action:   "הפעל \"חשב מחדש\" לתיקון אוטומטי",
    });
  }

  // ── 4. Overloaded tables ──────────────────────────────────────────────────
  tables.forEach(t => {
    const used = tableSeats(t.id);
    if (used > t.capacity) {
      suggestions.push({
        type:     "overloaded",
        severity: "critical",
        text:     `${t.name} עמוס מעל קיבולת: ${used} מושבים על ${t.capacity} מקומות (חריגה של ${used - t.capacity})`,
        action:   "העבר אורחים לשולחן עם מקום פנוי",
      });
    }
  });

  // ── 5. Underused tables (only meaningful when most guests are seated) ─────
  const totalAssignedSeats = assigned.reduce((s, g) => s + (g.count || 1), 0);
  const totalGuestSeats    = guests.reduce((s, g) => s + (g.count || 1), 0);
  const assignedFraction   = totalGuestSeats > 0 ? totalAssignedSeats / totalGuestSeats : 0;

  if (assignedFraction >= 0.6 && assigned.length > 0) {
    let underusedCount = 0;
    tables.forEach(t => {
      if (underusedCount >= 3) return;
      const used = tableSeats(t.id);
      const pct  = t.capacity > 0 ? used / t.capacity : 0;
      if (used > 0 && pct < 0.4 && t.capacity >= 4) {
        underusedCount++;
        suggestions.push({
          type:     "underused",
          severity: "info",
          text:     `${t.name} מנוצל בחלקו: ${used} מתוך ${t.capacity} מקומות (${Math.round(pct * 100)}%)`,
          action:   "שקול להעביר אורחים ממנו לשולחן אחר, או להוסיף אורחים מהממתינים",
        });
      }
    });
  }

  // ── 6. Split guest groups ─────────────────────────────────────────────────
  if (assigned.length > 0) {
    const groupTables = {};
    const groupCount  = {};
    assigned.forEach(g => {
      const key = g.group;
      if (!key) return;
      if (!groupTables[key]) groupTables[key] = new Set();
      groupTables[key].add(seating[g.id]);
      groupCount[key] = (groupCount[key] || 0) + 1;
    });

    let splitCount = 0;
    Object.entries(groupTables).forEach(([group, tableSet]) => {
      if (splitCount >= 3) return;
      const count = groupCount[group];
      if (tableSet.size >= 4 && count >= 6) {
        splitCount++;
        suggestions.push({
          type:     "split_group",
          severity: "warning",
          text:     `קבוצת "${group}" מפוצלת על ${tableSet.size} שולחנות שונים (${count} אורחים)`,
          action:   "שקול לאחד את הקבוצה לשולחן אחד גדול יותר",
        });
      }
    });
  }

  // ── 7. Side imbalance per table ───────────────────────────────────────────
  if (assigned.length > 0) {
    let imbalanceCount = 0;
    tables.forEach(t => {
      if (imbalanceCount >= 2) return;
      const tg = tableGuests(t.id);
      if (tg.length < 6) return;

      const brideCount = tg.filter(g => g.side === "bride").length;
      const groomCount = tg.filter(g => g.side === "groom").length;
      if (brideCount === 0 || groomCount === 0) return;

      const total      = tg.length;
      const maxSide    = Math.max(brideCount, groomCount);
      const minSide    = Math.min(brideCount, groomCount);
      const dominantPct = maxSide / total;

      if (dominantPct >= 0.8 && minSide >= 2) {
        imbalanceCount++;
        const dominant = brideCount > groomCount ? "כלה" : "חתן";
        const minority = brideCount > groomCount ? "חתן" : "כלה";
        suggestions.push({
          type:     "side_imbalance",
          severity: "info",
          text:     `${t.name}: ${Math.round(dominantPct * 100)}% מצד ${dominant}, ${minSide} אורחים מצד ${minority}`,
          action:   `שקול לשבץ את ${minSide} אורחי צד ${minority} עם בני ביתם`,
        });
      }
    });
  }

  // Sort: critical first, then warning, then info
  const order = { critical: 0, warning: 1, info: 2 };
  suggestions.sort((a, b) => order[a.severity] - order[b.severity]);

  return suggestions;
}
