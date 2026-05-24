// Rule-based smart seating suggestion engine.
// Pure functions — no side effects, no API calls, no seating mutations.
//
// Suggestion shape:
//   id                string              — stable deterministic key
//   type              string              — category identifier
//   severity          "critical"|"warning"|"info"
//   explanation       string              — headline: what the problem is
//   whyMatters        string              — why this affects the event experience
//   impact            string              — specific consequence or scope
//   recommendedAction string              — what to do about it
//   canApply          boolean             — true when a safe one-step fix exists
//   applyAction       object|null         — action descriptor for SeatingScreen
//
// applyAction shapes (when canApply = true):
//   { type: "unassignGuest", guestId, guestName, tableName }
//   { type: "moveGuest",     guestId, toTableId, guestName, fromTableName, toTableName }

// ── Quality score ─────────────────────────────────────────────────────────────

/**
 * Compute a 0–100 seating quality score from current event data.
 * Returns null when there is no meaningful data yet (no guests or no tables).
 *
 * Penalty model:
 *   "together" violation:              -15 per pair
 *   "apart"    violation:              -15 per pair
 *   "capacity" violation:              -10 per table
 *   unassigned guests (partial event): -3  per guest, capped at -20
 *   underused tables (<40%, cap ≥ 4):  -2  per table,  capped at -8
 *
 * @param {object[]} guests
 * @param {object[]} tables
 * @param {object[]} constraints  (unused directly — penalties via violations)
 * @param {object}   seating
 * @param {object[]} violations   pre-computed computeViolations() result
 * @returns {number|null}
 */
export function computeQualityScore(guests, tables, constraints, seating, violations) {
  if (!guests.length || !tables.length) return null;

  const assigned = guests.filter(g => seating[g.id]);
  if (assigned.length === 0) return null;

  let score = 100;

  // Violation penalties
  violations.forEach(v => {
    if (v.type === "together") score -= 15;
    else if (v.type === "apart") score -= 15;
    else if (v.type === "capacity") score -= 10;
  });

  // Unassigned penalty (only when the event has at least some seated guests)
  const unassigned = guests.filter(g => !seating[g.id]);
  if (unassigned.length > 0) {
    score -= Math.min(20, unassigned.length * 3);
  }

  // Underused table penalty
  let underPenalty = 0;
  tables.forEach(t => {
    const used = guests
      .filter(g => seating[g.id] === t.id)
      .reduce((s, g) => s + (g.count || 1), 0);
    const pct = t.capacity > 0 ? used / t.capacity : 0;
    if (used > 0 && pct < 0.4 && t.capacity >= 4) underPenalty += 2;
  });
  score -= Math.min(8, underPenalty);

  return Math.max(0, Math.round(score));
}

// ── Suggestion generator ──────────────────────────────────────────────────────

/**
 * Generate smart seating suggestions from current event data.
 * Returns an array sorted critical → warning → info.
 *
 * @param {object[]} guests
 * @param {object[]} tables
 * @param {object[]} constraints
 * @param {object}   seating        { [guestId]: tableId }
 * @param {number|null} [qualityScore]  pass the output of computeQualityScore() to
 *                                      include a quality-score summary suggestion
 * @returns {object[]}
 */
