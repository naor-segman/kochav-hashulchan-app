// The whole product, driven the way a customer drives it: nothing is injected
// into localStorage. The event is created through the wizard, the guests are
// typed in, the tables are built, the seating is run — and after every step the
// harness reads what actually landed in localStorage and checks it.
//
// Every harness in this directory so far starts by writing a finished event
// into storage and then looks at a screen. That tests rendering. It cannot
// catch a wizard step that never saves, a button that is disabled when it
// should not be, or a screen that is unreachable because the one before it
// leads nowhere. This walks the path instead.
//
// Runs on a phone, because that is where the owner's customers are.
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';
const OUT = '/tmp/claude-0/-home-user-kochav-hashulchan-app/94fef7cd-f944-597e-9253-a6fe3d65a52a/scratchpad/e2e';
mkdirSync(OUT, { recursive: true });

let step = 0, fails = 0;
const ok = (cond, what, detail = '') => {
  if (!cond) fails++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
  return cond;
};
const head = (s) => console.log(`\n── ${++step}. ${s}`);

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const page = await b.newPage({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});

const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message.slice(0, 160)));
page.on('console', m => {
  if (m.type() === 'error' && !/favicon|net::|Failed to load resource|manifest|sw\.js/i.test(m.text()))
    errors.push(m.text().slice(0, 160));
});
page.on('dialog', d => d.accept());

const store = () => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('kochav_hashulchan_v1') || 'null'); }
  catch { return null; }
});
const ev = async () => {
  const s = await store();
  return s && s.events && s.events[0] ? s.events[0] : null;
};
const shot = (n) => page.screenshot({ path: `${OUT}/${String(step).padStart(2, '0')}-${n}.png`, fullPage: true }).catch(() => {});

// ── 1. Land on the marketing page and get into the app ───────────────────────
head('landing → app');
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
ok((await page.locator('h1').count()) > 0, 'the landing page renders a heading');
await page.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await shot('app-empty');
// Not a button COUNT — the empty state is deliberately two controls and a
// form. What matters is that a first-time visitor can start an event from it.
ok((await page.locator('input, select').count()) >= 3 &&
   (await page.locator('button').filter({ hasText: /בואו נתחיל|צרו|התחילו/ }).count()) > 0,
   'the empty app offers a way to start an event without signing up first');

// ── 2. Create an event through the wizard ────────────────────────────────────
head('create an event through the wizard');
const newEvent = page.locator('button, a').filter({ hasText: /אירוע חדש|צרו אירוע|התחילו|אירוע ראשון/ }).first();
if (await newEvent.count()) { await newEvent.click(); await page.waitForTimeout(900); }
else { await page.goto(BASE + '/start', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200); }
await shot('wizard-open');

// Pick a wedding, then fill whatever the step asks for, then advance —
// repeatedly, because the wizard's step count is not this harness's business.
const wedding = page.locator('button, [role=button], label').filter({ hasText: /^\s*חתונה\s*$/ }).first();
if (await wedding.count()) { await wedding.click(); await page.waitForTimeout(600); }

