/* Drives the seating screen for real: rename a table from the card and read the
   name back out of the tables screen (and the other way round), open several
   cards independently, open/close them all, and drag a guest between tables.

   Every assertion reads state back out of localStorage or the DOM — nothing
   here trusts that a click "probably" worked.

   Usage: node qa/seatingFlow.mjs   (QA_BASE=… to run against `vite preview`)
*/
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');
import { REALISTIC, STORE_KEY, seedScript } from './seatingFixtures.mjs';

const BASE = process.env.QA_BASE || 'http://127.0.0.1:5188';
let pass = 0, fail = 0;
const ok  = (m, extra = '') => { pass++; console.log(`  ✓ ${m}${extra ? '  — ' + extra : ''}`); };
const bad = (m, extra = '') => { fail++; console.log(`  ✗ ${m}${extra ? '  — ' + extra : ''}`); };
const is  = (m, got, want) => (got === want ? ok(m, JSON.stringify(got)) : bad(m, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`));

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', e => bad('JS error on page', e.message));

const store = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)).events[0], STORE_KEY);
const go    = async (path) => { await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200); };

await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
await p.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, seedScript(REALISTIC)]);

/* ── 1. Rename from the seating screen ──────────────────────────────────── */
console.log('\n1 · שינוי שם שולחן ממסך ההושבה');
await go('/events/e1/seating');

const nameBtns = await p.$$('[class*="tCardNameBtn"]');
is('a rename control on every table card', nameBtns.length, REALISTIC.tables.length);

await nameBtns[0].click();
await p.waitForTimeout(200);
const input = await p.$('[class*="tCardNameInput"]');
if (!input) bad('clicking the name opens an input in place');
else {
  ok('clicking the name opens an input in place — no modal, no other screen');
  await input.fill('שולחן משפחת כהן');
  await input.press('Enter');
  await p.waitForTimeout(600);
  const t = (await store()).tables.find(t => t.id === 't1');
  is('the new name is in ev.tables[].name', t.name, 'שולחן משפחת כהן');
  const headText = await p.$eval('[class*="tCardNameText"]', el => el.textContent);
  is('the card shows the new name', headText, 'שולחן משפחת כהן');
}

/* ── 2. …and the tables screen shows it. Same field, so there is nothing to
      sync — this is the proof of that claim, not of a sync mechanism. ────── */
console.log('\n2 · הכיוון השני — מסך השולחנות');
await go('/events/e1/tables');
const rowNames = await p.$$eval('[class*="rowNameText"]', els => els.map(e => e.textContent));
is('the tables screen lists the renamed table', rowNames[0], 'שולחן משפחת כהן');

// Now rename it back from the tables screen and check the seating card follows.
const editBtns = await p.$$('text=עריכה');
await editBtns[0].click();
await p.waitForTimeout(200);
const tblInput = await p.$('[class*="tRowEdit"] input');
await tblInput.fill('שולחן הכלה');
await p.keyboard.press('Enter');
await p.waitForTimeout(600);
await go('/events/e1/seating');
const backText = await p.$eval('[class*="tCardNameText"]', el => el.textContent);
is('a rename on the tables screen shows up on the seating card', backText, 'שולחן הכלה');

/* ── 3. A name that another table already answers to is refused ─────────── */
console.log('\n3 · שם כפול נדחה');
const nb = await p.$$('[class*="tCardNameBtn"]');
await nb[1].click();
await p.waitForTimeout(200);
const dupInput = await p.$('[class*="tCardNameInput"]');
await dupInput.fill('שולחן הכלה');
await dupInput.press('Enter');
await p.waitForTimeout(600);
const t2 = (await store()).tables.find(t => t.id === 't2');
is('table 2 keeps its own name', t2.name, 'שולחן 2');
const stillEditing = await p.$('[class*="tCardNameInput"]');
is('the input stays open so the name can be corrected', !!stillEditing, true);
await p.keyboard.press('Escape');
await p.waitForTimeout(300);

/* ── 4. Independent expand ──────────────────────────────────────────────── */
console.log('\n4 · פתיחה עצמאית של כל שולחן');
const toggles = () => p.$$('[class*="tCardToggle"]');
const expandedFlags = () => p.$$eval('[class*="tCardToggle"]', els => els.map(e => e.getAttribute('aria-expanded')));

let tg = await toggles();
await tg[0].click(); await p.waitForTimeout(400);
await tg[1].click(); await p.waitForTimeout(400);
let flags = await expandedFlags();
is('opening the second table leaves the first open', flags.slice(0, 2).join(','), 'true,true');
is('and does not open anything else', flags.slice(2).every(f => f === 'false'), true);

await tg[0].click(); await p.waitForTimeout(400);
flags = await expandedFlags();
is('closing the first leaves the second open', flags.slice(0, 2).join(','), 'false,true');

/* ── 5. Open all / close all ────────────────────────────────────────────── */
console.log('\n5 · פתחו הכל / סגרו הכל');
const btnByText = async (txt) => (await p.$$(`[class*="expandAllBtn"]`)).find
  ? (await Promise.all((await p.$$('[class*="expandAllBtn"]')).map(async h => [h, (await h.innerText()).trim()])))
      .filter(([, t]) => t.includes(txt)).map(([h]) => h)[0]
  : null;

const openAll = await btnByText('פתחו הכל');
await openAll.click(); await p.waitForTimeout(1200);
flags = await expandedFlags();
is('"פתחו הכל" opens every table', flags.every(f => f === 'true'), true);

// The thing the host actually asked for: it STAYS open.
tg = await toggles();
await tg[3].click(); await p.waitForTimeout(500);
flags = await expandedFlags();
is('closing one card while all are open closes only that one',
   flags.filter(f => f === 'false').length, 1);

const closeAll = await btnByText('סגרו הכל');
await closeAll.click(); await p.waitForTimeout(600);
flags = await expandedFlags();
is('"סגרו הכל" closes every table', flags.every(f => f === 'false'), true);

/* ── 6. Guest rows really are there after scrolling (deferred bodies) ───── */
console.log('\n6 · הגופים הנדחים נבנים בגלילה');
const openAll2 = await btnByText('פתחו הכל');
await openAll2.click(); await p.waitForTimeout(1000);
const rowsAtTop = await p.$$eval('[class*="tGuestRow"]', e => e.length);
await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await p.waitForTimeout(1500);
const rowsAfterScroll = await p.$$eval('[class*="tGuestRow"]', e => e.length);
is('scrolling to the bottom builds the rows that were not built yet',
   rowsAfterScroll > rowsAtTop, true);
console.log(`      (${rowsAtTop} rows built on open → ${rowsAfterScroll} after scrolling to the end)`);
// NOT "the last card on the page": in this fixture the guests fill the first
// seven tables and the rest are genuinely empty, so an empty body there is
// correct. The claim worth checking is that the LOWEST OCCUPIED table — the one
// furthest from the viewport when the page opened — has its rows.
const lowestOccupied = await p.evaluate(() => {
  const cards = [...document.querySelectorAll('[class*="tCard_"]')];
  for (let i = cards.length - 1; i >= 0; i--) {
    const count = cards[i].querySelector('[class*="tCardCount"]');
    const seated = count ? parseInt(count.textContent, 10) : 0;
    if (seated > 0) return { i, seated, rows: cards[i].querySelectorAll('[class*="tGuestRow"]').length };
  }
  return null;
});
is('the lowest occupied table has its guest rows rendered after scrolling',
   lowestOccupied && lowestOccupied.rows > 0, true);
console.log(`      (card #${lowestOccupied?.i + 1}: ${lowestOccupied?.seated} seats, ${lowestOccupied?.rows} rows)`);

/* ── 7. Horizontal overflow — scrollWidth lies, so scroll and look ──────── */
const scrolledX = await p.evaluate(() => { window.scrollTo(9999, 0); return window.scrollX; });
is('the page does not scroll horizontally', scrolledX, 0);

/* ── 8. Drag and drop still works ───────────────────────────────────────── */
console.log('\n8 · גרירה בין שולחנות (@dnd-kit)');
await go('/events/e1/seating');
const before = await store();

// Source and target have to be visible AT THE SAME TIME, and the target has to
// have room. In this fixture the guests fill the first tables solid, so the
// pair that satisfies both is the LAST occupied table and the empty one beside
// it in the grid.
const pick = await p.evaluate(() => {
  const cards = [...document.querySelectorAll('[class*="tCard_"]')];
  const seats = cards.map(c => {
    const m = (c.querySelector('[class*="tCardCount"]')?.textContent || '').match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { used: +m[1], cap: +m[2] } : { used: 0, cap: 0 };
  });
  let from = -1;
  for (let i = cards.length - 1; i >= 0; i--) if (seats[i].used > 0) { from = i; break; }
  const to = seats.findIndex((s, i) => i !== from && s.used + 2 <= s.cap);
  return { from, to };
});
is('found an occupied table and a table with room', pick.from >= 0 && pick.to >= 0, true);

tg = await toggles();
await tg[pick.from].click();                       // open the source table
await p.waitForTimeout(800);

// reset.css sets `html { scroll-behavior: smooth }`, so scrollIntoView ANIMATES
// and a rect read on the next line is the OLD position — the same trap
// qa/mobile.mjs documents. An earlier version of this probe read y = 1308 in a
// 900px viewport, drove the mouse nowhere, and looked exactly like a broken
// drag; it failed identically on the BASELINE build, which is how it was told
// apart from a regression.
await p.evaluate((i) => {
  document.documentElement.style.scrollBehavior = 'auto';
  document.querySelectorAll('[class*="tCard_"]')[i].scrollIntoView({ block: 'center' });
}, pick.from);
await p.waitForTimeout(400);

const dragged = await p.evaluate((i) => {
  const row = document.querySelectorAll('[class*="tCard_"]')[i].querySelector('[class*="tGuestRow"]');
  // The DRAG HANDLE, not "40px from the left of the row": the page is RTL, so
  // the left end of a guest row is the move-to-table <select>, which stops the
  // pointerdown on purpose. A press there can never start a drag — an earlier
  // version of this probe pressed there and reported the drag as broken.
  const h = row.querySelector('[class*="dragHandle"]') || row;
  const r = h.getBoundingClientRect();
  return { name: row.querySelector('[class*="gName"]').textContent.trim(), x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, pick.from);

const target = await p.evaluate((i) => {
  const r = document.querySelectorAll('[class*="tCard_"]')[i].getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, pick.to);
console.log(`      (dragging "${dragged.name}" from card #${pick.from + 1} at ${dragged.x | 0},${dragged.y | 0} onto card #${pick.to + 1} at ${target.x | 0},${target.y | 0})`);

await p.mouse.move(dragged.x, dragged.y);
await p.mouse.down();
await p.mouse.move(dragged.x, dragged.y - 20, { steps: 5 });   // clear the 5px activation distance
await p.mouse.move(target.x, target.y, { steps: 25 });
await p.waitForTimeout(300);
is('a drag overlay appears while dragging', !!(await p.$('[class*="dragOverlayRow"]')), true);
is('the table under the pointer lights up as the drop target',
   !!(await p.$('[class*="tCardDropOver"]')), true);
await p.mouse.up();
await p.waitForTimeout(900);

const after = await store();
const movedId = Object.keys(after.seating).find(id => after.seating[id] !== before.seating[id]);
if (!movedId) bad('a guest moved between tables', 'nothing in ev.seating changed');
else {
  const g = after.guests.find(g => g.id === movedId);
  ok('a guest moved between tables',
     `${g.name}: ${before.seating[movedId]} → ${after.seating[movedId]}`);
  is('it landed on the table it was dropped on', after.seating[movedId], 't' + (pick.to + 1));
}

console.log(`\n${pass} עברו · ${fail} נכשלו\n`);
await b.close();
process.exit(fail ? 1 : 0);
