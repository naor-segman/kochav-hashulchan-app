/* Drives עמדת הכניסה in a real browser and reads the numbers back out of the
   DOM and out of localStorage. A screenshot review cannot see any of this:
   the whole point of the round is that ONE TAP used to mark FIVE PEOPLE.

   node qa/entrance.mjs            → run everything
   node qa/entrance.mjs 390        → at a given viewport width                */
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5188';
const W = Number(process.argv[2] || 390);

// ── Fixture: 40 rows, several parties of 3–5 with NAMED companions, 14 tables,
// most seated. The counter bug only shows up when count > 1 is common.
const FIRST = ['טל', 'רון', 'שרה', 'דנה', 'יוסי', 'מיה', 'איתי', 'נועה', 'עידו', 'ליאור',
  'אבי', 'רותי', 'גיל', 'ענת', 'עומר', 'שיר', 'ארז', 'הילה', 'יונתן', 'מאיה'];
const LAST = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אזולאי', 'שוורץ', 'friedman', 'דהן', 'אוחיון'];

const guests = [];
for (let i = 0; i < 40; i++) {
  const name = `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
  // every 3rd row is a party; every 6th also carries real companion names
  const count = i % 3 === 0 ? 3 + (i % 3) : i % 5 === 0 ? 5 : 1;
  const companions = (i % 3 === 0 && count > 1)
    ? Array.from({ length: count - 1 }, (_, k) => `${FIRST[(i + k + 7) % FIRST.length]} ${LAST[i % LAST.length]}`)
    : [];
  guests.push({
    id: `g${i}`, name, side: i % 2 ? 'bride' : 'groom',
    group: ['משפחה', 'חברים', 'עבודה'][i % 3],
    count, companions,
    phone: `05${(10000000 + i * 37).toString().slice(0, 8)}`,
    rsvp: i === 39 ? 'declined' : 'confirmed',
  });
}
const tables = Array.from({ length: 14 }, (_, i) => ({
  id: `t${i}`, name: `שולחן ${i + 1}`, capacity: 12,
  type: 'regular', shape: i % 3 === 0 ? 'rect' : 'round',
}));
const seating = {};
guests.slice(0, 34).forEach((g, i) => { seating[g.id] = `t${i % 12}`; });   // t12,t13 stay empty

const EVENT = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן',
  guests, tables, seating, constraints: [],
  tokens: { rsvp: 'r1', album: 'al1', invite: 'i1', gift: 'gi1', hostess: 'h1', collab: 'c1' },
  cloudId: null, createdAt: 1700000000000, updatedAt: 1700000000000,
};

const seatsOf = g => Math.max(1, g.count || 1);
const active  = guests.filter(g => g.rsvp !== 'declined');
const TOTAL_SEATS = active.reduce((s, g) => s + seatsOf(g), 0);
const TOTAL_ROWS  = active.length;

let fails = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`);
};
const note = (label, v) => console.log(`  ··    ${label}: ${JSON.stringify(v)}`);

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const jsErrors = [];
p.on('pageerror', e => jsErrors.push(String(e)));

await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
  JSON.stringify({ events: [e], activeEventId: 'e1' })), EVENT);

const readState = () => p.evaluate(() =>
  JSON.parse(localStorage.getItem('kochav_hashulchan_v1')).events[0]);

// The counter as the OLD per-row boolean model would have computed it, from the
// exact same stored state — so "before" is measured, not remembered.
const oldModelSeats = ev => ev.guests
  .filter(g => g.arrived && g.rsvp !== 'declined')
  .reduce((s, g) => s + Math.max(1, g.count || 1), 0);

console.log(`\n── fixture ──`);
note('rows (not declined)', TOTAL_ROWS);
note('SEATS (not declined)', TOTAL_SEATS);
note('parties with named companions', active.filter(g => g.companions.length).length);

