/**
 * Floor plan — driven in a real browser, read back out of localStorage.
 *
 * The claim under test is not "autoArrange() is written correctly" — the unit
 * tests cover the engine. It is "a host who uploads a sketch gets a map".
 * That claim spans a file input, a canvas, a patchEvent round-trip and the
 * seating engine, and the only honest way to check it is to click the button
 * and read what actually landed in storage.
 *
 *   node qa/floorplan.mjs        (needs `npm run dev -- --port 5188` running)
 */
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5188';

// 1×1 transparent PNG. The editor only needs `hasImage` to be true and an
// <img> that loads; what the pixels show is irrelevant to placement.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
p.on('console', m => {
  if (m.type() === 'error' && !/favicon|net::|Failed to load resource/i.test(m.text()))
    errs.push(m.text().slice(0, 160));
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

const nTables = 14;
const seed = (over = {}) => ({
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן', startTime: '19:00',
  guests: [
    { id: 'g1', name: 'טל שוורץ',  side: 'bride', group: 'משפחה', count: 4, rsvp: 'confirmed' },
    { id: 'g2', name: 'רון לוי',   side: 'bride', group: 'משפחה', count: 4, rsvp: 'confirmed' },
    { id: 'g3', name: 'שרה כהן',   side: 'bride', group: 'משפחה', count: 4, rsvp: 'confirmed' },
    { id: 'g4', name: 'דני מזרחי', side: 'bride', group: 'משפחה', count: 4, rsvp: 'confirmed' },
  ],
  constraints: [
    { id: 'c1', type: 'together', guestA: 'g1', guestB: 'g2' },
    { id: 'c2', type: 'together', guestA: 'g2', guestB: 'g3' },
    { id: 'c3', type: 'together', guestA: 'g3', guestB: 'g4' },
  ],
  // Capacities are deliberately uneven, so that "nearest" and "emptiest" pick
  // DIFFERENT tables. With every table the same size the two rules agree and a
  // green run would prove nothing. The family of 16 first fills the roomiest
  // table (t14, at the far end of the grid); the one guest who does not fit
  // then has a choice between the table NEXT TO t14 (8 free) and the emptiest
  // table in the hall (t1, 10 free, diagonally opposite).
  tables: Array.from({ length: nTables }, (_, i) => ({
    id: 't' + (i + 1), name: 'שולחן ' + (i + 1), type: 'regular', shape: 'round',
    capacity: i === 13 ? 12 : i < 2 ? 10 : 8,
  })),
  seating: {}, tasks: [], vendors: [],
  floorPlan: { image: PNG, tablePositions: {} },
  tokens: { rsvp: 'r1', album: 'al1', invite: 'i1', gift: 'gi1', hostess: 'h1', collab: 'c1' },
  cloudId: null, createdAt: Date.now(), updatedAt: Date.now(), ...over,
});

const load = async (ev) => {
  await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  await p.evaluate(e => localStorage.setItem(
    'kochav_hashulchan_v1', JSON.stringify({ events: [e], activeEventId: 'e1' })), ev);
};
const readEvent = () => p.evaluate(() =>
  JSON.parse(localStorage.getItem('kochav_hashulchan_v1')).events[0]);

const openFloorPlanTab = async () => {
  await p.goto(BASE + '/events/e1/tables', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  const tab = p.locator('button', { hasText: /מפת אולם|מפה/ }).first();
  if (!(await tab.count())) return false;
  await tab.click();
  await p.waitForTimeout(600);
  return true;
};

// ── 1. One click puts every table on the sketch ──────────────────────────────
console.log('\n── floor plan: arrange every table in one action ──');
await load(seed());
if (!(await openFloorPlanTab())) {
  check('floor-plan tab found', false);
} else {
  const before = (await readEvent()).floorPlan?.tablePositions ?? {};
  check('starts with an empty map (nothing placed by hand)', Object.keys(before).length === 0);

  const btn = p.locator('button', { hasText: /סדרו את השולחנות/ }).first();
  if (!(await btn.count())) {
    check('arrange button found', false);
  } else {
    await btn.click();
    await p.waitForTimeout(700);
    const ev  = await readEvent();
    const pos = ev.floorPlan?.tablePositions ?? {};
    const ids = Object.keys(pos);

    check('every table landed on the sketch', ids.length === nTables,
      `${ids.length}/${nTables}`);

    const inBounds = ids.every(id =>
      Number.isFinite(pos[id].x) && Number.isFinite(pos[id].y) &&
      pos[id].x >= 0.06 && pos[id].x <= 0.94 && pos[id].y >= 0.06 && pos[id].y <= 0.94);
    check('no table is off the image or on its edge', inBounds);

    // Two tables at the same point would look like one — the grid must separate.
    const seen = new Set(ids.map(id => `${pos[id].x.toFixed(3)},${pos[id].y.toFixed(3)}`));
    check('no two tables share a spot', seen.size === ids.length,
      `${seen.size} distinct of ${ids.length}`);

    // Hebrew reading order: table 1 is the RIGHT-most of the first row, i.e.
    // the largest x. Getting this backwards is the classic RTL grid bug.
    const t1 = pos.t1, t2 = pos.t2;
    check('table 1 sits to the RIGHT of table 2 (RTL order)', t1 && t2 && t1.x > t2.x,
      t1 && t2 ? `t1.x=${t1.x.toFixed(2)} t2.x=${t2.x.toFixed(2)}` : 'missing');

    // ── 2. A second click is a no-op, not a reshuffle ────────────────────────
    const snapshot = JSON.stringify(pos);
    await btn.click();
    await p.waitForTimeout(600);
    const again = (await readEvent()).floorPlan?.tablePositions ?? {};
    check('clicking again does not move tables already placed',
      JSON.stringify(again) === snapshot);

    // ── 3. The engine reads the map ──────────────────────────────────────────
    // 16 seats of one family, 10-seat tables: it must split. With the sketch in
    // hand the overflow belongs on a table ADJACENT to the first one, not on an
    // arbitrary one. "Adjacent" here means: nearer than the median table.
    await p.goto(BASE + '/events/e1/seating', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    const auto = p.locator('button', { hasText: /שבצו אוטומטית|חשבו|אוטומט/ }).first();
    if (!(await auto.count())) {
      check('auto-seat button found', false);
    } else {
      await auto.click();
      await p.waitForTimeout(900);
      const after = await readEvent();
      const used  = [...new Set(['g1', 'g2', 'g3', 'g4'].map(g => after.seating[g]).filter(Boolean))];
      check('the whole family was seated', ['g1','g2','g3','g4'].every(g => after.seating[g]));
      check('the family had to split across two tables', used.length === 2, used.join(', '));

      if (used.length === 2) {
        const P = after.floorPlan.tablePositions;
        const d = (a, bb) => Math.hypot(P[a].x - P[bb].x, P[a].y - P[bb].y);
        const seats  = tid => after.guests
          .filter(g => after.seating[g.id] === tid).reduce((s, g) => s + (g.count || 1), 0);
        // The anchor is the table that took most of the family.
        const anchor = used.reduce((a, t) => seats(t) > seats(a) ? t : a);
        const spill  = used.find(t => t !== anchor);
        const others = after.tables.map(t => t.id).filter(t => t !== anchor && P[t]);

        const nearest = others.reduce((a, t) => d(anchor, t) < d(anchor, a) ? t : a);
        check('the overflow went to the table NEXT TO the family',
          spill === nearest,
          `spill=${spill} (${d(anchor, spill).toFixed(2)}) nearest=${nearest} (${d(anchor, nearest).toFixed(2)})`);

        // The discriminator: the old rule would have sent them to the emptiest
        // table instead. If those two are the same table the fixture is broken,
        // not the engine — say so rather than reporting a meaningless pass.
        const emptiest = others.reduce((a, t) =>
          (after.tables.find(x => x.id === t).capacity - seats(t)) >
          (after.tables.find(x => x.id === a).capacity - seats(a)) ? t : a);
        if (emptiest === nearest) {
          check('FIXTURE: nearest and emptiest must differ for this to mean anything', false,
            `both are ${nearest}`);
        } else {
          check('and NOT to the emptiest table, which is where it used to go',
            spill !== emptiest, `emptiest=${emptiest} at ${d(anchor, emptiest).toFixed(2)}`);
        }
      }
    }
  }
}

check('no JS errors on the page', errs.length === 0, errs.slice(0, 3).join(' | '));

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await b.close();
process.exit(failed.length ? 1 : 0);
