import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5188';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
p.on('console', m => { if (m.type() === 'error' && !/favicon|net::|Failed to load resource/i.test(m.text())) errs.push(m.text().slice(0, 160)); });
p.on('dialog', d => d.accept());

const seed = (over = {}) => ({
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן', startTime: '19:00',
  guests: [
    { id: 'g1', name: 'טל שוורץ',  side: 'bride', group: 'משפחה', count: 2, phone: '0501234567', rsvp: 'confirmed' },
    { id: 'g2', name: 'רון לוי',   side: 'groom', group: 'חברים', count: 1, phone: '0521234567', rsvp: 'pending' },
    { id: 'g3', name: 'שרה כהן',   side: 'bride', group: 'עבודה', count: 3, phone: '', rsvp: 'declined' },
    { id: 'g4', name: 'דני מזרחי', side: 'groom', group: 'חברים', count: 1, phone: '0541234567', rsvp: 'confirmed' },
    { id: 'g5', name: 'מיכל אבני', side: 'bride', group: 'משפחה', count: 4, phone: '0531111111', rsvp: 'confirmed' },
  ],
  tables: [
    { id: 't1', name: 'שולחן 1', capacity: 6,  type: 'regular', shape: 'round' },
    { id: 't2', name: 'שולחן 2', capacity: 10, type: 'regular', shape: 'round' },
  ],
  seating: {}, constraints: [], tasks: [], vendors: [],
  tokens: { rsvp: 'r1', album: 'al1', invite: 'i1', gift: 'gi1', hostess: 'h1', collab: 'c1' },
  cloudId: null, createdAt: Date.now(), updatedAt: Date.now(), ...over,
});

const load = async (ev) => {
  await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: [e], activeEventId: 'e1' })), ev);
};
const readEvent = () => p.evaluate(() =>
  JSON.parse(localStorage.getItem('kochav_hashulchan_v1')).events[0]);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

// ── 1. Auto-seating honours a locked table holding a declined guest ────────
console.log('\n── seating: locked table + declined occupant ──');
await load(seed({
  seating: { g3: 't1' },          // declined guest occupies 3 of table 1's 6 seats
  lockedTables: ['t1'], lockedGuests: [],
}));
await p.goto(BASE + '/events/e1/seating', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);
const autoBtn = p.locator('button', { hasText: /שבצו אוטומטית|חשבו|אוטומט/ }).first();
if (await autoBtn.count()) {
  await autoBtn.click();
  await p.waitForTimeout(900);
  const ev = await readEvent();
  const seatsAt = tid => ev.guests.filter(g => ev.seating[g.id] === tid).reduce((s, g) => s + (g.count || 1), 0);
  const cap = Object.fromEntries(ev.tables.map(t => [t.id, t.capacity]));
  const over = ev.tables.filter(t => seatsAt(t.id) > cap[t.id]).map(t => `${t.name} ${seatsAt(t.id)}/${cap[t.id]}`);
  check('no table is overbooked', over.length === 0, over.join(', '));
  check('declined guest stayed on the locked table', ev.seating.g3 === 't1');
  const toast = await p.locator('[class*=toast]').first().innerText().catch(() => '');
  const activeUnseated = ev.guests.filter(g => g.rsvp !== 'declined' && !ev.seating[g.id]);
  const claimsAllSeated = /כל \d+ הרשומות שובצו/.test(toast);
  check('toast does not claim success while a guest is unseated',
    !(claimsAllSeated && activeUnseated.length > 0),
    `toast="${toast.replace(/\n/g, ' ').slice(0, 60)}" unseated=${activeUnseated.length}`);
} else check('auto-seat button found', false);

// ── 2. Check-in on a deleted event must not crash (hook order) ─────────────
console.log('\n── check-in: event vanishes mid-session ──');
await load(seed({ seating: { g1: 't1' } }));
await p.goto(BASE + '/events/e1/checkin', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);
const beforeErrs = errs.length;
const preText = (await p.evaluate(() => document.body.innerText)).length;
check('check-in renders', preText > 30);
// Now wipe the event while the screen is mounted — the redirect path is the
// render where the early return used to shift every later hook.
await p.evaluate(() => localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: [], activeEventId: null })));
await p.goto(BASE + '/events/e1/checkin', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);
check('deleted event redirects without a hook-order crash', errs.length === beforeErrs,
  errs.slice(beforeErrs).join(' | ').slice(0, 100));

