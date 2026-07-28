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
  // A guest can be bound to more than one locked guest, and those locked guests
  // can sit at different tables. This map used to hold a single table per
  // guest, so the LAST constraint in the list silently won — regardless of
  // whether that table had room. With a parent locked to a roomy table and
  // another to a nearly full one, the child was pinned to the full parent,
  // their own siblings could no longer join them, and the engine split the
  // family: one child with one parent, three with the other. Two violations
  // where the host's own locks only made one unavoidable.
  const lockedTogetherMap = {};
  constraints.filter(c => c.type === "together").forEach(c => {
    const add = (unlockedId, lockedId) => {
      const table = lockedSeating[lockedId];
      if (!table) return;
      (lockedTogetherMap[unlockedId] ||= []).push(table);
    };
    if (lockedIds.has(c.guestA) && !lockedIds.has(c.guestB))      add(c.guestB, c.guestA);
    else if (lockedIds.has(c.guestB) && !lockedIds.has(c.guestA)) add(c.guestA, c.guestB);
  });
  Object.entries(lockedTogetherMap).forEach(([unlockedId, tableIds]) => {
    if (seating[unlockedId]) return;
    const g = guestMap[unlockedId];
    if (!g) return;
    // Whichever table is chosen, any other claim on this guest is broken — that
    // contradiction is the host's, not ours. Prefer the one with the most room,
    // because the rest of this guest's cluster has to follow them there.
    const candidates = [...new Set(tableIds)]
      .map(id => tState.find(t => t.id === id))
      .filter(Boolean)
      .sort((a, b) =>
        (b.capacity - seatedCount(b, guestMap)) - (a.capacity - seatedCount(a, guestMap)));
    for (const t of candidates) {
      if (seatedCount(t, guestMap) + guestSeats(g) > t.capacity) continue;
      if (apartConflict(apartSet, unlockedId, t.seated)) continue;
      t.seated.push(unlockedId);
      seating[unlockedId] = t.id;
      break;
    }
  });

  const seatCluster = (ids) => {
    // Some members may already be placed — a locked guest, or one pre-assigned
    // above because they share a "together" with a locked guest. Seating those
    // again both tore them off the table they were pinned to and pushed their
    // id into `seated` twice, so the table read as full while real chairs were
    // empty and a live guest was left standing.
    const pending = ids.filter(id => !seating[id]);
    if (!pending.length) return true;
    const pinned = ids.filter(id => seating[id]);

    // A pinned member fixes the whole cluster's destination: "together" means
    // the rest join THEM, not that everyone relocates.
    //
    // Members can be pinned to DIFFERENT tables — the host locked two people
    // who are also bound together, which is a contradiction the engine may not
    // resolve, because it is not allowed to move either of them. It used to
    // take seating[pinned[0]] and give up if that table was full, which handed
    // the rest of the family to the individual fallback and split them: with a
    // parent locked to a roomy table and another to a full one, one child went
    // to the full parent and three to the roomy one — a second violation the
    // engine invented on top of the one the host created.
    //
    // So every pinned table is a candidate, best first: where most of the
    // cluster already sits, then whichever has the most room. With a single
    // pinned table — the ordinary case — this is exactly the old behaviour.
    const pinnedTables = [...new Set(pinned.map(id => seating[id]))];
    const candidates = pinnedTables.length
      ? tState
          .filter(t => pinnedTables.includes(t.id))
          .sort((a, b) => {
            const here = t => t.seated.filter(id => ids.includes(id)).length;
            if (here(a) !== here(b)) return here(b) - here(a);
            return (b.capacity - seatedCount(b, guestMap)) - (a.capacity - seatedCount(a, guestMap));
          })
      : [...tState].sort((a, b) =>
          affinityScore(guestMap[pending[0]], b.seated, guestMap) -
          affinityScore(guestMap[pending[0]], a.seated, guestMap)
        );

    for (const t of candidates) {
      const used = seatedCount(t, guestMap);
      if (used + clusterSeats(pending) > t.capacity) continue;
      let ok = true;
      const combined = [...t.seated];
      for (const id of pending) {
        if (apartConflict(apartSet, id, combined)) { ok = false; break; }
        combined.push(id);
      }
      if (!ok) continue;
      pending.forEach(id => { t.seated.push(id); seating[id] = t.id; });
      return true;
    }
    return false;
  };

  // A "together" cluster bigger than any single table physically can't all sit
  // together. Rather than leave it unseated (the individual fallback below would
  // then scatter its members across many tables), pack it into the FEWEST tables
  // possible so it stays as grouped as it can — a minimal, not maximal, violation.
  const seatClusterBestEffort = (ids) => {
    let remaining = ids.filter(id => !seating[id]);
    // Fill the emptiest tables first, each to capacity, before moving on — keeps
    // the group dense (fewest tables) instead of one-per-table spread.
    const byFree = [...tState].sort((a, b) =>
      (b.capacity - seatedCount(b, guestMap)) - (a.capacity - seatedCount(a, guestMap))
    );
    for (const t of byFree) {
      if (!remaining.length) break;
      const still = [];
      for (const id of remaining) {
        if (seatedCount(t, guestMap) + guestSeats(guestMap[id]) <= t.capacity
            && !apartConflict(apartSet, id, t.seated)) {
          t.seated.push(id);
          seating[id] = t.id;
        } else {
          still.push(id);
        }
      }
      remaining = still;
    }
  };

  [...clusters].sort((a, b) => clusterSeats(b) - clusterSeats(a)).forEach(cluster => {
    if (cluster.every(id => seating[id])) return;
    if (!seatCluster(cluster)) seatClusterBestEffort(cluster);
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
