/* Fixtures for the seating-screen work: one realistic event (~60 guest rows,
   14 tables) and one stress event (400 guest rows, 40 tables).
   Shape copied from qa/mobile.mjs so it survives normalizeEvent unchanged. */

const FIRST = ['טל', 'רון', 'שרה', 'דנה', 'יוסי', 'נועה', 'איתי', 'מיכל', 'עומר', 'ליאת',
  'אבי', 'רותם', 'גיא', 'הילה', 'אורי', 'שירה', 'עידו', 'מאיה', 'ניר', 'יעל'];
const LAST = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'שוורץ', 'אזולאי'];
const GROUPS = ['משפחה', 'חברים', 'עבודה', 'שכונה', 'צבא', 'לימודים'];

function makeGuests(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // Deterministic: the same fixture every run, so two measurements compare.
    const count = i % 9 === 0 ? 2 : 1;
    out.push({
      id: 'g' + (i + 1),
      name: FIRST[i % FIRST.length] + ' ' + LAST[(i * 7) % LAST.length] + ' ' + (i + 1),
      side: i % 2 === 0 ? 'bride' : 'groom',
      group: GROUPS[i % GROUPS.length],
      count,
      phone: '05' + String(10000000 + i * 137).slice(0, 8),
      rsvp: i % 17 === 0 ? 'declined' : i % 3 === 0 ? 'pending' : 'confirmed',
    });
  }
  return out;
}

const SHAPES = ['round', 'rect', 'square', 'oval'];

function makeTables(n, capacity) {
  return Array.from({ length: n }, (_, i) => ({
    id: 't' + (i + 1),
    name: 'שולחן ' + (i + 1),
    capacity,
    type: 'regular',
    shape: SHAPES[i % SHAPES.length],
  }));
}

/* Fill tables in order, respecting capacity, so the plan is a plausible one and
   every card has a body worth expanding. Declined guests are left unseated. */
function seat(guests, tables) {
  const seating = {};
  let ti = 0;
  let used = 0;
  for (const g of guests) {
    if (g.rsvp === 'declined') continue;
    const need = g.count || 1;
    while (ti < tables.length && used + need > tables[ti].capacity) { ti++; used = 0; }
    if (ti >= tables.length) break;
    seating[g.id] = tables[ti].id;
    used += need;
  }
  return seating;
}

function build({ id, name, guests, tables }) {
  return {
    id, name, type: 'חתונה', date: '2027-06-01',
    brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן', startTime: '19:00',
    guests, tables,
    seating: seat(guests, tables),
    constraints: [{ id: 'c1', type: 'together', guestA: 'g1', guestB: 'g2' }],
    tasks: [], vendors: [],
    tokens: { rsvp: 'r1', album: 'al1', invite: 'i1', gift: 'gi1', hostess: 'h1', collab: 'c1' },
    cloudId: null, createdAt: 1700000000000, updatedAt: 1700000000000,
  };
}

// ~60 rows over 14 tables — the size a real wedding actually is.
export const REALISTIC = build({
  id: 'e1', name: 'החתונה של דנה ויוסי',
  guests: makeGuests(60), tables: makeTables(14, 10),
});

// 400 rows over 40 tables — the size the audit measured at 200–600 ms.
// Capacity 10 leaves ~20 seats unplaced on purpose, so the waiting list is on
// the page too. A fixture where everything happens to fit hides half the screen.
export const STRESS = build({
  id: 'e1', name: 'אירוע ענק — 400 אורחים',
  guests: makeGuests(400), tables: makeTables(40, 10),
});

export const STORE_KEY = 'kochav_hashulchan_v1';
export const seedScript = (event) =>
  JSON.stringify({ events: [event], activeEventId: event.id });