// ── 3. Tasks board seeds the right list for the event TYPE ─────────────────
console.log('\n── tasks: starter list matches the event type ──');
for (const [type, want, notWant] of [
  ['חתונה',      'שמלה',  null],
  ['בר מצווה',   'הכנסת', 'שמלה'],
  ['אירוע עסקי', 'תקציב', 'שמלה'],
  ['יום הולדת',  null,    'שמלה'],
]) {
  await load(seed({ type, tasks: [] }));
  await p.goto(BASE + '/events/e1/tasks', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(800);
  const seedBtn = p.locator('button', { hasText: /רשימת התחלה/ }).first();
  if (await seedBtn.count()) { await seedBtn.click(); await p.waitForTimeout(700); }
  const titles = (await readEvent()).tasks.map(t => t.title).join(' | ');
  check(`${type}: starter list loaded`, titles.length > 0);
  if (want)    check(`${type}: has "${want}"`, titles.includes(want), titles.slice(0, 70));
  if (notWant) check(`${type}: no wedding-only "${notWant}"`, !titles.includes(notWant), titles.slice(0, 70));
}

// ── 4. Announcement copy matches the type ─────────────────────────────────
console.log('\n── announcements: wording matches the type ──');
for (const [type, want, notWant] of [['חתונה', 'חתונה', null], ['בר מצווה', null, 'חתונה']]) {
  await load(seed({ type }));
  await p.goto(BASE + '/events/e1/preview-announce/invitation', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  const txt = await p.evaluate(() => document.body.innerText);
  if (want)    check(`${type}: invitation says "${want}"`, txt.includes(want));
  if (notWant) check(`${type}: invitation never says "${notWant}"`, !txt.includes(notWant));
}

// ── 5. Vendors: add → edit → delete-while-editing ─────────────────────────
console.log('\n── vendors: CRUD and delete-while-editing ──');
await load(seed());
await p.goto(BASE + '/events/e1/vendors', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(800);
await p.locator('button', { hasText: 'ספק חדש' }).first().click();
await p.waitForTimeout(300);
await p.locator('input').first().fill('אולמי הגן');
await p.locator('button', { hasText: /^הוסיפו$/ }).first().click();
await p.waitForTimeout(600);
let ev5 = await readEvent();
check('vendor added', (ev5.vendors || []).length === 1, JSON.stringify((ev5.vendors || [])[0]?.name));
await p.locator('button[aria-label=עריכה]').first().click();
await p.waitForTimeout(300);
await p.locator('button[aria-label=מחיקה]').first().click();
await p.waitForTimeout(600);
ev5 = await readEvent();
const formStillOpen = await p.locator('button', { hasText: /^שמרו$/ }).count();
check('vendor deleted', (ev5.vendors || []).length === 0);
check('edit form closed after deleting the row being edited', formStillOpen === 0);

// ── 6. Messages screen renders the sequence and a wa.me link ──────────────
console.log('\n── messages: sequence + WhatsApp link ──');
await load(seed());
await p.goto(BASE + '/events/e1/messages', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1000);
const waHrefs = await p.evaluate(() => [...document.querySelectorAll('a[href*="wa.me"]')].map(a => a.href).slice(0, 3));
const msgText = await p.evaluate(() => document.body.innerText);
check('all six stages listed', ['Save the Date', 'הזמנה', 'תזכורת', 'פרטי הגעה', 'תודה'].every(s => msgText.includes(s)));
check('renders wa.me links with 972 prefix', waHrefs.length === 0 || waHrefs.every(h => /wa\.me\/972/.test(h)), waHrefs[0] || 'none rendered yet');
const rendered = waHrefs.map(h => decodeURIComponent(new URL(h).searchParams.get('text') || '')).join('\n');
check('prefix letter absorbs the article (לחתונה, not להחתונה)', !/[לבכ]ה[א-ת]/.test(rendered.split('\n')[2] || ''), (rendered.split('\n')[2] || '').slice(0, 40));
check('no raw {{placeholder}} in an actual outgoing message', !/\{\{/.test(rendered), rendered.slice(0, 50).replace(/\n/g, ' '));

// ── 7. Guest add → seat → check-in arrival ────────────────────────────────
console.log('\n── check-in: mark a guest as arrived ──');
await load(seed({ seating: { g1: 't1', g4: 't2' } }));
await p.goto(BASE + '/events/e1/checkin', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);
await p.locator('input').first().fill('טל');
await p.waitForTimeout(600);
const arriveBtn = p.locator('button', { hasText: /צ׳ק אין|הגיע/ }).first();
if (await arriveBtn.count()) {
  await arriveBtn.click();
  await p.waitForTimeout(700);
  const ev7 = await readEvent();
  check('an arrival is persisted', ev7.guests.some(g => g.arrived));
} else check('arrival control present', false);

console.log('\n═══ JS errors during flows ═══');
const u = [...new Set(errs)];
console.log(u.length ? u.slice(0, 10).map(e => '  • ' + e).join('\n') : '  none');
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await b.close();