export function generateSuggestions(guests, tables, constraints, seating, qualityScore = null) {
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
      explanation:       `${unassigned.length} מתוך ${guests.length} אורחים עדיין לא קיבלו שולחן`,
      whyMatters:        "אורחים ללא מקום ישיבה עלולים להגיע לאירוע ולמצוא עצמם עומדים",
      impact:            `${seats} מקומות לא משובצים`,
      recommendedAction: 'לחץ "חשב הושבה" לשיבוץ אוטומטי, או שבץ כל אחד ידנית מהרשימה',
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
    const remaining = (tableMap[ta]?.capacity || 0) - tableSeats(ta);
    const canMove   = remaining >= (gb.count || 1);
    suggestions.push({
      id:                `together_${ga.id}_${gb.id}`,
      type:              "together_violated",
      severity:          "critical",
      explanation:       `${ga.name} ו${gb.name} שובצו לשולחנות שונים בניגוד לאילוץ "יחד"`,
      whyMatters:        "ייתכן שמדובר בבני זוג, הורה וילד, או אורחים שחשוב להם לשבת יחד — כדאי לכבד בקשה זו",
      impact:            `${tableMap[ta]?.name || "?"} ו${tableMap[tb]?.name || "?"} — שני שולחנות נפרדים`,
      recommendedAction: canMove
        ? `העבר את ${gb.name} ל${tableMap[ta]?.name || "שולחן של " + ga.name}`
        : 'העבר אחד מהם לשולחן השני, או הפעל "חשב מחדש"',
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
      explanation:       `${togetherViol.length} זוגות אורחים שובצו בנפרד בניגוד לאילוצי "יחד"`,
      whyMatters:        "לכל אחד מהזוגות הוגדר ידנית שחשוב לו לשבת עם מישהו מסוים — בקשות אלו חשוב לכבד",
      impact:            `${togetherViol.length} אילוצים מופרים בסידור הנוכחי`,
      recommendedAction: 'הפעל "חשב מחדש" לתיקון אוטומטי של כל האילוצים',
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
    suggestions.push({
      id:                `apart_${ga.id}_${gb.id}`,
      type:              "apart_violated",
      severity:          "critical",
      explanation:       `${ga.name} ו${gb.name} יושבים יחד בניגוד לאילוץ "בנפרד"`,
      whyMatters:        "הוגדר שהם לא יכולים לשבת יחד — ישיבה משותפת עלולה לגרום לאי-נוחות או מתח",
      impact:            `שניהם שובצו ל${tableMap[ta]?.name || "אותו שולחן"}`,
      recommendedAction: `החזר את ${gb.name} לרשימת הממתינים ושבצו לשולחן אחר`,
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
      explanation:       `${apartViol.length} זוגות עם אילוץ "בנפרד" שובצו לאותו שולחן`,
      whyMatters:        "כל אחד מהזוגות הוגדר ידנית כ'לא יכולים לשבת יחד' — ישיבה משותפת עלולה לגרום לאי-נוחות",
      impact:            `${apartViol.length} אילוצים מופרים בסידור הנוכחי`,
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
    const excess = used - t.capacity;

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
      explanation:       `${t.name} חורג מהקיבולת — ${used} מושבים על ${t.capacity} מקומות`,
      whyMatters:        "שולחן עמוס מדי פוגע בנוחות האורחים ועלול לגרום לבעיות עם סדרני האולם",
      impact:            `חריגה של ${excess} ${excess === 1 ? "מושב" : "מושבים"}`,
      recommendedAction: safeGuest
        ? `החזר את ${safeGuest.name} לרשימת הממתינים ושבצו לשולחן עם מקום פנוי`
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

  // ── 5. Underused tables ───────────────────────────────────────────────────
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
          explanation:       `${t.name} מאוכלס בחלקו — ${used} מתוך ${t.capacity} מקומות (${Math.round(pct * 100)}%)`,
          whyMatters:        "ניתן לנצל את המקומות הפנויים לאורחים הממתינים לשיבוץ",
          impact:            `${t.capacity - used} ${t.capacity - used === 1 ? "מקום פנוי" : "מקומות פנויים"} בשולחן`,
          recommendedAction: "העבר אורחים מהממתינים לשולחן זה, או פזר חלק ממנו לשולחנות אחרים",
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
          explanation:       `קבוצת "${group}" מפוזרת על ${tableSet.size} שולחנות שונים`,
          whyMatters:        "אנשים מאותה קבוצה בדרך כלל מכירים זה את זה ויהנו מישיבה משותפת",
          impact:            `${count} אורחים מאותה קבוצה מפוצלים`,
          recommendedAction: "שקול לאחד חלק מהקבוצה לשולחן גדול יותר",
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
          explanation:       `${t.name}: ${Math.round(dominantPct * 100)}% מצד ${dominant}`,
          whyMatters:        `${minSide} אורחים מצד ${minority} עלולים להרגיש "חיצוניים" בשולחן זה`,
          impact:            `חוסר איזון בין ${dominant} ל${minority} בשולחן אחד`,
          recommendedAction: `שקול לשבץ את ${minSide} אורחי צד ${minority} עם בני ביתם בשולחן אחר`,
          canApply:          false,
          applyAction:       null,
        });
      }
    });
  }

  // ── 8. Quality score summary (only when score is provided and below 80) ───
  if (qualityScore !== null && qualityScore < 80 && assigned.length > 0) {
    const severity = qualityScore < 60 ? "warning" : "info";
    const issueCount = suggestions.length;
    suggestions.push({
      id:                "quality_score",
      type:              "quality_score",
      severity,
      explanation:       `ציון איכות ההושבה: ${qualityScore}/100`,
      whyMatters:        qualityScore < 60
        ? `הסידור הנוכחי מכיל כמה בעיות שמשפיעות על חוויית האורחים`
        : `הסידור סביר — ${issueCount > 0 ? issueCount + " נושאים קטנים ניתן לשפר" : "ניתן לשפר עוד"}`,
      impact:            qualityScore < 60
        ? "טיפול בבעיות הקריטיות ישפר משמעותית את חוויית האורחים"
        : "שיפורים קטנים יעלו את הציון ל-80 ומעלה",
      recommendedAction: 'טפל בבעיות הקריטיות תחילה, לאחר מכן הפעל "חשב מחדש"',
      canApply:          false,
      applyAction:       null,
    });
  }

  // Sort: critical → warning → info
  const order = { critical: 0, warning: 1, info: 2 };
  suggestions.sort((a, b) => order[a.severity] - order[b.severity]);

  return suggestions;
}