for (let i = 0; i < 8; i++) {
  // Fill every empty visible field on this step.
  await page.evaluate(() => {
    const set = (el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    for (const el of document.querySelectorAll('input, textarea')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || el.disabled || el.readOnly || el.value) continue;
      if (el.type === 'date') set(el, '2027-06-01');
      else if (el.type === 'time') set(el, '19:00');
      else if (el.type === 'number') set(el, '12');
      else if (el.type === 'tel') set(el, '0501234567');
      else if (el.type === 'checkbox' || el.type === 'radio') continue;
      else {
        // The wizard labels the couple as "שם ראשון" / "שם שני" and puts the
        // example names in the PLACEHOLDER. Matching on /כלה|חתן/ hits nothing,
        // and the fallback then writes the whole event name into both — which
        // is how a run produced "החתונה של החתונה של דנה ויוסי ו…".
        const a = (el.getAttribute('aria-label') || '') + ' ' + (el.placeholder || '');
        set(el, /כלה|דנה|ראשון/.test(a) ? 'דנה'
             : /חתן|יוסי|שני/.test(a)   ? 'יוסי'
             : /אולם|מקום|כתובת/.test(a) ? 'אולמי הגן הקסום'
             : 'החתונה של דנה ויוסי');
      }
    }
  });
  await page.waitForTimeout(400);
  const next = page.locator('button:not([disabled])')
    .filter({ hasText: /המשיכו|הבא|צרו|סיום|שמרו|בואו נתחיל/ }).first();
  if (!(await next.count())) break;
  await next.click();
  await page.waitForTimeout(900);
  if (/\/events\/[^/]+\//.test(page.url())) break;   // the wizard handed us an event
}
await page.waitForTimeout(800);
await shot('after-wizard');

let e = await ev();
ok(!!e, 'an event exists in storage after the wizard', e ? `id=${e.id}` : 'storage is empty');
if (!e) { console.log('\ncannot continue without an event'); await b.close(); process.exit(1); }
ok(!!e.name, 'it has a name', e.name || '(none)');
ok(!!e.date, 'it has a date', e.date || '(none)');
ok(e.type === 'חתונה', 'its type is the Hebrew string, not an English key', String(e.type));
const EID = e.id;

// ── 3. Add guests by hand ────────────────────────────────────────────────────
head('add guests by hand');
await page.goto(`${BASE}/events/${EID}/guests`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);
const manual = page.locator('button').filter({ hasText: /פשוט להקליד/ }).first();
if (await manual.count()) { await manual.click(); await page.waitForTimeout(600); }

// The form is already open — "+ הוסיפו אורח" is the SUBMIT, not a disclosure.
// Address the fields by their exact placeholder: `input[placeholder*="שם"]`
// with .last() lands on the filter box further down the page, which silently
// filters the list to nothing and makes the add look like it failed.
const NAMES = [['טל שוורץ', '4'], ['רון לוי', '1'], ['שרה כהן', '3']];
for (const [name, count] of NAMES) {
  const nameField = page.locator('input[placeholder="שם ושם משפחה"]').first();
  if (!(await nameField.count())) { ok(false, `the name field is not on the page for "${name}"`); break; }
  await nameField.fill(name);
  // The seat count is the only number input inside the add form; the gift
  // estimate below it is the other one, so index rather than .last().
  const countField = page.locator('input[type=number]').first();
  if (await countField.count()) { await countField.fill(count); }
  await page.waitForTimeout(400);
  // A row of 4 is a GROUP, and the form requires a name for every seat in it —
  // a deliberate rule with its own hint string in guestForm.js, not a bug. A
  // harness that skips these gets a silent refusal and blames the app.
  const comps = page.locator('input[aria-label^="שם המצטרף"]');
  const n = await comps.count();
  for (let i = 0; i < n; i++) await comps.nth(i).fill(`מלווה ${i + 1}`);
  await page.waitForTimeout(300);
  const save = page.locator('button:not([disabled])').filter({ hasText: /\+ הוסיפו אורח/ }).first();
  if (await save.count()) { await save.click(); await page.waitForTimeout(900); }
  const landed = await ev();
  ok(landed.guests.some(g => g.name === name), `"${name}" (${count} seats) was accepted`);
}
await shot('guests');
e = await ev();
ok(e.guests.length >= 3, `${e.guests.length} guests landed in storage`, e.guests.map(g => g.name).join(', '));
const seats = e.guests.reduce((n, g) => n + (g.count || 1), 0);
ok(seats >= 8, `${seats} seats across them — count is being saved, not defaulted to 1`);

// ── 4. Build tables ──────────────────────────────────────────────────────────
head('build tables');
await page.goto(`${BASE}/events/${EID}/tables`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);
for (let i = 0; i < 3; i++) {
  const add = page.locator('button:not([disabled])').filter({ hasText: /הוסיפו שולחן|\+ שולחן|שולחן חדש/ }).first();
  if (!(await add.count())) break;
  await add.click(); await page.waitForTimeout(700);
}
await shot('tables');
e = await ev();
ok(e.tables.length > 0, `${e.tables.length} tables landed in storage`);
ok(e.tables.every(t => (t.capacity || 0) > 0), 'every table has a capacity',
   e.tables.map(t => `${t.name}:${t.capacity}`).join(' '));

// ── 5. Run the seating ───────────────────────────────────────────────────────
head('run the seating');
await page.goto(`${BASE}/events/${EID}/seating`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1600);
const run = page.locator('button:not([disabled])')
  .filter({ hasText: /לחצו להושבה אוטומטית|חשבו מחדש/ }).first();
ok(await run.count() > 0, 'the run-seating button is present and enabled');
if (await run.count()) { await run.click(); await page.waitForTimeout(2500); }
await shot('seating');
e = await ev();
const seated = Object.keys(e.seating || {}).length;
ok(seated > 0, `${seated} of ${e.guests.length} guest rows were seated`);
// Capacity is the one invariant that must hold whatever the algorithm chose.
const load = {};
for (const [gid, tid] of Object.entries(e.seating || {})) {
  const g = e.guests.find(x => x.id === gid);
  load[tid] = (load[tid] || 0) + (g ? (g.count || 1) : 0);
}
const over = Object.entries(load).filter(([tid, n]) => {
  const t = e.tables.find(x => x.id === tid);
  return t && n > t.capacity;
}).map(([tid, n]) => `${tid}:${n}`);
ok(over.length === 0, 'no table is seated beyond its capacity', over.join(', '));
ok(Object.values(e.seating || {}).every(tid => e.tables.some(t => t.id === tid)),
   'every seating entry points at a table that exists');

// ── 6. Every host screen loads for this real event ───────────────────────────
head('every host screen loads for the event we just built');
const SCREENS = ['setup', 'tables', 'guests', 'constraints', 'seating', 'site', 'share',
                 'rsvps', 'collab', 'costs', 'tasks', 'announce', 'vendors', 'messages',
                 'nametags', 'entrance'];
for (const s of SCREENS) {
  errors.length = 0;
  await page.goto(`${BASE}/events/${EID}/${s}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1100);
  const r = await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(9999, 0); const sx = Math.abs(window.scrollX); window.scrollTo(0, 0);
    const t = (document.body.innerText || '').trim();
    return { sx, empty: t.length < 40, blew: /משהו השתבש|שגיאה בלתי צפויה/.test(t) };
  });
  ok(!r.blew && !r.empty && r.sx === 0 && errors.length === 0, `/${s}`,
     [r.blew && 'error boundary', r.empty && 'renders nothing', r.sx && `scrolls ${r.sx}px`,
      errors.length && errors[0]].filter(Boolean).join('; '));
}

// ── 7. The links a guest actually receives ───────────────────────────────────
head('the public links this event minted');
e = await ev();
const tk = e.tokens || {};
ok(Object.keys(tk).length > 0, `tokens minted: ${Object.keys(tk).join(', ') || 'none'}`);
for (const [kind, path] of [['rsvp', 'rsvp'], ['invite', 'invite'], ['gift', 'gift']]) {
  if (!tk[kind]) continue;
  errors.length = 0;
  await page.goto(`${BASE}/${path}/${tk[kind]}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  const r = await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(9999, 0); const sx = Math.abs(window.scrollX); window.scrollTo(0, 0);
    return { sx, len: (document.body.innerText || '').trim().length };
  });
  // These screens read from Supabase, which is not reachable here, so an error
  // state is the correct outcome — what is checked is that they RENDER one and
  // do not blow up or scroll sideways.
  ok(r.len > 20 && r.sx === 0, `/${path}/:token renders and does not scroll sideways`,
     `${r.len} chars, scrollX=${r.sx}${errors.length ? ', ' + errors[0] : ''}`);
}

// ── 8. Reload: does any of it survive? ───────────────────────────────────────
head('reload the app and check nothing was lost');
const before = await ev();
await page.goto(`${BASE}/events/${EID}/seating`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1600);
const after = await ev();
ok(after.guests.length === before.guests.length, 'the guests survived a reload',
   `${before.guests.length} → ${after.guests.length}`);
ok(after.tables.length === before.tables.length, 'the tables survived a reload',
   `${before.tables.length} → ${after.tables.length}`);
ok(Object.keys(after.seating || {}).length === Object.keys(before.seating || {}).length,
   'the seating survived a reload',
   `${Object.keys(before.seating || {}).length} → ${Object.keys(after.seating || {}).length}`);

await b.close();
console.log(`\n${fails} failing checks across ${step} steps`);
console.log(`shots: ${OUT}`);
process.exit(fails ? 1 : 0);
