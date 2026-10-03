// Host screens, signed in, against a seeded realistic wedding (audit 3.10).
//
// One harness for the layout/visibility findings of the 3.10 host audit, each a
// named check so a fix can be proved by running just its own:
//   node qa/hostScreens.mjs                 every check
//   node qa/hostScreens.mjs rsvpScroll      one (or several) by name
//   BASE=http://127.0.0.1:6311 node qa/hostScreens.mjs …   reuse a running dev server
//
// The real signed-in code path runs: the dev server is started with a stubbed
// VITE_SUPABASE_URL and every REST call is intercepted here. Every assertion
// reads the DOM back — never the code that wrote it.
//
// Horizontal overflow is measured the one way that works on an RTL page
// (CLAUDE.md, environment traps): scrollTo({ left: -1e5, behavior: "instant" })
// and scrollX !== 0. Never scrollWidth.
import { createRequire } from 'module';
import { startDev } from './lib/preview.mjs';
import { TOURS } from '../src/data/tours.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire('/home/user/kochav-hashulchan-app/')('playwright');
const PORT = Number(process.env.PORT || 6311);

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

/* ── Fixture: 150 guest rows, families, long Hebrew names, 15 tables ─────── */
const FIRST = ['טל', 'רון', 'שרה', 'דנה', 'יוסי', 'נועה', 'איתי', 'מיכל', 'עומר', 'ליאת',
  'אבי', 'רותם', 'גיא', 'הילה', 'אורי', 'שירה', 'עידו', 'מאיה', 'ניר', 'יעל'];
const LAST = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'שוורץ', 'אזולאי',
  'בן־אבו־רוזנבלום', 'אלמוג־שטרנברג'];
const GROUPS = ['משפחה קרובה', 'חברים', 'חברים מהעבודה', 'משפחה רחוקה', 'חברים מהצבא', 'בני דודים'];
const LONG = [
  'משפחת בן־אבו־רוזנבלום מרמת השרון (כולל הסבתא)',
  'פרופ׳ אלכסנדר וולקוביסקי־טננבאום והרעיה המהוללת',
  'הדודה מרגלית מהקיבוץ בגליל העליון עם כל הנכדים',
];
const CLOUD = '0b6f6c1e-1111-4222-8333-444455556666';
const USER = { id: 'u-host', aud: 'authenticated', role: 'authenticated', email: 'host@example.com',
  app_metadata: {}, user_metadata: { full_name: 'דנה כהן' } };

