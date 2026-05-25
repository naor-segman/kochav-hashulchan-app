// Rule-based smart seating suggestion engine — V2.
// Pure functions — no side effects, no API calls, no seating mutations.
//
// Suggestion shape (V2):
//   id                string
//   type              string            — category identifier
//   severity          "critical"|"warning"|"info"
//   section           "critical"|"fixes"|"opportunities"
//   explanation       string            — headline: what the issue is
//   whyMatters        string            — why this affects guest experience
//   impact            string            — specific scope / consequence
//   recommendedAction string            — what to do about it
//   canApply          boolean           — true when a safe one-step fix exists
//   applyAction       object|null       — action descriptor for SeatingScreen
//   score             number            — estimated quality-score improvement (0 = unknown)
//   confidence        "high"|"medium"|"low"
//   violationDelta    number            — estimated violation count change (negative = fewer)
//
// applyAction shapes:
//   { type: "unassignGuest", guestId, guestName, tableName }
//   { type: "moveGuest",     guestId, toTableId, guestName, fromTableName, toTableName }
//   { type: "swapGuests",    guestAId, guestAName, tableAId, tableAName,
//                            guestBId, guestBName, tableBId, tableBName }

// ── Quality score ─────────────────────────────────────────────────────────────

/**
 * Compute a 0–100 seating quality score from current event data.
 * Returns null when there is no meaningful data yet.
 *
 * Penalty model:
 *   "together" violation:              -15 per pair
 *   "apart"    violation:              -15 per pair
 *   "capacity" violation:              -10 per table
 *   unassigned guests (partial event): -3  per guest, capped at -20
 *   underused tables (<40%, cap ≥ 4):  -2  per table,  capped at -8
 */
