import { seatingTotals, guestSeatNames } from "./eventHelpers.js";

// ── Arrival is per-person, not per-row ────────────────────────────────────────
//
// A guest ROW is a GROUP: `count` is how many physical people it carries and
// `companions` holds their names. `arrived` was one boolean on that row, so
// marking the aunt marked her husband and her three children with her — and at
// a real event the children turned up forty minutes later, or not at all.
//
// The canonical field is `arrivedSeats: number[]` — the seat indices of this
// row that are physically in the room. Index i lines up with
// `guestSeatNames(g)[i]`, which is the same list the place cards are printed
// from, so "the card that says רון" and "the chip that says רון" are the same
// seat.
//
// Legacy `arrived: true` means EVERYONE, which is what it always meant. It is
// still written on every change (`arrived = someone in this row arrived`) so
// the six other files that read it — the Excel export, the WhatsApp
// "thank you" audience, the seating screen's counters — keep working untouched.
// ─────────────────────────────────────────────────────────────────────────────

/** Physical seats a row carries. Mirrors seatingTotals()/guestSeats() exactly. */
export function seatsOf(g) {
  return Math.max(1, g?.count || 1);
}

/**
 * Coerce one value to a seat index, or null.
 *
 * Written as an explicit type check rather than `Number(v)`, because
 * `Number(null)`, `Number("")` and `Number(false)` are all **0** — so a junk
 * entry in the array silently marked seat 0, which is the person the row is
 * named after. Caught by the bounding test, not by reading the code.
 */
export function toSeatIndex(v) {
  const n = (typeof v === "number") ? v
    : (typeof v === "string" && /^\d{1,3}$/.test(v.trim())) ? Number(v)
      : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * The arrived seat indices of one row, normalised: deduped, sorted, and
 * clamped to the row's current seat count (a row whose count was lowered after
 * check-in must not report more arrivals than it has seats).
 *
 * @returns {number[]}
 */
export function arrivedSeatsOf(g) {
  const n = seatsOf(g);
  if (Array.isArray(g?.arrivedSeats)) {
    const set = new Set();
    for (const raw of g.arrivedSeats) {
      const i = toSeatIndex(raw);
      if (i !== null && i < n) set.add(i);
    }
    return [...set].sort((a, b) => a - b);
  }
  if (g?.arrived) return Array.from({ length: n }, (_, i) => i);
  return [];
}

/** How many people from this row are in the room. */
export function arrivedCountOf(g) {
  return arrivedSeatsOf(g).length;
}

export function isFullyArrived(g) {
  return arrivedCountOf(g) === seatsOf(g);
}

/**
 * Write an arrival set onto a row.
 *
 * `arrived` is kept as a truthful mirror — true when ANY seat arrived. That is
 * the reading every existing consumer wants: the export ticks the row, the
 * thank-you message goes to a family that came, and the seating screen's row
 * counter still counts rows.
 */
export function withArrivedSeats(g, seats) {
  const n = seatsOf(g);
  const clean = [...new Set(
    (seats || [])
      .map(toSeatIndex)
      .filter(i => i !== null && i < n),
  )].sort((a, b) => a - b);
  return { ...g, arrivedSeats: clean, arrived: clean.length > 0 };
}

/** One tap at the door: everybody in this row is here (or nobody is). */
export function setRowArrived(g, on) {
  return withArrivedSeats(g, on ? Array.from({ length: seatsOf(g) }, (_, i) => i) : []);
}

/** Toggle one named person. */
export function toggleSeat(g, index) {
  const cur = new Set(arrivedSeatsOf(g));
  if (cur.has(index)) cur.delete(index); else cur.add(index);
  return withArrivedSeats(g, [...cur]);
}

/**
 * Set a head-count for a row, KEEPING whoever is already marked.
 *
 * It used to discard the current seats and refill 0..n-1, and the stepper is
 * rendered next to the named chips for every row of more than one — so ticking
 * נועה (seat 4) and then pressing "+" produced [0,1]: נועה, who is standing in
 * the room, marked absent, and two people who are not there marked present. The
 * count was right and the identities were wrong, and the identities are the
 * whole point — the chips and the printed place cards are the same list.
 *
 * Growing adds the lowest free seats (seat 0, the person the row is named
 * after, first). Shrinking removes the highest-numbered ones, which is the only
 * order available without tracking when each was tapped.
 */
export function setArrivedCount(g, n) {
  const total = seatsOf(g);
  const want  = Math.max(0, Math.min(total, Math.round(Number(n) || 0)));
  const cur   = [...new Set(arrivedSeatsOf(g))]
    .filter(i => Number.isInteger(i) && i >= 0 && i < total)
    .sort((a, b) => a - b);
  if (want <= cur.length) return withArrivedSeats(g, cur.slice(0, want));
  const next = cur.slice();
  const held = new Set(next);
  for (let i = 0; i < total && next.length < want; i++) if (!held.has(i)) next.push(i);
  return withArrivedSeats(g, next.sort((a, b) => a - b));
}

/** The names behind the seats, so a chip can say "מיה" and not "מקום 3". */
export function seatNamesOf(g) {
  return guestSeatNames(g);
}

/**
 * Short per-seat labels for the chips at the door.
 *
 * guestSeatNames() suffixes every companion with the row's name — "יעל (דודה
 * רחל)" — which is right on a printed place card sitting among four hundred
 * others, and wrong on a 90px chip read one-handed. Same seats, same order,
 * shorter labels.
 */