function makeEvent() {
  const guests = [];
  for (let i = 0; i < 150; i++) {
    const fam = i % 7 === 0;
    const count = fam ? 2 + (i % 5) : (i % 4 === 0 ? 2 : 1);
    const name = i < 3 ? LONG[i] : fam
      ? `משפחת ${LAST[i % LAST.length]} ${i}`
      : `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]} ${i}`;
    guests.push({
      id: 'g' + (i + 1), name, side: i % 2 ? 'groom' : 'bride', group: GROUPS[i % GROUPS.length], count,
      phone: i % 5 === 4 ? '' : '05' + String(20000000 + i * 1373).slice(0, 8),
      rsvp: i % 13 === 0 ? 'declined' : i % 3 === 0 ? 'pending' : 'confirmed',
    });
  }
  const tables = Array.from({ length: 15 }, (_, i) => ({
    id: 't' + (i + 1), name: i === 0 ? 'שולחן המשפחה המורחבת של הכלה והחתן ביחד' : 'שולחן ' + (i + 1),
    capacity: i % 3 === 0 ? 12 : 10, type: 'regular', shape: ['round', 'rect', 'square', 'oval'][i % 4],
  }));
  const seating = {};
  let ti = 0, used = 0;
  for (const g of guests.slice(0, 95)) {
    if (g.rsvp === 'declined') continue;
    while (ti < 12 && used + g.count > tables[ti].capacity) { ti++; used = 0; }
    if (ti >= 12) break;
    seating[g.id] = tables[ti].id; used += g.count;
  }
  return {
    id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-15',
    brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן, קיסריה',
    guests, tables, seating, constraints: [],
    tasks: [
      { id: 'k1', title: 'לסגור עם הצלם', status: 'todo', priority: 'high', due: '2027-05-10' },
      { id: 'k2', title: 'טעימות', status: 'done', done: true, priority: 'medium', due: '2027-04-01' },
    ],
    costs: { categories: [
      { id: 'q1', name: 'אולם וקייטרינג', planned: 180000, actual: 60000 },
      { id: 'q2', name: 'צילום', planned: 15000, actual: 4000 },
    ] },
    tokens: { rsvp: 'tok-r', album: 'tok-a', invite: 'tok-i', gift: 'tok-g', hostess: 'tok-h', collab: 'tok-c' },
    cloudId: CLOUD, version: 1, syncedVersion: 1,
    createdAt: Date.now() - 86400000 * 40, updatedAt: Date.now() - 3600000,
  };
}
// r0 matches guest g1 by NAME only (a different phone) — the row that shows
// "זוהה לפי שם — {name}?" with the longest name in the list.
const RSVPS = Array.from({ length: 24 }, (_, i) => ({
  id: 'r' + i, guest_name: i === 0 ? LONG[0] : `${FIRST[i % 20]} ${LAST[(i * 3) % 12]} ${i}`,
  phone: '05' + String(30000000 + i * 911).slice(0, 8), attending: i % 5 !== 1, guests_count: (i % 4) + 1,
  status: i % 5 === 1 ? 'no' : i % 7 === 3 ? 'maybe' : 'yes', companions: [], shuttle_id: null,
  created_at: new Date(Date.now() - i * 3600e3).toISOString(),
}));

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function stub(p, { delayEvents = 0 } = {}) {
  await p.route('**/stub.supabase.co/**', async (route) => {
    const r = route.request(); const u = new URL(r.url()); const path = u.pathname;
    if (path.endsWith('/auth/v1/user')) return json(route, USER);
    if (path.includes('/auth/v1/token')) return json(route, { access_token: 'a', refresh_token: 'r', token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER });
    if (path.includes('/rest/v1/rsvp_responses')) return json(route, RSVPS);
    if (path.includes('/rest/v1/profiles')) return json(route, r.headers()['accept']?.includes('vnd.pgrst.object')
      ? { id: USER.id, email: USER.email, full_name: 'דנה כהן', role: 'user' } : [{ id: USER.id, email: USER.email, full_name: 'דנה כהן', role: 'user' }]);
    if (path.includes('/rest/v1/events') && r.method() === 'GET' && u.search.includes('user_id')) {
      if (delayEvents) await new Promise(res => setTimeout(res, delayEvents));
      const ev = makeEvent();
      return json(route, [{ id: CLOUD, user_id: USER.id, name: ev.name, type: ev.type, date: ev.date, venue: ev.venue,
        version: 1, created_at: new Date(ev.createdAt).toISOString(), updated_at: new Date(ev.updatedAt).toISOString(),
        payload: { ...ev, localId: 'e1' }, rsvp_token: 'tok-r', album_token: 'tok-a', invite_token: 'tok-i',
        gift_token: 'tok-g', hostess_token: 'tok-h', collab_token: 'tok-c' }]);
    }
    if (path.includes('/rest/v1/events') && r.method() === 'PATCH') {
      let v = 2; try { v = JSON.parse(r.postData()).version ?? 2; } catch { /* default */ }
      return json(route, [{ version: v }]);
    }
    if (r.method() === 'GET' && path.includes('/rest/v1/')) return json(route, []);
    return json(route, {});
  });
}