// ═══ 1. The old row-based counter is GONE from the seating screen ══════════
// This check used to assert the opposite — it documented the "0/6" the owner
// reported, which came from SeatingScreen's own "מצב צ׳ק אין" panel where both
// sides of the fraction were ROWS. That panel and the day-search card have
// since been deleted (they were the second and third copies of the door), so
// the check now pins their absence: three surfaces for one job is what caused
// the confusion in the first place.
console.log(`\n── 1. the seating screen no longer carries a second door ──`);
await p.goto(BASE + '/events/e1/seating', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);
const oldDoors = await p.evaluate(() => [...document.querySelectorAll('button')]
  .map(x => x.textContent.trim())
  .filter(t => /^צ׳ק אין$/.test(t) || /^מסך כניסה$/.test(t)));
note('leftover check-in controls on the seating screen', JSON.stringify(oldDoors));
check('no "צ׳ק אין" / "מסך כניסה" buttons remain there', JSON.stringify(oldDoors), '[]');
const doorLink = await p.evaluate(() => !![...document.querySelectorAll('button')]
  .find(x => /עמדת כניסה/.test(x.textContent)));
check('one link to the real door instead', doorLink, true);

// ═══ 2. The unified entrance screen ════════════════════════════════════════
console.log(`\n── 2. עמדת כניסה — the counter ──`);
await p.goto(BASE + '/events/e1/checkin', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const counter = () => p.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find(x =>
    x.children.length && /^\d+מתוך \d+ אורחים/.test(x.textContent.replace(/\s+/g, ' ').trim()));
  const t = document.body.innerText.replace(/\s+/g, ' ');
  const m = t.match(/(\d+)\s*מתוך\s*(\d+)\s*אורחים/);
  return m ? { arrived: +m[1], total: +m[2] } : (el ? el.textContent : null);
});
check('denominator is SEATS', await counter(), { arrived: 0, total: TOTAL_SEATS });

// ═══ 3. Search finds a COMPANION ═══════════════════════════════════════════
console.log(`\n── 3. search by companion name ──`);
const party = active.find(g => g.companions.length >= 2);
const comp  = party.companions[1];              // seat index 2
note('party row', `${party.name} (count ${party.count})`);
note('searching for companion', comp);

await p.fill('input[type="search"]', comp);
await p.waitForTimeout(400);
const found = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('input[type="search"] ~ * , *')];
  const t = document.body.innerText.replace(/\s+/g, ' ');
  return { text: t, count: (t.match(/נמצא\/ה דרך/g) || []).length };
});
check('the row is found via the companion', found.text.includes(party.name), true);
check('and the UI says WHICH person matched', found.text.includes(`נמצא/ה דרך ${comp}`), true);

// ═══ 4. One tap ≠ five people ══════════════════════════════════════════════
console.log(`\n── 4. THE BUG: marking one person of a party of ${party.count} ──`);
await p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^\d+\/\d+$/.test(x.textContent.trim()));
  b?.click();
});
await p.waitForTimeout(300);
const chipClicked = await p.evaluate((label) => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === label);
  if (!b) return false;
  b.click();
  return true;
}, comp);
check('the companion chip exists and is tappable', chipClicked, true);
await p.waitForTimeout(600);

let st = await readState();
const row = st.guests.find(g => g.id === party.id);
check('exactly ONE seat is marked, and it is the companion\'s', row.arrivedSeats, [2]);
check('the legacy `arrived` mirror says "somebody from this row is here"', row.arrived, true);
check('AFTER  — counter moved by 1 person', await counter(), { arrived: 1, total: TOTAL_SEATS });
check(`BEFORE — the same state under the old per-row model would read`,
  oldModelSeats(st), party.count);
console.log(`         → one tap used to move the number by ${party.count}. It now moves it by 1.`);

// ═══ 5. One tap still marks the whole row ══════════════════════════════════
console.log(`\n── 5. …but one tap must STILL mark everyone (the common case) ──`);
await p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /כולם הגיעו/.test(x.textContent));
  b?.click();
});
await p.waitForTimeout(600);
st = await readState();
const row2 = st.guests.find(g => g.id === party.id);
check('the whole party is in, in one tap', row2.arrivedSeats, [...Array(party.count).keys()]);
check('counter now shows the whole party', await counter(), { arrived: party.count, total: TOTAL_SEATS });

