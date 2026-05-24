// Rule-based smart seating suggestion engine.
// Pure function — no side effects, no API calls, no seating mutations.
//
// Suggestion shape:
//   id                string   — stable deterministic key (safe React key)
//   type              string   — category identifier
//   severity          "critical"|"warning"|"info"
//   explanation       string   — Hebrew human-readable description
//   recommendedAction string   — Hebrew suggested next step (always shown)
//   canApply          boolean  — true when a safe one-step fix is available
//   applyAction       object|null — action descriptor consumed by SeatingScreen
//
// applyAction shapes (when canApply = true):
//   { type: "unassignGuest", guestId, guestName, tableName }
//   { type: "moveGuest",     guestId, toTableId, guestName, fromTableName, toTableName }
//
// Suggestions with canApply = false are informational only — no UI button shown.

/**
 * Generate smart seating suggestions from current event data.
 * Returns an array of Suggestion objects sorted critical → warning → info.
 *
 * @param {object[]} guests
 * @param {object[]} tables
 * @param {object[]} constraints
 * @param {object}   seating   { [guestId]: tableId }
 * @returns {object[]}
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
    const pct   = unassigned.length / guests.length;
    const seats = unassigned.reduce((s, g) => s + (g.count || 1), 0);
    suggestions.push({
      id:                "unassigned",
      type:              "unassigned",
      severity:          pct > 0.2 ? "critical" : "warning",
      explanation:       `${unassigned.length} אורחים (${seats} מקומות) עדיין לא שובצו לשולחן`,
      recommendedAction: 'הפעל "חשב הושבה" לשיבוץ אוטומטי, או שבץ ידנית מהרשימה',
      canApply:          false,
      applyAction:       null,
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
    // Safe fix: move gb to ga's table if there's room
    const remaining = (tableMap[ta]?.capacity || 0) - tableSeats(ta);
    const canMove   = remaining >= (gb.count || 1);
    suggestions.push({
      id:                `together_${ga.id}_${gb.id}`,
      type:              "together_violated",
      severity:          "critical",
      explanation:       `${ga.name} ו${gb.name} חייבים לשבת יחד — שובצו ל${tableMap[ta]?.name || "?"} ו${tableMap[tb]?.name || "?"}`,
      recommendedAction: canMove
        ? `העבר את ${gb.name} ל${tableMap[ta]?.name || "שולחן של " + ga.name}`
        : "העבר אחד מהם לשולחן של השני, או הפעל \"חשב מחדש\"",
      canApply:    canMove,
      applyAction: canMove ? {
        type:          "moveGuest",
        guestId:       gb.id,
        toTableId:     ta,
        guestName:     gb.name,
        fromTableName: tableMap[tb]?.name || "?",
        toTableName:   tableMap[ta]?.name || "?",
      } : null,
    });
  } else if (togetherViol.length > 1) {
    suggestions.push({
      id:                "together_multi",
      type:              "together_violated",
      severity:          "critical",
      explanation:       `${togetherViol.length} זוגות אורחים עם אילוץ "יחד" שובצו לשולחנות שונים`,
      recommendedAction: 'הפעל "חשב מחדש" לתיקון אוטומטי',
      canApply:          false,
      applyAction:       null,
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
    // Safe fix: unassign gb (returns to waiting list)
    suggestions.push({
      id:                `apart_${ga.id}_${gb.id}`,
      type:              "apart_violated",
      severity:          "critical",
      explanation:       `${ga.name} ו${gb.name} לא יכולים לשבת יחד — שניהם ב${tableMap[ta]?.name || "אותו שולחן"}`,
      recommendedAction: `החזר את ${gb.name} לרשימת הממתינים ושבץ אותו לשולחן אחר`,
      canApply:    true,
      applyAction: {
        type:      "unassignGuest",
        guestId:   gb.id,
        guestName: gb.name,
        tableName: tableMap[ta]?.name || "?",
      },
    });
  } else if (apartViol.length > 1) {
    suggestions.push({
      id:                "apart_multi",
      type:              "apart_violated",
      severity:          "critical",
      explanation:       `${apartViol.length} זוגות אורחים עם אילוץ "בנפרד" שובצו לאותו שולחן`,
      recommendedAction: 'הפעל "חשב מחדש" לתיקון אוטומטי',
      canApply:          false,
      applyAction:       null,
    });
  }

  // ── 4. Overloaded tables ──────────────────────────────────────────────────
  tables.forEach(t => {
    const used = tableSeats(t.id);
    if (used <= t.capacity) return;

    const tg = tableGuests(t.id);

    // Find guests whose "together" constraint is satisfied by another guest on
    // this same table — moving them would break that constraint, so they are
    // anchored. All other guests are safe to unassign.
    const anchoredIds = new Set();
    constraints.forEach(c => {
      if (c.type !== "together") return;
      const ta2 = seating[c.guestA];
      const tb2 = seating[c.guestB];
      if (ta2 === t.id && tb2 === t.id) {
        anchoredIds.add(c.guestA);
        anchoredIds.add(c.guestB);
      }
    });

    const safeGuest = tg.find(g => !anchoredIds.has(g.id));

    suggestions.push({
      id:                `overloaded_${t.id}`,
      type:              "overloaded",
      severity:          "critical",
      explanation:       `${t.name} עמוס מעל קיבולת: ${used} מושבים על ${t.capacity} מקומות (חריגה של ${used - t.capacity})`,
      recommendedAction: safeGuest
        ? `החזר את ${safeGuest.name} לרשימת הממתינים ושבץ אותו לשולחן עם מקום פנוי`
        : "העבר אורחים ידנית לשולחן עם מקום פנוי",
      canApply:    !!safeGuest,
      applyAction: safeGuest ? {
        type:      "unassignGuest",
        guestId:   safeGuest.id,
        guestName: safeGuest.name,
        tableName: t.name,
      } : null,
    });
  });

  // ── 5. Underused tables (only when most guests are already seated) ────────
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
          id:                `underused_${t.id}`,
          type:              "underused",
          severity:          "info",
          explanation:       `${t.name} מנוצל בחלקו: ${used} מתוך ${t.capacity} מקומות (${Math.round(pct * 100)}%)`,
          recommendedAction: "שקול להעביר אורחים ממנו לשולחן אחר, או להוסיף אורחים מהממתינים",
          canApply:          false,
          applyAction:       null,
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
          id:                `split_${group}`,
          type:              "split_group",
          severity:          "warning",
          explanation:       `קבוצת "${group}" מפוצלת על ${tableSet.size} שולחנות שונים (${count} אורחים)`,
          recommendedAction: "שקול לאחד את הקבוצה לשולחן אחד גדול יותר",
          canApply:          false,
          applyAction:       null,
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

      const total       = tg.length;
      const maxSide     = Math.max(brideCount, groomCount);
      const minSide     = Math.min(brideCount, groomCount);
      const dominantPct = maxSide / total;

      if (dominantPct >= 0.8 && minSide >= 2) {
        imbalanceCount++;
        const dominant = brideCount > groomCount ? "כלה" : "חתן";
        const minority = brideCount > groomCount ? "חתן" : "כלה";
        suggestions.push({
          id:                `imbalance_${t.id}`,
          type:              "side_imbalance",
          severity:          "info",
          explanation:       `${t.name}: ${Math.round(dominantPct * 100)}% מצד ${dominant}, ${minSide} אורחים מצד ${minority}`,
          recommendedAction: `שקול לשבץ את ${minSide} אורחי צד ${minority} עם בני ביתם`,
          canApply:          false,
          applyAction:       null,
        });
      }
    });
  }

  // Sort: critical first, then warning, then info
  const order = { critical: 0, warning: 1, info: 2 };
  suggestions.sort((a, b) => order[a.severity] - order[b.severity]);

  return suggestions;
}
