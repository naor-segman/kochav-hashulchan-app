// V1 seating algorithm and violation engine — copied verbatim from legacy/v1-seating-app.jsx

function buildClusters(guests, constraints) {
  const parent = {};
  const find = id => {
    if (parent[id] === undefined) parent[id] = id;
    if (parent[id] !== id) parent[id] = find(parent[id]);
    return parent[id];
  };
  const union = (a, b) => { parent[find(a)] = find(b); };
  constraints.filter(c => c.type === "together").forEach(c => union(c.guestA, c.guestB));
  const clusterMap = {};
  guests.forEach(g => {
    const root = find(g.id);
    if (!clusterMap[root]) clusterMap[root] = [];
    clusterMap[root].push(g.id);
  });
  return Object.values(clusterMap);
}

function buildApartSet(constraints) {
  const s = new Set();
  constraints.filter(c => c.type === "apart").forEach(c => {
    s.add([c.guestA, c.guestB].sort().join("___"));
  });
  return s;
}

function apartConflict(apartSet, guestId, tableGuestIds) {
  return tableGuestIds.some(existing =>
    apartSet.has([guestId, existing].sort().join("___"))
  );
}

function affinityScore(guest, tableGuestIds, guestMap) {
  let score = 0;
  tableGuestIds.forEach(id => {
    const other = guestMap[id];
    if (!other) return;
    if (other.side === guest.side && other.group === guest.group) score += 3;
    else if (other.side === guest.side) score += 1;
  });
  return score;
}

function guestSeats(g) { return g.count || 1; }

function seatedCount(tState_entry, guestMap) {
  return tState_entry.seated.reduce((s, id) => s + guestSeats(guestMap[id] || {}), 0);
}

export function autoAssign(guests, tables, constraints, lockedSeating = {}) {
  if (!guests.length || !tables.length) return lockedSeating;
  const guestMap = Object.fromEntries(guests.map(g => [g.id, g]));
  const apartSet = buildApartSet(constraints);

  // Pre-populate table state with locked guests so capacity is respected
  const lockedIds = new Set(Object.keys(lockedSeating).filter(id => lockedSeating[id]));
  const tState    = tables.map(t => ({ id:t.id, capacity:t.capacity, seated:[] }));
  guests.forEach(g => {
    if (lockedIds.has(g.id)) {
      const t = tState.find(t => t.id === lockedSeating[g.id]);
      if (t) t.seated.push(g.id);
    }
  });

  // Only cluster non-locked guests
  const unlockedGuests = guests.filter(g => !lockedIds.has(g.id));
  const clusters = buildClusters(unlockedGuests, constraints);
  const seating  = { ...lockedSeating };

  const clusterSeats = ids => ids.reduce((s, id) => s + guestSeats(guestMap[id] || {}), 0);

  // Pre-assign unlocked guests that have a "together" constraint with a locked guest.
  // buildClusters only receives unlockedGuests, so locked-side together constraints
  // are silently ignored otherwise — the unlocked guest would be placed by affinity alone.
  const lockedTogetherMap = {};
  constraints.filter(c => c.type === "together").forEach(c => {
    if (lockedIds.has(c.guestA) && !lockedIds.has(c.guestB))
      lockedTogetherMap[c.guestB] = lockedSeating[c.guestA];
    else if (lockedIds.has(c.guestB) && !lockedIds.has(c.guestA))
      lockedTogetherMap[c.guestA] = lockedSeating[c.guestB];
  });
  Object.entries(lockedTogetherMap).forEach(([unlockedId, tableId]) => {
    if (seating[unlockedId] || !tableId) return;
    const t = tState.find(t => t.id === tableId);
    if (!t) return;
    const g = guestMap[unlockedId];
    if (!g) return;
    if (seatedCount(t, guestMap) + guestSeats(g) > t.capacity) return;
    if (apartConflict(apartSet, unlockedId, t.seated)) return;
    t.seated.push(unlockedId);
    seating[unlockedId] = tableId;
  });

  const seatCluster = (ids) => {
    const sorted = [...tState].sort((a, b) =>
      affinityScore(guestMap[ids[0]], b.seated, guestMap) -
      affinityScore(guestMap[ids[0]], a.seated, guestMap)
    );
    for (const t of sorted) {
      const used = seatedCount(t, guestMap);
      if (used + clusterSeats(ids) > t.capacity) continue;
      let ok = true;
      const combined = [...t.seated];
      for (const id of ids) {
        if (apartConflict(apartSet, id, combined)) { ok = false; break; }
        combined.push(id);
      }
      if (!ok) continue;
      ids.forEach(id => { t.seated.push(id); seating[id] = t.id; });
      return true;
    }
    return false;
  };

  [...clusters].sort((a, b) => clusterSeats(b) - clusterSeats(a)).forEach(cluster => {
    if (cluster.every(id => seating[id])) return;
    seatCluster(cluster);
  });

  const unseated = unlockedGuests.filter(g => !seating[g.id]);
  unseated.sort((a, b) => (a.side + a.group).localeCompare(b.side + b.group));
  unseated.forEach(g => {
    let best = null, bestScore = -Infinity;
    for (const t of tState) {
      const used = seatedCount(t, guestMap);
      if (used + guestSeats(g) > t.capacity) continue;
      if (apartConflict(apartSet, g.id, t.seated)) continue;
      const score = affinityScore(g, t.seated, guestMap);
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (best) { best.seated.push(g.id); seating[g.id] = best.id; }
  });

  return seating;
}

export function computeViolations(guests, tables, constraints, seating) {
  const violations = [];
  const guestMap   = Object.fromEntries(guests.map(g => [g.id, g]));
  const tableMap   = Object.fromEntries(tables.map(t => [t.id, t]));

  constraints.forEach(c => {
    const ga = guestMap[c.guestA];
    const gb = guestMap[c.guestB];
    if (!ga || !gb) return;
    const ta = seating[c.guestA];
    const tb = seating[c.guestB];

    if (c.type === "together") {
      if (ta && tb && ta !== tb)
        violations.push({ type:"together",
          text: ga.name + " ו" + gb.name + " צריכים לשבת יחד, אך שובצו לשולחנות שונים (" + (tableMap[ta]?.name || "?") + " ו" + (tableMap[tb]?.name || "?") + ")",
          tableA: tableMap[ta]?.name, tableB: tableMap[tb]?.name });
      if (ta && !tb)
        violations.push({ type:"together", text: ga.name + " ו" + gb.name + " צריכים לשבת יחד — " + gb.name + " עדיין לא שובץ" });
      if (!ta && tb)
        violations.push({ type:"together", text: ga.name + " ו" + gb.name + " צריכים לשבת יחד — " + ga.name + " עדיין לא שובץ" });
    }
    if (c.type === "apart") {
      if (ta && tb && ta === tb)
        violations.push({ type:"apart",
          text: ga.name + " ו" + gb.name + " לא יכולים לשבת יחד — שניהם שובצו ל" + (tableMap[ta]?.name || "אותו שולחן"),
          tableA: tableMap[ta]?.name });
    }
  });

  tables.forEach(t => {
    const seated = guests.filter(g => seating[g.id] === t.id);
    const count  = seated.reduce((s, g) => s + (g.count || 1), 0);
    if (count > t.capacity)
      violations.push({ type:"capacity",
        text: t.name + ": " + count + " מושבים על " + t.capacity + " מקומות (חריגה של " + (count - t.capacity) + ")" });
  });

  return violations;
}