// undo, so later assertions start clean
await p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /כל \d+ הגיעו|^הגיע\/ה$/.test(x.textContent.trim()));
  b?.click();
});
await p.waitForTimeout(500);

// ═══ 6. Search in the BY-TABLE view ════════════════════════════════════════
console.log(`\n── 6. by-table view has a search now ──`);
await p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /לפי שולחן/.test(x.textContent));
  b?.click();
});
await p.waitForTimeout(400);
const hasTableSearch = await p.evaluate(() =>
  !!document.querySelector('input[aria-label="חיפוש שולחן"]'));
check('a search field exists in by-table mode', hasTableSearch, true);

const seatedGuest = active.find(g => seating[g.id]);
await p.fill('input[aria-label="חיפוש שולחן"]', seatedGuest.name);
await p.waitForTimeout(500);
// Read the table BLOCK headings, not document.innerText: the "מקומות פנויים
// עכשיו" strip also prints table names, so scanning the whole page counted ten
// tables and made a correct filter look broken. Fix the check, not the code.
const tableHit = await p.evaluate(() =>
  [...document.querySelectorAll('*')]
    .filter(x => /(^|[\s_])tableName/.test(x.className || ''))
    .map(x => x.textContent.trim()));
// The fixture repeats names every 20 rows, so a name can legitimately sit at
// more than one table. Expected set is computed, not assumed.
const wantTables = [...new Set(active
  .filter(g => g.name === seatedGuest.name && seating[g.id])
  .map(g => tables.find(t => t.id === seating[g.id]).name))];
check(`searching a GUEST name in by-table mode surfaces exactly their table(s)`,
  tableHit.sort(), wantTables.sort());

// ═══ 7. Walk-in: which tables actually have room ═══════════════════════════
console.log(`\n── 7. walk-in — where is there room right now ──`);
const expectedFree = {};
tables.forEach(t => {
  const used = active.filter(g => seating[g.id] === t.id).reduce((s, g) => s + seatsOf(g), 0);
  expectedFree[t.name] = Math.max(0, t.capacity - used);
});
await p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /אורח שהגיע/.test(x.textContent));
  b?.click();
});
await p.waitForTimeout(400);
const sheetFree = await p.evaluate(() => {
  const out = {};
  document.querySelectorAll('[role="dialog"] button').forEach(btn => {
    const m = btn.innerText.replace(/\s+/g, ' ').match(/(שולחן \d+) (\d+) פנויים/);
    if (m) out[m[1]] = +m[2];
  });
  return out;
});
note('free seats the sheet offers', sheetFree);
const mismatch = Object.entries(sheetFree).filter(([k, v]) => expectedFree[k] !== v);
check('every offered table\'s free count matches the computed seat maths', mismatch, []);
check('the two empty tables are offered', [sheetFree['שולחן 13'], sheetFree['שולחן 14']], [12, 12]);
await p.keyboard.press('Escape').catch(() => {});
await p.evaluate(() => {
  const b = [...document.querySelectorAll('[role="dialog"] button')].find(x => x.textContent.trim() === 'ביטול');
  b?.click();
});

// ═══ 8. Layout: overflow, tap targets, tiny text ═══════════════════════════
console.log(`\n── 8. one hand, a phone, a dark room ──`);
for (const [route, label] of [['/events/e1/checkin', 'entrance'], ['/events/e1/nametags', 'nametags']]) {
  await p.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  // NEVER scrollWidth — an internally scrollable child inflates every ancestor.
  const moved = await p.evaluate(() => { window.scrollTo(9999, 0); return window.scrollX; });
  check(`${label}: no horizontal scroll (window.scrollX after scrollTo(9999,0))`, moved, 0);
}

await p.goto(BASE + '/events/e1/checkin', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(700);
await p.fill('input[type="search"]', party.name);
await p.waitForTimeout(400);
const targets = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, input')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (getComputedStyle(el).display === 'none') continue;
    if (r.height < 44) out.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.placeholder || '').trim().slice(0, 18)}" ${Math.round(r.height)}px`);
  }
  return out;
});
check('every visible control clears 44px', targets, []);