export function computeQualityScore(guests, tables, constraints, seating, violations) {
  if (!guests.length || !tables.length) return null;

  const assigned = guests.filter(g => seating[g.id]);
  if (assigned.length === 0) return null;

  let score = 100;

  violations.forEach(v => {
    if (v.type === "together") score -= 15;
    else if (v.type === "apart") score -= 15;
    else if (v.type === "capacity") score -= 10;
  });

  const unassigned = guests.filter(g => !seating[g.id]);
  if (unassigned.length > 0) {
    score -= Math.min(20, unassigned.length * 3);
  }

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

// ── Private helpers ───────────────────────────────────────────────────────────

function buildApartPairs(constraints) {
  return new Set(
    constraints
      .filter(c => c.type === "apart")
      .map(c => [c.guestA, c.guestB].sort().join("___"))
  );
}

function swapViolatesApart(gA, tableAId, gB, tableBId, tableGuestsFn, apartPairs) {
  const tableBRest = tableGuestsFn(tableBId).filter(g => g.id !== gB.id);
  const tableARest = tableGuestsFn(tableAId).filter(g => g.id !== gA.id);
  for (const g of tableBRest) {
    if (apartPairs.has([gA.id, g.id].sort().join("___"))) return true;
  }
  for (const g of tableARest) {
    if (apartPairs.has([gB.id, g.id].sort().join("___"))) return true;
  }
  return false;
}

function moveViolatesApart(guestId, toTableId, tableGuestsFn, apartPairs) {
  const destGuests = tableGuestsFn(toTableId).filter(g => g.id !== guestId);
  for (const g of destGuests) {
    if (apartPairs.has([guestId, g.id].sort().join("___"))) return true;
  }
  return false;
}

// ── Suggestion generator ──────────────────────────────────────────────────────

/**
 * Generate smart seating suggestions from current event data.
 *
 * @param {object[]} guests
 * @param {object[]} tables
 * @param {object[]} constraints
 * @param {object}   seating          { [guestId]: tableId }
 * @param {number|null} qualityScore  output of computeQualityScore()
 * @param {object}   options
 * @param {string[]} options.lockedGuestIds  — IDs of guests that must not be moved by suggestions
 * @param {string[]} options.lockedTableIds  — IDs of tables that must not be moved into/out of by suggestions
 * @returns {object[]}  sorted by section (critical → fixes → opportunities), then severity
 */
export function generateSuggestions(
  guests, tables, constraints, seating, qualityScore = null,
  { lockedGuestIds = [], lockedTableIds = [], sideLabels = null } = {}
) {
  if (!guests.length || !tables.length) return [];

  const lockedGuests = new Set(lockedGuestIds);
  const lockedTables = new Set(lockedTableIds);

  const isGuestLocked = id => lockedGuests.has(id);
  const isTableLocked = id => lockedTables.has(id);

  const brideLabel = sideLabels?.bride ?? "צד כלה";
  const groomLabel = sideLabels?.groom ?? "צד חתן";

  const suggestions = [];
  const guestMap    = Object.fromEntries(guests.map(g => [g.id, g]));
  const tableMap    = Object.fromEntries(tables.map(t => [t.id, t]));

  const tableSeats  = tid => guests
    .filter(g => seating[g.id] === tid)
    .reduce((s, g) => s + (g.count || 1), 0);

  const tableGuests = tid => guests.filter(g => seating[g.id] === tid);

  const tableSpace  = tid => {
    const t = tableMap[tid];
    return t ? t.capacity - tableSeats(tid) : 0;
  };

  const assigned   = guests.filter(g =>  seating[g.id]);
  const unassigned = guests.filter(g => !seating[g.id]);

  const apartPairs = buildApartPairs(constraints);

  // ── 1. Unassigned guests ──────────────────────────────────────────────────
  if (unassigned.length > 0 && assigned.length > 0) {
    const pct   = unassigned.length / guests.length;
    const seats = unassigned.reduce((s, g) => s + (g.count || 1), 0);
    suggestions.push({
      id:                "unassigned",
      type:              "unassigned",
      severity:          pct > 0.2 ? "critical" : "warning",
      section:           pct > 0.2 ? "critical" : "fixes",
      explanation:       `${unassigned.length} מתוך ${guests.length} אורחים עדיין לא קיבלו שולחן`,
      whyMatters:        "אורחים ללא מקום ישיבה עלולים להגיע לאירוע ולמצוא עצמם עומדים",
      impact:            `${seats} מקומות לא משובצים`,
      recommendedAction: 'לחץ "חשב הושבה" לשיבוץ אוטומטי, או שבץ כל אחד ידנית מהרשימה',
      canApply:          false,
      applyAction:       null,
      score:             Math.min(20, unassigned.length * 3),
      confidence:        "high",
      violationDelta:    0,
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
    const remaining = tableSpace(ta);
    const canMove   = remaining >= (gb.count || 1) && !isGuestLocked(gb.id) && !isTableLocked(ta);
    suggestions.push({
      id:                `together_${ga.id}_${gb.id}`,
      type:              "together_violated",
      severity:          "critical",
      section:           "critical",
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
      score:          15,
      confidence:     "high",
      violationDelta: -1,
    });
  } else if (togetherViol.length > 1) {
    suggestions.push({
      id:                "together_multi",
      type:              "together_violated",
      severity:          "critical",
      section:           "critical",
      explanation:       `${togetherViol.length} זוגות אורחים שובצו בנפרד בניגוד לאילוצי "יחד"`,
      whyMatters:        "לכל אחד מהזוגות הוגדר ידנית שחשוב לו לשבת עם מישהו מסוים — בקשות אלו חשוב לכבד",
      impact:            `${togetherViol.length} אילוצים מופרים בסידור הנוכחי`,
      recommendedAction: 'הפעל "חשב מחדש" לתיקון אוטומטי של כל האילוצים',
      canApply:          false,
      applyAction:       null,
      score:             togetherViol.length * 15,
      confidence:        "high",
      violationDelta:    -togetherViol.length,
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
    const canUnassign = !isGuestLocked(gb.id);
    suggestions.push({
      id:                `apart_${ga.id}_${gb.id}`,
      type:              "apart_violated",
      severity:          "critical",
      section:           "critical",
      explanation:       `${ga.name} ו${gb.name} יושבים יחד בניגוד לאילוץ "בנפרד"`,
      whyMatters:        "הוגדר שהם לא יכולים לשבת יחד — ישיבה משותפת עלולה לגרום לאי-נוחות או מתח",
      impact:            `שניהם שובצו ל${tableMap[ta]?.name || "אותו שולחן"}`,
      recommendedAction: canUnassign
        ? `החזר את ${gb.name} לרשימת הממתינים ושבצו לשולחן אחר`
        : 'העבר אחד מהם ידנית לשולחן אחר',
      canApply:    canUnassign,
      applyAction: canUnassign ? {
        type:      "unassignGuest",
        guestId:   gb.id,
        guestName: gb.name,
        tableName: tableMap[ta]?.name || "?",
      } : null,
      score:          15,
      confidence:     "high",
      violationDelta: -1,
    });
  } else if (apartViol.length > 1) {
    suggestions.push({
      id:                "apart_multi",
      type:              "apart_violated",
      severity:          "critical",
      section:           "critical",
      explanation:       `${apartViol.length} זוגות עם אילוץ "בנפרד" שובצו לאותו שולחן`,
      whyMatters:        "כל אחד מהזוגות הוגדר ידנית כ'לא יכולים לשבת יחד' — ישיבה משותפת עלולה לגרום לאי-נוחות",
      impact:            `${apartViol.length} אילוצים מופרים בסידור הנוכחי`,
      recommendedAction: 'הפעל "חשב מחדש" לתיקון אוטומטי',
      canApply:          false,
      applyAction:       null,
      score:             apartViol.length * 15,
      confidence:        "high",
      violationDelta:    -apartViol.length,
    });
  }

  // ── 4. Overloaded tables ──────────────────────────────────────────────────
  tables.forEach(t => {
    const used = tableSeats(t.id);
    if (used <= t.capacity) return;

    const tg     = tableGuests(t.id);
    const excess = used - t.capacity;

    const anchoredIds = new Set();
    constraints.forEach(c => {
      if (c.type !== "together") return;
      if (seating[c.guestA] === t.id && seating[c.guestB] === t.id) {
        anchoredIds.add(c.guestA);
        anchoredIds.add(c.guestB);
      }
    });

    const safeGuest = tg.find(g => !anchoredIds.has(g.id) && !isGuestLocked(g.id));

    suggestions.push({
      id:                `overloaded_${t.id}`,
      type:              "overloaded",
      severity:          "critical",
      section:           "critical",
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
      score:          10,
      confidence:     "high",
      violationDelta: -1,
    });
  });

  // ── 5. Isolated guests ────────────────────────────────────────────────────
  // A guest is "isolated" when they are the only member of their group at their
  // table, while other group members sit elsewhere.
  if (assigned.length > 0) {
    const groupAtTable = {}; // group → { tableId: [guestIds] }
    assigned.forEach(g => {
      if (!g.group) return;
      const tid = seating[g.id];
      if (!groupAtTable[g.group]) groupAtTable[g.group] = {};
      if (!groupAtTable[g.group][tid]) groupAtTable[g.group][tid] = [];
      groupAtTable[g.group][tid].push(g.id);
    });

    let isolatedCount   = 0;
    const coveredGuests = new Set();

    assigned.forEach(g => {
      if (isolatedCount >= 3) return;
      if (!g.group || isGuestLocked(g.id) || coveredGuests.has(g.id)) return;

      const myTid          = seating[g.id];
      const groupTables    = groupAtTable[g.group] || {};
      const myGroupHere    = (groupTables[myTid] || []).length;
      if (myGroupHere > 1) return; // not isolated

      const totalGroupSize = Object.values(groupTables).reduce((s, ids) => s + ids.length, 0);
      if (totalGroupSize < 2) return; // sole member of their group, not meaningful

      // Best destination: table with the most group members
      const bestEntry = Object.entries(groupTables)
        .filter(([tid]) => tid !== myTid)
        .sort(([, a], [, b]) => b.length - a.length)[0];
      if (!bestEntry) return;

      const [bestTid, bestMembers] = bestEntry;
      const canMove = tableSpace(bestTid) >= (g.count || 1)
        && !isTableLocked(bestTid)
        && !moveViolatesApart(g.id, bestTid, tableGuests, apartPairs);

      isolatedCount++;
      coveredGuests.add(g.id);
      suggestions.push({
        id:                `isolated_${g.id}`,
        type:              "isolated_guest",
        severity:          "warning",
        section:           "fixes",
        explanation:       `${g.name} יושב לבד מ${g.group} ב${tableMap[myTid]?.name || "שולחן"}`,
        whyMatters:        `שאר קבוצת "${g.group}" יושבת בשולחן אחר — ייתכן ש${g.name} יהנה להיות עם מכריו`,
        impact:            `${bestMembers.length} מ${g.group} יושבים ב${tableMap[bestTid]?.name || "שולחן אחר"}`,
        recommendedAction: canMove
          ? `העבר את ${g.name} ל${tableMap[bestTid]?.name || "שולחן"} עם שאר ${g.group}`
          : `שקול לפנות מקום ב${tableMap[bestTid]?.name || "שולחן"} עבור ${g.name}`,
        canApply:    canMove,
        applyAction: canMove ? {
          type:          "moveGuest",
          guestId:       g.id,
          toTableId:     bestTid,
          guestName:     g.name,
          fromTableName: tableMap[myTid]?.name || "?",
          toTableName:   tableMap[bestTid]?.name || "?",
        } : null,
        score:          3,
        confidence:     canMove ? "medium" : "low",
        violationDelta: 0,
      });
    });
  }

  // ── 6. Underused tables ───────────────────────────────────────────────────
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
          section:           "opportunities",
          explanation:       `${t.name} מאוכלס בחלקו — ${used} מתוך ${t.capacity} מקומות (${Math.round(pct * 100)}%)`,
          whyMatters:        "ניתן לנצל את המקומות הפנויים לאורחים הממתינים לשיבוץ",
          impact:            `${t.capacity - used} ${t.capacity - used === 1 ? "מקום פנוי" : "מקומות פנויים"} בשולחן`,
          recommendedAction: "העבר אורחים מהממתינים לשולחן זה, או פזר חלק ממנו לשולחנות אחרים",
          canApply:          false,
          applyAction:       null,
          score:             2,
          confidence:        "medium",
          violationDelta:    0,
        });
      }
    });
  }

  // ── 7. Merge underfilled tables ───────────────────────────────────────────
  // Two tables that are both < 50% full and whose guests could fit together.
  if (assignedFraction >= 0.5 && assigned.length > 0) {
    const underfilled = tables.filter(t => {
      const used = tableSeats(t.id);
      const pct  = t.capacity > 0 ? used / t.capacity : 1;
      return used > 0 && pct < 0.5 && t.capacity >= 4;
    });

    let mergeCount = 0;
    outer: for (let i = 0; i < underfilled.length && mergeCount < 2; i++) {
      for (let j = i + 1; j < underfilled.length && mergeCount < 2; j++) {
        const tA   = underfilled[i];
        const tB   = underfilled[j];
        const sA   = tableSeats(tA.id);
        const sB   = tableSeats(tB.id);
        const cap  = Math.max(tA.capacity, tB.capacity);
        if (sA + sB > cap) continue;

        // Quick "apart" conflict check between the two sets of guests
        const idsA = tableGuests(tA.id).map(g => g.id);
        const idsB = tableGuests(tB.id).map(g => g.id);
        let conflict = false;
        for (const a of idsA) {
          for (const b of idsB) {
            if (apartPairs.has([a, b].sort().join("___"))) { conflict = true; break outer; }
          }
        }
        if (conflict) continue;

        const larger = tA.capacity >= tB.capacity ? tA : tB;
        const smaller = tA.capacity < tB.capacity ? tA : tB;
        mergeCount++;
        suggestions.push({
          id:                `merge_${tA.id}_${tB.id}`,
          type:              "merge_tables",
          severity:          "info",
          section:           "opportunities",
          explanation:       `ניתן לאחד את ${tA.name} (${sA}/${tA.capacity}) ו${tB.name} (${sB}/${tB.capacity})`,
          whyMatters:        "שני שולחנות חצי ריקים יוצרים תחושה של אירוע דליל — איחוד משפר את האווירה",
          impact:            `${sA + sB} אורחים יתאחדו ב${larger.name} (${larger.capacity} מקומות)`,
          recommendedAction: `פנה את ${smaller.name} והעבר את ${sB < sA ? sB : sA} אורחיו ל${larger.name}`,
          canApply:          false,
          applyAction:       null,
          score:             3,
          confidence:        "medium",
          violationDelta:    0,
        });
      }
    }
  }

  // ── 8. Split guest groups ─────────────────────────────────────────────────
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
      if (tableSet.size >= 3 && count >= 4) {
        splitCount++;
        suggestions.push({
          id:                `split_${group}`,
          type:              "split_group",
          severity:          "warning",
          section:           "opportunities",
          explanation:       `קבוצת "${group}" מפוזרת על ${tableSet.size} שולחנות שונים`,
          whyMatters:        "אנשים מאותה קבוצה בדרך כלל מכירים זה את זה ויהנו מישיבה משותפת",
          impact:            `${count} אורחים מאותה קבוצה מפוצלים`,
          recommendedAction: "שקול לאחד חלק מהקבוצה לשולחן גדול יותר",
          canApply:          false,
          applyAction:       null,
          score:             3,
          confidence:        "medium",
          violationDelta:    0,
        });
      }
    });
  }

  // ── 9. Group cohesion swap ────────────────────────────────────────────────
  // Swap two guests so each ends up at the table where their group is bigger.
  if (assigned.length >= 6) {
    const groupAtTable = {}; // group → { tableId: count }
    assigned.forEach(g => {
      if (!g.group) return;
      const tid = seating[g.id];
      if (!groupAtTable[g.group]) groupAtTable[g.group] = {};
      groupAtTable[g.group][tid] = (groupAtTable[g.group][tid] || 0) + 1;
    });

    let swapCount   = 0;
    const usedPairs = new Set();

    for (const gA of assigned) {
      if (swapCount >= 2) break;
      if (!gA.group || isGuestLocked(gA.id)) continue;
      const tidA       = seating[gA.id];
      const aAtA       = groupAtTable[gA.group]?.[tidA] || 0;

      // Find where most of gA's group sits (not at tidA)
      const bestForA = Object.entries(groupAtTable[gA.group] || {})
        .filter(([tid]) => tid !== tidA)
        .sort(([, a], [, b]) => b - a)[0];
      if (!bestForA || bestForA[1] <= aAtA) continue;

      const tidB = bestForA[0];
      if (isTableLocked(tidB)) continue;

      for (const gB of tableGuests(tidB)) {
        if (swapCount >= 2) break;
        if (!gB.group || gB.group === gA.group || isGuestLocked(gB.id)) continue;
        const pairKey = [gA.id, gB.id].sort().join("___");
        if (usedPairs.has(pairKey)) continue;

        const bAtB    = groupAtTable[gB.group]?.[tidB] || 0;
        const bestForB = Object.entries(groupAtTable[gB.group] || {})
          .filter(([tid]) => tid !== tidB)
          .sort(([, a], [, b]) => b - a)[0];
        if (!bestForB || bestForB[0] !== tidA || bestForB[1] <= bAtB) continue;

        // Capacity check (if counts differ)
        const cntA   = gA.count || 1;
        const cntB   = gB.count || 1;
        const spaceA = tableSpace(tidA) + cntA; // space after gA leaves
        const spaceB = tableSpace(tidB) + cntB; // space after gB leaves
        if (spaceA < cntB || spaceB < cntA) continue;

        if (swapViolatesApart(gA, tidA, gB, tidB, tableGuests, apartPairs)) continue;

        usedPairs.add(pairKey);
        swapCount++;
        suggestions.push({
          id:                `swap_group_${gA.id}_${gB.id}`,
          type:              "swap_guests",
          severity:          "info",
          section:           "fixes",
          explanation:       `החלף בין ${gA.name} (${tableMap[tidA]?.name}) ל${gB.name} (${tableMap[tidB]?.name}) לשיפור לכידות קבוצתית`,
          whyMatters:        `${gA.name} מ${gA.group} יהיה קרוב יותר לחבריו, ו${gB.name} מ${gB.group} ישב עם מכריו`,
          impact:            `שני האורחים יעברו לשולחן שבו יש יותר מחבריהם`,
          recommendedAction: `החלף בין ${gA.name} ל${gB.name}`,
          canApply:          true,
          applyAction:       {
            type:       "swapGuests",
            guestAId:   gA.id,
            guestAName: gA.name,
            tableAId:   tidA,
            tableAName: tableMap[tidA]?.name || "?",
            guestBId:   gB.id,
            guestBName: gB.name,
            tableBId:   tidB,
            tableBName: tableMap[tidB]?.name || "?",
          },
          score:          4,
          confidence:     "medium",
          violationDelta: 0,
        });
        break;
      }
    }
  }

  // ── 10. Side balance swap ─────────────────────────────────────────────────
  // Swap a bride guest from a bride-heavy table with a groom guest from a groom-heavy table.
  if (assigned.length >= 8) {
    const brideHeavy = [];
    const groomHeavy = [];

    tables.forEach(t => {
      const tg = tableGuests(t.id);
      if (tg.length < 4) return;
      const bc = tg.filter(g => g.side === "bride").length;
      const gc = tg.filter(g => g.side === "groom").length;
      if (!bc || !gc) return; // single-side table — not a balance issue
      const ratio = bc / tg.length;
      if (ratio >= 0.75) brideHeavy.push(t);
      else if (ratio <= 0.25) groomHeavy.push(t);
    });

    if (brideHeavy.length > 0 && groomHeavy.length > 0) {
      const tBride = brideHeavy[0];
      const tGroom = groomHeavy[0];

      if (!isTableLocked(tBride.id) && !isTableLocked(tGroom.id)) {
        const brideCandidates = tableGuests(tBride.id).filter(g => g.side === "bride" && !isGuestLocked(g.id));
        const groomCandidates = tableGuests(tGroom.id).filter(g => g.side === "groom" && !isGuestLocked(g.id));

        let foundPair = null;
        outer2: for (const gA of brideCandidates) {
          for (const gB of groomCandidates) {
            const cntA   = gA.count || 1;
            const cntB   = gB.count || 1;
            const spaceA = tableSpace(tBride.id) + cntA;
            const spaceB = tableSpace(tGroom.id) + cntB;
            if (spaceA < cntB || spaceB < cntA) continue;
            if (swapViolatesApart(gA, tBride.id, gB, tGroom.id, tableGuests, apartPairs)) continue;
            foundPair = { gA, gB };
            break outer2;
          }
        }

        if (foundPair) {
          const { gA, gB } = foundPair;
          suggestions.push({
            id:                `side_swap_${gA.id}_${gB.id}`,
            type:              "swap_guests",
            severity:          "info",
            section:           "fixes",
            explanation:       `החלף ${gA.name} מ${tBride.name} עם ${gB.name} מ${tGroom.name} לאיזון צדדים`,
            whyMatters:        `${tBride.name} מטה ל${brideLabel} ו${tGroom.name} מטה ל${groomLabel} — החלפה תאזן את האווירה`,
            impact:            `${tBride.name} ו${tGroom.name} יהיו מאוזנים יותר בין הצדדים`,
            recommendedAction: `החלף בין ${gA.name} (${brideLabel}) ל${gB.name} (${groomLabel})`,
            canApply:          true,
            applyAction:       {
              type:       "swapGuests",
              guestAId:   gA.id,
              guestAName: gA.name,
              tableAId:   tBride.id,
              tableAName: tBride.name,
              guestBId:   gB.id,
              guestBName: gB.name,
              tableBId:   tGroom.id,
              tableBName: tGroom.name,
            },
            score:          3,
            confidence:     "low",
            violationDelta: 0,
          });
        }
      }
    }
  }

  // ── 11. Side imbalance per table ──────────────────────────────────────────
  if (assigned.length > 0) {
    let imbalanceCount = 0;
    tables.forEach(t => {
      if (imbalanceCount >= 2) return;
      const tg = tableGuests(t.id);
      if (tg.length < 6) return;

      const bc = tg.filter(g => g.side === "bride").length;
      const gc = tg.filter(g => g.side === "groom").length;
      if (!bc || !gc) return;

      const dominantPct = Math.max(bc, gc) / tg.length;
      if (dominantPct < 0.8) return;

      const dominant = bc > gc ? "כלה" : "חתן";
      const minority = bc > gc ? "חתן" : "כלה";
      const minSide  = Math.min(bc, gc);
      imbalanceCount++;
      suggestions.push({
        id:                `imbalance_${t.id}`,
        type:              "side_imbalance",
        severity:          "info",
        section:           "opportunities",
        explanation:       `${t.name}: ${Math.round(dominantPct * 100)}% מצד ${dominant}`,
        whyMatters:        `${minSide} אורחים מצד ${minority} עלולים להרגיש "חיצוניים" בשולחן זה`,
        impact:            `חוסר איזון בין ${dominant} ל${minority} בשולחן אחד`,
        recommendedAction: `שקול לשבץ את ${minSide} אורחי צד ${minority} עם בני ביתם בשולחן אחר`,
        canApply:          false,
        applyAction:       null,
        score:             2,
        confidence:        "low",
        violationDelta:    0,
      });
    });
  }

  // ── 12. Quality score summary ─────────────────────────────────────────────
  if (qualityScore !== null && qualityScore < 80 && assigned.length > 0) {
    const criticalCount = suggestions.filter(s => s.section === "critical").length;
    suggestions.push({
      id:                "quality_score",
      type:              "quality_score",
      severity:          qualityScore < 60 ? "warning" : "info",
      section:           "opportunities",
      explanation:       `ציון איכות ההושבה: ${qualityScore}/100`,
      whyMatters:        qualityScore < 60
        ? "הסידור הנוכחי מכיל כמה בעיות שמשפיעות על חוויית האורחים"
        : `הסידור סביר — ${criticalCount > 0 ? criticalCount + " נושאים קריטיים לטיפול" : "שיפורים קטנים ניתן לבצע"}`,
      impact:            qualityScore < 60
        ? "טיפול בבעיות הקריטיות ישפר משמעותית את חוויית האורחים"
        : "שיפורים קטנים יעלו את הציון ל-80 ומעלה",
      recommendedAction: 'טפל בבעיות הקריטיות תחילה, לאחר מכן הפעל "חשב מחדש"',
      canApply:          false,
      applyAction:       null,
      score:             0,
      confidence:        "medium",
      violationDelta:    0,
    });
  }

  // Sort by section (critical → fixes → opportunities), then by severity within section
  const sectionOrder  = { critical: 0, fixes: 1, opportunities: 2 };
  const severityOrder = { critical: 0, warning: 1, info: 2 };

  suggestions.sort((a, b) => {
    const secDiff = (sectionOrder[a.section] ?? 1) - (sectionOrder[b.section] ?? 1);
    if (secDiff !== 0) return secDiff;
    return (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
  });

  return suggestions;
}