export function seatChipLabels(g) {
  const n     = seatsOf(g);
  const base  = (g?.name || "").trim() || "אורח";
  const comps = (Array.isArray(g?.companions) ? g.companions : [])
    .map(c => (c || "").trim()).filter(Boolean);
  return Array.from({ length: n }, (_, i) =>
    i === 0 ? base : (comps[i - 1] || `אורח ${i + 1}`),
  );
}

/**
 * Door counters, in SEATS.
 *
 * The old header read `nArrived/nActive` over guest ROWS and showed 0/6 at an
 * event with sixty people in the room. Denominator comes from seatingTotals()
 * so the door and the seating screen can never disagree about what "everyone"
 * means: declined guests are out of both sides.
 */
export function arrivalTotals(guests, seating) {
  const list   = Array.isArray(guests) ? guests : [];
  const active = list.filter(g => g && g.rsvp !== "declined");
  const totals = seatingTotals(list, seating);
  const arrivedSeats   = active.reduce((s, g) => s + arrivedCountOf(g), 0);
  const arrivedRecords = active.filter(g => arrivedCountOf(g) > 0).length;
  const partialRecords = active.filter(g => {
    const c = arrivedCountOf(g);
    return c > 0 && c < seatsOf(g);
  }).length;
  return {
    arrivedSeats,
    totalSeats:   totals.totalSeats,
    arrivedRecords,
    totalRecords: totals.totalRecords,
    partialRecords,
    pct: totals.totalSeats > 0
      ? Math.min(100, Math.round((arrivedSeats / totals.totalSeats) * 100))
      : 0,
  };
}

// ── Search ───────────────────────────────────────────────────────────────────

/** Trim, collapse whitespace, strip Hebrew niqqud, lowercase. */
export function norm(s) {
  return String(s || "")
    .replace(/[֑-ׇ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Does this row answer to the name the hostess was handed?
 *
 * The person standing at the door is very often a COMPANION — she is told
 * "מיה כהן", and מיה is the third name inside טל שוורץ's row. Matching only
 * `g.name` meant the row simply did not exist as far as the door was
 * concerned.
 *
 * @returns {null | { via: "name"|"companion"|"phone", label: string, seat: number }}
 *          `seat` is the seat index that matched, so the UI can mark exactly
 *          that person.
 */
export function matchGuest(g, query) {
  const q = norm(query);
  if (!q) return null;
  if (norm(g?.name).includes(q)) return { via: "name", label: g.name, seat: 0 };

  // Bounded by the row's seat count, and derived the same way guestSeatNames()
  // derives it — blanks skipped, then truncated. Iterating the raw array let a
  // row be surfaced through a companion who has no seat on it: a row of 2 with
  // three stored names answered a search for the third and then offered no chip
  // by that name, so "כולם הגיעו" on it marked the wrong family. Stored lists
  // can now legitimately be longer than the count (lowering the count no longer
  // deletes names), which makes bounding here required, not merely tidy.
  const comps = (Array.isArray(g?.companions) ? g.companions : [])
    .map(c => (c || "").trim())
    .filter(Boolean)
    .slice(0, Math.max(0, seatsOf(g) - 1));
  for (let i = 0; i < comps.length; i++) {
    if (norm(comps[i]).includes(q)) {
      // Companion i is seat i+1 — guestSeatNames() puts the row's own name
      // first and then the companions, in that order.
      return { via: "companion", label: comps[i], seat: i + 1 };
    }
  }

  const digits = q.replace(/\D/g, "");
  if (digits && g?.phone && String(g.phone).replace(/\D/g, "").includes(digits)) {
    return { via: "phone", label: g.name, seat: 0 };
  }
  return null;
}

/**
 * Rows that answer to `query`, each with the match that found it.
 *
 * Declined guests ARE returned, and sorted last. Someone who told the host they
 * were not coming and then walked in is a real thing that happens at every
 * event, and the greeter's job at that moment is to find them, not to be told
 * they do not exist. They stay out of `arrivalTotals` either way, so finding
 * them cannot push the door counter past 100%.
 */
export function searchGuests(guests, query) {
  const q = norm(query);
  if (!q) return [];
  const out = [];
  for (const g of guests || []) {
    if (!g) continue;
    const m = matchGuest(g, query);
    if (m) out.push({ guest: g, match: m, declined: g.rsvp === "declined" });
  }
  return out.sort((a, b) =>
    (a.declined ? 1 : 0) - (b.declined ? 1 : 0) ||
    (a.guest.name || "").localeCompare(b.guest.name || "", "he"),
  );
}

// ── Where can a walk-in actually sit? ─────────────────────────────────────────

/**
 * Free seats per table, right now.
 *
 * "מה קורה אם יש אורח שלא היה ברשימות והגיע?" — the answer used to require
 * opening a spreadsheet. Occupancy is counted in SEATS (a row of four takes
 * four chairs), and declined guests never hold a chair.
 *
 * @returns {Array<{table, capacity:number, taken:number, free:number}>}
 *          tables with room first, emptiest first.
 */
export function tableAvailability(tables, guests, seating) {
  const map    = seating || {};
  const active = (guests || []).filter(g => g && g.rsvp !== "declined");
  const taken  = {};
  for (const g of active) {
    const tid = map[g.id];
    if (tid) taken[tid] = (taken[tid] || 0) + seatsOf(g);
  }
  return (tables || [])
    .map(t => {
      const capacity = Math.max(0, t.capacity || 0);
      const used     = taken[t.id] || 0;
      return { table: t, capacity, taken: used, free: Math.max(0, capacity - used) };
    })
    .sort((a, b) => b.free - a.free);
}