const primary = await p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /כולם הגיעו/.test(x.textContent));
  const r = b.getBoundingClientRect();
  return { h: Math.round(r.height), w: Math.round(r.width) };
});
note('the "everyone arrived" button', primary);
check('…is at least 60px tall', primary.h >= 60, true);

const tiny = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const fs = parseFloat(cs.fontSize);
    if (hasText && fs && fs < 11) out.push(`${el.className} ${fs}px`);
  }
  return out;
});
check('no text under 11px', tiny, []);

// ═══ 9. Contrast against the REAL composited ground ════════════════════════
console.log(`\n── 9. contrast, measured against each element\'s own ground ──`);
const contrast = await p.evaluate(() => {
  const L = (r, g, b) => {
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const parse = s => (s.match(/[\d.]+/g) || []).map(Number);
  // Walk up until an actually opaque background is found, compositing alpha.
  const groundOf = el => {
    let [r, g, b, a] = [255, 255, 255, 0];
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const c = parse(bg);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0)) {
        stack.push([c[0], c[1], c[2], c[3] === undefined ? 1 : c[3]]);
        if ((c[3] === undefined ? 1 : c[3]) === 1) break;
      }
    }
    stack.reverse();
    [r, g, b, a] = [255, 255, 255, 1];
    for (const [cr, cg, cb, ca] of stack) {
      r = cr * ca + r * (1 - ca); g = cg * ca + g * (1 - ca); b = cb * ca + b * (1 - ca);
    }
    return [r, g, b];
  };
  const ratio = el => {
    const fg = parse(getComputedStyle(el).color);
    const bg = groundOf(el);
    const l1 = L(fg[0], fg[1], fg[2]), l2 = L(bg[0], bg[1], bg[2]);
    return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
  };
  const pick = (re) => [...document.querySelectorAll('body *')]
    .find(x => x.children.length === 0 && re.test(x.textContent.trim()));
  const out = {};
  const big = pick(/^\d+$/);            if (big) out['the big counter number'] = ratio(big);
  const of  = pick(/^מתוך \d+ אורחים$/); if (of) out['"מתוך N אורחים"'] = ratio(of);
  const role = pick(/^עמדת כניסה$/);     if (role) out['"עמדת כניסה"'] = ratio(role);
  const meta = pick(/מקומות ·/);        if (meta) out['row meta'] = ratio(meta);
  const btn = [...document.querySelectorAll('button')].find(x => /כולם הגיעו/.test(x.textContent));
  if (btn) out['primary mark button label'] = ratio(btn);
  const tab = [...document.querySelectorAll('button')].find(x => /לפי שולחן/.test(x.textContent));
  if (tab) out['inactive tab label'] = ratio(tab);
  return out;
});
Object.entries(contrast).forEach(([k, v]) => {
  const pass = v >= 4.5;
  if (!pass) fails++;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${k}: ${v}:1`);
});

// ═══ 10. Name tags — the table card ════════════════════════════════════════
console.log(`\n── 10. table cards ──`);
await p.goto(BASE + '/events/e1/nametags', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);
const tents = await p.evaluate(() => {
  const els = [...document.querySelectorAll('*')].filter(x => /(^|\s)_?tentBig/.test(x.className || ''));
  const big = els[0];
  return {
    count: els.length,
    firstText: big?.textContent,
    fontPx: big ? Math.round(parseFloat(getComputedStyle(big).fontSize)) : null,
    flipped: !![...document.querySelectorAll('*')].find(x =>
      /tentFaceFlip/.test(x.className || '') && getComputedStyle(x).transform !== 'none'),
  };
});
note('tent faces rendered', tents.count);
check('a card exists for each of the 12 occupied tables (2 faces each)', tents.count, 24);
check('the big label is the bare number', tents.firstText, '1');
check('…and it is the largest type on the page', tents.fontPx >= 40, true);
check('the top face is rotated so the folded card reads from both sides', tents.flipped, true);

console.log(`\n── js errors ──`);
check('no page errors', jsErrors, []);

console.log(`\n${fails === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${fails} CHECK(S) FAILED`}\n`);
await b.close();
process.exit(fails ? 1 : 0);