/** Seed BEFORE any app script runs (addInitScript), so nothing races the app. */
async function page(b, base, { width = 390, height = 800, seed = true, delayEvents = 0, touch = false } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, serviceWorkers: 'block', hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage();
  await stub(p, { delayEvents });
  await p.addInitScript(CONTRAST_JS);
  if (seed) {
    await p.addInitScript(([ev, user, tours]) => {
      if (sessionStorage.getItem('qa-seeded')) return;
      sessionStorage.setItem('qa-seeded', '1');
      localStorage.clear();
      const y = Math.floor(Date.now() / 1000) + 31_536_000;
      localStorage.setItem('sb-stub-auth-token', JSON.stringify({ access_token: 'a', refresh_token: 'r',
        token_type: 'bearer', expires_in: 31_536_000, expires_at: y, user }));
      localStorage.setItem('kochav_hashulchan_v1::u_' + user.id, JSON.stringify({ events: [ev], activeEventId: ev.id }));
      // No tour card over the measurements (src/utils/tourState.js).
      localStorage.setItem('kochav_tour_v1', JSON.stringify(Object.fromEntries(tours.map(k => [k, 1]))));
    }, [makeEvent(), USER, Object.keys(TOURS)]);
  }
  return { ctx, p };
}

const hscroll = (p) => p.evaluate(() => {
  window.scrollTo({ left: -1e5, behavior: 'instant' });
  const x = window.scrollX;
  window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  return x;
});

/* Contrast of an element's text against what is actually painted behind it
 * (CLAUDE.md bug class 5: a tint is a ground). Composites every ancestor's
 * background top-down and applies each ancestor's `opacity` as a group, so a
 * row dimmed with opacity is measured as dimmed. Ignores background images
 * and overlapping siblings — none on the elements checked here. Installed as
 * window.__contrast(el) → ratio. */
const CONTRAST_JS = () => {
  const parse = (s) => { const m = s.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0]; return [m[0], m[1], m[2], m[3] ?? 1]; };
  const over = (top, base) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + base[i] * (1 - a)).concat(1); };
  const mix = (c, back, o) => [0, 1, 2].map(i => c[i] * o + back[i] * (1 - o)).concat(1);
  const lum = (c) => { const v = c.slice(0, 3).map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  window.__contrast = (el) => {
    const nodes = []; for (let n = el; n; n = n.parentElement) nodes.unshift(n);
    const text = parse(getComputedStyle(el).color);
    const paint = (i, back, withText) => {
      if (i === nodes.length) return withText ? over(text, back) : back;
      const cs = getComputedStyle(nodes[i]);
      const c = paint(i + 1, over(parse(cs.backgroundColor), back), withText);
      const o = Number(cs.opacity);
      return o < 1 ? mix(c, back, o) : c;
    };
    const fg = lum(paint(0, [255, 255, 255, 1], true)), bg = lum(paint(0, [255, 255, 255, 1], false));
    return Math.round(((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)) * 100) / 100;
  };
};

