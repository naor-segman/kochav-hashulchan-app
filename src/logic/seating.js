// V1 seating algorithm and violation engine — copied verbatim from legacy/v1-seating-app.jsx

function buildClusters(guests, constraints) {
  const parent = {};
  const find = id => {
    if (parent[id] === undefined) parent[id] = id;
    if (parent[id] !== id) parent[id] = find(parent[id]);
    return parent[id];
  };
  const union = (a, b) => { parent[find(a)] = find(b); };
  constraints.filter(c => c && c.type === "together").forEach(c => union(c.guestA, c.guestB));
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
  constraints.filter(c => c && c.type === "apart").forEach(c => {
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

/**
 * @param {object} [positions] — `floorPlan.tablePositions`: { [tableId]: {x, y} }
 *   with x/y as fractions of the sketch (0-1). Optional, and the engine is
 *   unchanged without it.
 *
 *   With it, the room stops being an abstraction. A family too large for one
 *   table gets the NEAREST next table instead of whichever happened to be
 *   emptiest, so relatives end up at adjacent tables rather than at opposite
 *   ends of the hall — which is the difference between "we were split" and
 *   "we were split but we could still see each other". That is the whole point
 *   of asking someone to upload their venue sketch.
 */
function assignOnce(guests, tables, constraints, lockedSeating = {}, positions = null) {
  if (!guests.length || !tables.length) return lockedSeating;
  const guestMap = Object.fromEntries(guests.map(g => [g.id, g]));
  const apartSet = buildApartSet(constraints);

  // Distance between two tables on the sketch, or null when either is unplaced
  // (a half-placed map must not silently reorder anything).
  // All FOUR coordinates are checked, not just the two x's. Checking x alone
  // let a table with a good x and a junk y through, and `Math.hypot` on it
  // returns NaN — which compares false against everything, so that table
  // silently stopped competing instead of falling back to emptiest-first.
  const dist = (aId, bId) => {
    const a = positions?.[aId], b = positions?.[bId];
    if (!a || !b) return null;
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

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
  constraints.filter(c => c && c.type === "together").forEach(c => {
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
    // Fill the emptiest table first and take it to capacity before moving on —
    // that keeps the family dense (fewest tables) instead of one-per-table.
    //
    // Then, once the first table is chosen, the rest should spill to the table
    // NEXT TO IT. Without the sketch there is no such thing as "next to", so
    // the nearest-first rule only applies when both tables are placed; with no
    // positions this is exactly the old emptiest-first behaviour.
    const pool = [...tState];
    const used = new Set();
    let anchorId = null;

    while (remaining.length && used.size < pool.length) {
      const free = t => t.capacity - seatedCount(t, guestMap);
      const open = pool.filter(t => !used.has(t.id));

      const next = open.reduce((best, t) => {
        if (!best) return t;
        if (anchorId) {
          const dt = dist(anchorId, t.id), db = dist(anchorId, best.id);
          // A placed table always beats an unplaced one; between two placed
          // tables the nearer wins; otherwise fall through to emptiest-first.
          if (dt !== null && db === null) return t;
          if (dt === null && db !== null) return best;
          if (dt !== null && db !== null && dt !== db) return dt < db ? t : best;
        }
        return free(t) > free(best) ? t : best;
      }, null);

      used.add(next.id);
      const still = [];
      for (const id of remaining) {
        if (seatedCount(next, guestMap) + guestSeats(guestMap[id]) <= next.capacity
            && !apartConflict(apartSet, id, next.seated)) {
          next.seated.push(id);
          seating[id] = next.id;
        } else {
          still.push(id);
        }
      }
      // The anchor is the first table this family actually landed on.
      if (!anchorId && still.length !== remaining.length) anchorId = next.id;
      remaining = still;
    }
  };

  [...clusters].sort((a, b) => clusterSeats(b) - clusterSeats(a)).forEach(cluster => {
    if (cluster.every(id => seating[id])) return;
    if (!seatCluster(cluster)) seatClusterBestEffort(cluster);
  });

  // There used to be a final "seat whoever is left over individually" pass here.
  // It was dead code: a guest only reaches it after seatCluster failed AND
  // seatClusterBestEffort ran, and bestEffort already tries every table with
  // exactly the same two predicates (fits in the remaining capacity, no apart
  // conflict) — while tables only ever gain occupants afterwards, so those
  // predicates can never start passing later.
  //
  // Measured twice before removing it: an audit counted 49,015 candidates
  // examined and 0 guests ever seated across 5,000 events, and deleting the
  // whole block changed 0 of 4,327 outputs. Re-verified here from the other
  // direction over 4,000 random events — the number of events with a leftover
  // guest who still fitted somewhere, which is the block's own precondition,
  // was 0. It also carried a regression test that never entered it.
  return seating;
}

/**
 * Proximity is a preference, never a cost.
 *
 * Reading the sketch changes which table a spilled family lands on, and that
 * choice cascades: the tables it leaves behind are the tables every later
 * cluster has to fit into, and an `apart` constraint three clusters downstream
 * can turn a slightly different but equally valid spill into a guest with
 * nowhere to sit. Fuzzed over 5,000 random events, the position-aware pass
 * seated MORE people 105 times and FEWER people 67 times — worst case six
 * extra seats left standing. Net favourable is not good enough: nobody uploads
 * a venue sketch to have a cousin end up standing.
 *
 * The loss is not a local mistake in the spill choice, so it cannot be fixed
 * there. The candidate rule "prefer the nearest table that can still fit the
 * largest remaining row" was implemented and fuzzed over the same 5,000
 * events: 67 losses became 65, while the wins dropped from 105 to 100. It
 * moves the symptom, not the cause.
 *
 * So the guarantee is made where it can be kept: run the room-aware pass, and
 * if it seated fewer SEATS than the plain one would have, hand back the plain
 * one. Ties go to the room-aware pass, because there proximity really is free.
 * The second pass only runs when somebody is left over — an event with enough
 * chairs, which is most of them, pays nothing.
 */
export function autoAssign(guests, tables, constraints, lockedSeating = {}, positions = null) {
  const withPositions = assignOnce(guests, tables, constraints, lockedSeating, positions);

  // `ev.floorPlan.tablePositions` is `{}` for every event that has never been
  // near a sketch, and one placed table has nothing to be near — neither can
  // change the answer, so neither pays for a second pass.
  const placed = positions ? Object.keys(positions).length : 0;
  if (placed < 2) return withPositions;

  const seatsPlaced = seating =>
    guests.reduce((s, g) => s + (seating[g.id] ? guestSeats(g) : 0), 0);

  // Nobody standing — no plan can beat that, so do not compute one.
  if (guests.every(g => withPositions[g.id])) return withPositions;

  const withoutPositions = assignOnce(guests, tables, constraints, lockedSeating, null);
  return seatsPlaced(withPositions) >= seatsPlaced(withoutPositions)
    ? withPositions
    : withoutPositions;
}

export function computeViolations(guests, tables, constraints, seating) {
  const violations = [];
  const guestMap   = Object.fromEntries(guests.map(g => [g.id, g]));
  const tableMap   = Object.fromEntries(tables.map(t => [t.id, t]));

  constraints.forEach(c => {
    // normalizeEvent checks that `constraints` is an array, not that its
    // elements are objects. A single null entry threw here and took the whole
    // Seating screen down with it.
    if (!c || typeof c !== "object") return;
    const ga = guestMap[c.guestA];
    const gb = guestMap[c.guestB];
    if (!ga || !gb) return;
    const ta = seating[c.guestA];
    const tb = seating[c.guestB];

    if (c.type === "together") {
      // A violation is a CONFLICT: both seated, at different tables.
      //
      // A pair where one member is not seated yet used to be counted here and a
      // pair where NEITHER is seated was silent — so seating the first of the
      // two took the red count from 0 to 1 for doing the right thing, and the
      // quality score dropped 15 points with no suggestion to explain it.
      // Not-yet-seated is not a conflict; it is the unassigned problem, and
      // seatingAnalysis now raises a specific `together_pending` suggestion
      // naming the pair and where the seated one already sits.
      if (ta && tb && ta !== tb)
        violations.push({ type:"together",
          text: ga.name + " ו" + gb.name + " צריכים לשבת יחד, אך שובצו לשולחנות שונים (" + (tableMap[ta]?.name || "?") + " ו" + (tableMap[tb]?.name || "?") + ")",
          tableA: tableMap[ta]?.name, tableB: tableMap[tb]?.name });
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