/* ── Checks ─────────────────────────────────────────────────────────────── */
const CHECKS = {
  // V1: the host previews, opened on a full page load while signed in.
  async previews(b, base) {
    for (const path of ['/events/e1/preview-site', '/events/e1/preview-announce/invitation']) {
      const { ctx, p } = await page(b, base, { delayEvents: 1200 });
      await p.goto(base + path, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(4000);
      const url = new URL(p.url()).pathname;
      ok(url === path, `${path} stays on the preview when signed in`, `landed on ${url}`);
      await ctx.close();
    }
  },

  // V4: every stat tile's label passes AA on its own tile's ground.
  async rsvpStats(b, base) {
    const { ctx, p } = await page(b, base, { width: 390 });
    await p.goto(base + '/events/e1/rsvps', { waitUntil: 'domcontentloaded' });
    await p.locator('[data-tour="rsvps.stats"]').waitFor({ timeout: 15000 });
    const rows = await p.evaluate(() => [...document.querySelectorAll('[data-tour="rsvps.stats"] > *')].map(t => {
      const label = t.lastElementChild;
      return { text: label.textContent.trim(), ratio: window.__contrast(label) };
    }));
    ok(rows.length >= 4, 'found the stat tiles', String(rows.length));
    for (const r of rows) ok(r.ratio >= 4.5, `"${r.text}" label ≥ 4.5:1 on its tile`, `${r.ratio}:1`);
    await ctx.close();
  },

  // V5: a done task is marked by its title; its buttons keep full contrast.
  async tasksDone(b, base) {
    const { ctx, p } = await page(b, base, { width: 390 });
    await p.goto(base + '/events/e1/tasks', { waitUntil: 'domcontentloaded' });
    const card = p.locator('[class*=taskDone]').first();
    await card.waitFor({ timeout: 15000 });
    const m = await card.evaluate((c) => ({
      title: window.__contrast(c.querySelector('[class*=taskTitle]')),
      strike: getComputedStyle(c.querySelector('[class*=taskTitle]')).textDecorationLine,
      buttons: [...c.querySelectorAll('button')].map(btn => ({ name: btn.getAttribute('aria-label') || btn.textContent.trim(), ratio: window.__contrast(btn) })),
    }));
    ok(m.strike.includes('line-through'), 'the done title is struck through');
    ok(m.title >= 4.5, 'the done title is still readable', `${m.title}:1`);
    ok(m.buttons.length >= 3, 'found the card\'s buttons', String(m.buttons.length));
    for (const x of m.buttons) ok(x.ratio >= 4.5, `button "${x.name}" ≥ 4.5:1`, `${x.ratio}:1`);
    await ctx.close();
  },

  // V6: opening the guest list does not jump the page down to the form.
  async guestsArrive(b, base) {
    const { ctx, p } = await page(b, base, { width: 390, height: 800, touch: true });
    await p.goto(base + '/events/e1/guests', { waitUntil: 'domcontentloaded' });
    await p.getByPlaceholder('שם ושם משפחה').waitFor({ timeout: 15000 });
    await p.waitForTimeout(1500);
    const m = await p.evaluate(() => ({ y: Math.round(scrollY), focused: document.activeElement?.tagName }));
    ok(m.y === 0, 'the page stays at the top on arrival', `scrollY=${m.y}, focus on ${m.focused}`);
    await p.getByRole('button', { name: /פשוט להקליד בעצמכם/ }).click();
    await p.waitForTimeout(600);
    const f = await p.evaluate(() => document.activeElement?.getAttribute('placeholder'));
    ok(f === 'שם ושם משפחה', 'choosing manual entry focuses the name field', String(f));
    await ctx.close();
  },

  // V2: the responses list does not scroll sideways on a phone.
  async rsvpScroll(b, base) {
    for (const width of [360, 390, 412, 800, 1280]) {
      const { ctx, p } = await page(b, base, { width });
      await p.goto(base + '/events/e1/rsvps', { waitUntil: 'domcontentloaded' });
      await p.getByText('זוהה לפי שם', { exact: false }).first().waitFor({ timeout: 15000 });
      const x = await hscroll(p);
      const name = await p.evaluate(() => {
        const el = [...document.querySelectorAll('span')].find(s => s.textContent.startsWith('זוהה לפי שם'));
        const row = el.closest('[class*=gRow]');
        const nm = row.querySelector('[class*=gName]').getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return { nameW: Math.round(nm.width), left: Math.round(r.left), right: Math.round(r.right), W: innerWidth };
      });
      ok(x === 0, `${width}px: /rsvps does not scroll sideways`, `scrollX=${x}`);
      ok(name.left >= 0 && name.right <= name.W, `${width}px: the name-match reason fits the viewport`, JSON.stringify(name));
      ok(name.nameW >= 80, `${width}px: the guest's own name keeps room`, `${name.nameW}px`);
      await ctx.close();
    }
  },
};

const want = process.argv.slice(2);
const names = want.length ? want : Object.keys(CHECKS);
for (const n of names) if (!CHECKS[n]) { console.error(`no check "${n}". Known: ${Object.keys(CHECKS).join(', ')}`); process.exit(2); }

let server = null;
let base = process.env.BASE;
if (!base) {
  server = await startDev(PORT, { VITE_SUPABASE_URL: 'https://stub.supabase.co', VITE_SUPABASE_ANON_KEY: 'stub-anon-key' }, ROOT);
  base = server.base;
}
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
try {
  for (const n of names) {
    console.log(`\n${n}`);
    try { await CHECKS[n](b, base); }
    catch (e) { ok(false, `${n} ran to the end`, e.message.split('\n')[0]); }
  }
} finally {
  await b.close();
  server?.stop();
}
console.log(`\n${fails ? fails + ' FAILED' : 'all passed'} (${names.length} check${names.length > 1 ? 's' : ''})`);
process.exit(fails ? 1 : 0);
