// The first-visit guided tour (WORKPLAN 124, owner 2.10 #13), driven in a real
// browser on EVERY screen that has one — 21 tours — on an empty event (a real
// first visit: nothing in it yet) and on a full one, at 390 and 1280.
//
// Per step it reads back, from the page: the lit box sits on the part the step
// names (within 8px — the box is the part plus 6px of padding); the card is
// fully on screen and does not cover the part unless the part is taller than
// the screen; the step counter says "N מתוך M"; focus is on the forward
// button; nothing scrolls sideways. Then the last button ends it and it is
// remembered. Once per width: a click outside the card does nothing, the arrow
// keys walk it (RTL), Escape ends it, it does not open by itself twice, the
// replay button opens it again and focus comes back to that button.
//
// The app skips the tour in an automated browser (navigator.webdriver), so
// every other harness keeps working; this one launches Chromium with that flag
// off, and checks at the end that an ordinary automated browser gets no tour.
// Screenshots go to SHOTS (default qa/shots, ignored by git).
//
//   node qa/guidedTour.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const OUT = mkdtempSync(join(tmpdir(), 'tour-'));
const SHOTS = process.env.SHOTS || join(ROOT, 'qa/shots');
mkdirSync(SHOTS, { recursive: true });

let fails = 0;
const notes = [];
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

// A 1×1 PNG — enough for the floor plan to count as "has a sketch".
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const guests = Array.from({ length: 14 }, (_, i) => ({
  id: 'g' + i, name: ['טל שוורץ', 'נועה לוי', 'משפחת כהן', 'אבי מזרחי', 'רותם בר', 'שירן אזולאי', 'יואב פרץ'][i % 7] + (i > 6 ? ' ' + (i - 6) : ''),
  phone: i % 3 ? '05012345' + String(10 + i) : '',
  side: i % 2 ? 'groom' : 'bride', group: i % 3 ? 'חברים' : 'משפחה', count: (i % 3) + 1,
  rsvp: ['confirmed', 'pending', 'declined', 'confirmed'][i % 4], meal: 'regular',
}));
const FULL = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01', venue: 'אולמי הגן',
  brideName: 'דנה', groomName: 'יוסי', guests,
  tables: [1, 2, 3].map(n => ({ id: 't' + n, name: 'שולחן ' + n, capacity: 10, type: 'regular', shape: 'round' })),
  seating: { g0: 't1', g1: 't1', g3: 't2', g4: 't2', g6: 't3' },
  constraints: [{ id: 'c1', type: 'together', guestA: 'g0', guestB: 'g1' }, { id: 'c2', type: 'apart', guestA: 'g3', guestB: 'g6' }],
  tasks: [{ id: 'k1', title: 'לסגור צלם', status: 'todo', priority: 'high', due: '2027-01-01' }],
  vendors: [{ id: 'v1', name: 'צלם', category: 'צילום', status: 'quote', price: 6000, paid: 1000 }],
  costs: { categories: [{ id: 'k1', name: 'אולם', planned: 50000, actual: 20000 }] },
  floorPlan: { image: PNG, tablePositions: {} },
};
const EMPTY = { id: 'e2', name: 'אירוע חדש לגמרי', type: 'חתונה', guests: [], tables: [], seating: {} };

// [tour key, path, which event] — every tour in src/data/tours.js.
const SCREENS = [
  ['hub', '/events/:id'], ['setup', '/events/:id/setup'], ['guests', '/events/:id/guests'],
  ['tables', '/events/:id/tables'], ['constraints', '/events/:id/constraints'],
  ['seating', '/events/:id/seating'], ['rsvps', '/events/:id/rsvps'], ['collab', '/events/:id/collab'],
  ['tasks', '/events/:id/tasks'], ['costs', '/events/:id/costs'], ['vendors', '/events/:id/vendors'],
  ['announce', '/events/:id/announce'], ['site', '/events/:id/site'], ['share', '/events/:id/share'],
  ['messages', '/events/:id/messages'], ['nametags', '/events/:id/nametags'], ['album', '/events/:id/album'],
  ['entrance', '/events/:id/entrance'],
];

execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
});
const server = await startPreview(4741, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
});

const state = (p) => p.evaluate(() => {
  const card = document.querySelector('[role="dialog"][aria-modal="true"][data-side]');
  if (!card) return null;
  const spot = card.parentElement.querySelector('[class*="spot"]');
  const c = card.getBoundingClientRect();
  const s = spot?.getBoundingClientRect() || null;
  const t = card.dataset.target;
  const el = t ? document.querySelector(`[data-tour="${t}"]`) : null;
  // A data-tour-fit part is lit around its children, so measure it that way.
  let r = el?.getBoundingClientRect() || null;
  if (el?.hasAttribute('data-tour-fit')) {
    const cs = [...el.children].map(c => c.getBoundingClientRect()).filter(c => c.width || c.height);
    if (cs.length) r = { top: Math.min(...cs.map(c => c.top)), bottom: Math.max(...cs.map(c => c.bottom)),
                         left: Math.min(...cs.map(c => c.left)), right: Math.max(...cs.map(c => c.right)) };
  }
  // The bottom of the bars stuck to the top of the screen — the light must
  // never sit under them (3.10: the guest list's first part did).
  let sticky = 0;
  [...document.querySelectorAll('header, nav')].map(h => ({ h, b: h.getBoundingClientRect() }))
    .filter(({ h, b }) => b.height > 0 && /sticky|fixed/.test(getComputedStyle(h).position))
    .sort((a, b) => a.b.top - b.b.top)
    .forEach(({ b }) => { if (b.top <= sticky + 2) sticky = Math.max(sticky, b.bottom); });
  const bar = el?.closest('header, nav');
  const inBar = !!bar && /sticky|fixed/.test(getComputedStyle(bar).position);
  return {
    title: card.querySelector('h2')?.textContent || '',
    count: card.querySelector('[class*="count"]')?.textContent || '',
    target: t || null, sticky, inBar,
    part: r && { top: r.top, left: r.left, bottom: r.bottom, right: r.right },
    card: { top: c.top, left: c.left, bottom: c.bottom, right: c.right },
    spot: s && { top: s.top, left: s.left, bottom: s.bottom, right: s.right, height: s.height },
    vw: innerWidth, vh: innerHeight,
    focus: document.activeElement?.textContent?.trim().slice(0, 20) || '',
  };
});
const hScroll = (p) => p.evaluate(() => { scrollTo({ left: -1e5, behavior: 'instant' }); const x = scrollX; scrollTo({ left: 0, behavior: 'instant' }); return x; });
const seen = (p, key) => p.evaluate(k => JSON.parse(localStorage.getItem('kochav_tour_v1') || '{}')[k] === 1, key);

/** Walk one open tour to the end with "הבא", checking every step. */
async function walk(p, label, w, shotAll) {
  await p.waitForSelector('[role="dialog"][aria-modal="true"][data-side]', { timeout: 8000 }).catch(() => {});
  let st = await state(p);
  ok(!!st, `${label}: opens by itself on the first visit`);
  if (!st) return;
  const m = /^1 מתוך (\d+)$/.exec(st.count);
  ok(!!m, `${label}: starts at step 1`, st.count);
  const total = m ? +m[1] : 1;
  if (total < 3) notes.push(`${label}: only ${total} step(s) on this page`);
  for (let n = 1; n <= total; n++) {
    await p.waitForTimeout(420);
    st = await state(p);
    const tag = `${label} ${n}/${total} "${st.title}"`;
    ok(st.count === `${n} מתוך ${total}`, `${tag}: counter`, st.count);
    const inView = st.card.top >= 0 && st.card.left >= 0 && st.card.bottom <= st.vh + 0.5 && st.card.right <= st.vw + 0.5;
    ok(inView, `${tag}: card on screen`, JSON.stringify(st.card));
    if (st.target) {
      ok(!!st.part, `${tag}: its part "${st.target}" is on the page`);
      if (st.spot && st.part) {
        // Edges: the light may be pulled in to keep its ring on the screen,
        // its top kept under the sticky bars, and — for a part too tall to
        // share the screen with the card — its bottom trimmed above the card.
        const top0 = st.inBar ? 0 : st.sticky;
        const cardH = st.card.bottom - st.card.top;
        const tooTall = (st.part.bottom - st.part.top) + 14 + cardH > st.vh - top0 - 28;
        const near = (k, slack) => Math.abs(st.part[k] - st.spot[k]) <= 8 || slack;
        const ok4 = near('left', st.part.left < 16 && st.spot.left >= 8)
          && near('right', st.part.right > st.vw - 16 && st.spot.right <= st.vw - 8)
          && near('top', st.part.top < top0 + 10 && st.spot.top >= top0)
          && near('bottom', tooTall || st.part.bottom > st.vh - 10);
        ok(ok4, `${tag}: the light is on its part`, JSON.stringify({ part: st.part, spot: st.spot }));
        ok(st.inBar || st.spot.top >= st.sticky, `${tag}: the light is not under the sticky bars`, `spot ${Math.round(st.spot.top)} < bars ${Math.round(st.sticky)}`);
        ok(st.spot.left >= 6 && st.spot.right <= st.vw - 6, `${tag}: the ring is on the screen`, `${Math.round(st.spot.left)}–${Math.round(st.spot.right)}`);
        // The card never sits on the light — a too-tall part's light now ends
        // above the card instead (3.10 visual review).
        const overlap = !(st.card.bottom <= st.spot.top || st.card.top >= st.spot.bottom);
        ok(!overlap, `${tag}: card does not cover the light`, overlap ? `part ${Math.round(st.part.bottom - st.part.top)}px` : '');
      }
    }
    ok(/^(הבא|הבנתי|בואו נתחיל)/.test(st.focus), `${tag}: focus on the forward button`, st.focus);
    ok(await hScroll(p) === 0, `${tag}: no sideways scroll`);
    if (shotAll || n === 1) await p.screenshot({ path: join(SHOTS, `tour-${label.replace(/\W+/g, '_')}-${w}-${n}.png`) });
    await p.locator('[role="dialog"][data-side] button').last().click();
  }
  await p.waitForTimeout(250);
  ok(!(await state(p)), `${label}: the last button ends it`);
}

async function context(w, events) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w === 390 ? 844 : 860 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await p.goto(server.base + '/home');
  await p.evaluate(evs => {
    localStorage.clear();
    if (evs.length) localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: evs, activeEventId: evs[0].id }));
  }, events);
  return { ctx, p, errs };
}

try {
  for (const w of [390, 1280]) {
    console.log(`\n══ @${w}`);

    // ── A brand-new host: no events at all → the start form.
    {
      const { ctx, p, errs } = await context(w, []);
      ok(await p.evaluate(() => navigator.webdriver) === false, 'this browser is not flagged as automated (the tour may open)');
      console.log('── start');
      await p.goto(server.base + '/app');
      await walk(p, 'start', w, w === 390);
      ok(await seen(p, 'start'), 'start: remembered');
      ok(errs.length === 0, 'start: no page errors', errs.join(' | '));
      await ctx.close();
    }

    for (const [kind, ev] of [['empty', EMPTY], ['full', FULL]]) {
      const { ctx, p, errs } = await context(w, kind === 'full' ? [FULL, EMPTY] : [EMPTY]);
      console.log(`\n── ${kind} event`);
      await p.goto(server.base + '/app');
      await walk(p, `dashboard(${kind})`, w, w === 390 && kind === 'full');
      for (const [key, path] of SCREENS) {
        await p.goto(server.base + path.replace(':id', ev.id));
        await walk(p, `${key}(${kind})`, w, w === 390 && kind === 'full');
        ok(await seen(p, key), `${key}(${kind}): remembered`);
      }
      if (kind === 'full') {
        // The sketch editor's own tour opens the first time it is shown.
        await p.goto(server.base + '/events/e1/tables');
        await p.waitForTimeout(900);
        await p.getByRole('button', { name: /מפת אולם/ }).first().click();
        await walk(p, 'floorplan(full)', w, w === 390);
        ok(await seen(p, 'floorplan'), 'floorplan: remembered');
        // Replayed from the editor's own button, and its steps are not
        // repeated by the tables tour any more (3.10 verification run).
        await p.getByRole('button', { name: 'סיור בעורך הסקיצה' }).click();
        await p.waitForSelector('[role="dialog"][data-side]', { timeout: 3000 }).catch(() => {});
        const fp = await state(p);
        ok(!!fp && /^1 מתוך 4$/.test(fp.count), 'floorplan: "סיור" in the editor opens its 4 steps again', fp?.count);
        if (fp) await p.keyboard.press('Escape');
        await p.getByRole('button', { name: 'סיור במסך הזה' }).click();
        await p.waitForSelector('[role="dialog"][data-side]', { timeout: 3000 }).catch(() => {});
        const tb = await state(p);
        const titles = [];
        if (tb) {
          const n = +/מתוך (\d+)/.exec(tb.count)[1];
          for (let k = 0; k < n; k++) { titles.push((await state(p)).title); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(120); }
          await p.keyboard.press('Escape');
        }
        ok(!titles.includes('המפה עצמה'), 'the tables tour on the map tab does not repeat the sketch steps', titles.join(' | '));
      }
      ok(errs.length === 0, `${kind}: no page errors`, errs.join(' | '));
      await ctx.close();
    }

    // ── The controls, once per width, on a screen in the Shell and on the door.
    console.log('\n── controls');
    const { ctx, p, errs } = await context(w, [FULL]);
    await p.goto(server.base + '/events/e1/guests');
    await p.waitForSelector('[role="dialog"][data-side]', { timeout: 8000 }).catch(() => {});
    let st = await state(p);
    const before = p.url();
    await p.mouse.click(8, st.vh - 8);
    await p.waitForTimeout(200);
    ok(p.url() === before && !!(await state(p)), 'a click outside the card does nothing');
    // The keyboard cannot leave the card either (3.10: a review agent tabbed
    // to a guest's "מחקו" behind the scrim and deleted the guest).
    const guestsBefore = await p.evaluate(() => JSON.parse(localStorage.getItem('kochav_hashulchan_v1')).events[0].guests.length);
    let stayed = true;
    for (const key of ['Shift+Tab', 'Tab']) {
      for (let n = 0; n < 6 && stayed; n++) {
        await p.keyboard.press(key);
        stayed = await p.evaluate(() => !!document.activeElement?.closest('[role="dialog"][data-side]'));
        if (!stayed) ok(false, `${key} #${n + 1} stays in the card`);
      }
    }
    ok(stayed, 'Tab and Shift+Tab never leave the card (from a tap on the page, focus on <body>)');
    ok(await p.evaluate(() => document.getElementById('root')?.inert === true), 'the page is inert while the tour is open');
    ok(await p.evaluate(() => JSON.parse(localStorage.getItem('kochav_hashulchan_v1')).events[0].guests.length) === guestsBefore && p.url() === before, 'nothing on the page was reached by the keyboard');
    for (let n = 0; n < 8; n++) await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(150);
    st = await state(p);
    const total = +/מתוך (\d+)/.exec(st.count)[1];
    for (let n = 1; n < total; n++) { await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(80); }
    ok((await state(p)).count === `${total} מתוך ${total}`, 'ArrowLeft walks forward (RTL)');
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(150);
    ok((await state(p)).count === `${total - 1} מתוך ${total}`, 'ArrowRight goes back');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
    ok(!(await state(p)) && await seen(p, 'guests'), 'Escape ends it, and it is remembered');
    await p.reload();
    await p.waitForTimeout(1800);
    ok(!(await state(p)), 'does not open by itself a second time');
    for (const path of ['/events/e1/guests', '/events/e1/entrance']) {
      await p.goto(server.base + path);
      await p.waitForTimeout(1800);
      if (await state(p)) await p.keyboard.press('Escape');
      await p.getByRole('button', { name: 'סיור במסך הזה' }).click();
      await p.waitForSelector('[role="dialog"][data-side]', { timeout: 3000 }).catch(() => {});
      ok(!!(await state(p)), `${path}: "סיור במסך" opens it again`);
      await p.getByRole('button', { name: 'דלגו על ההסבר' }).click();
      await p.waitForTimeout(200);
      ok(!(await state(p)), `${path}: "דלגו" closes it`);
      ok(await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'סיור במסך הזה', `${path}: focus returns to the button`);
    }
    ok(errs.length === 0, 'controls: no page errors', errs.join(' | '));
    await ctx.close();
  }

  // ── A real phone (touch: buttons get their 44px), 320–390 wide. The tour's
  // "?" must cost the event's name nothing: measured 3.10, it squeezed the
  // name from 27→0px at 320 and 52→8px at 390, and on the door 93→41px.
  // Compared against the same bar with the "?" taken out, so the check does
  // not depend on how long the name is.
  console.log('\n── phone bars');
  // 667–1024: a landscape phone and small tablets, where the label used to show.
  for (const pw of [320, 360, 390, 430, 667, 700, 768, 1024]) {
    const ctx = await browser.newContext({ viewport: { width: pw, height: 780 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.goto(server.base + '/home');
    await p.evaluate(ev => {
      localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: [ev], activeEventId: 'e1' }));
      localStorage.setItem('kochav_tour_v1', JSON.stringify({ guests: 1, entrance: 1 }));
    }, FULL);
    for (const [path, find] of [['/events/e1/guests', 'header a, header span'], ['/events/e1/entrance', 'header h1']]) {
      await p.goto(server.base + path);
      await p.waitForTimeout(900);
      const r = await p.evaluate((sel) => {
        const name = () => [...document.querySelectorAll(sel)].filter(x => x.textContent.trim().startsWith('החתונה של'))
          .map(x => x.getBoundingClientRect().width).sort((a, b) => a - b)[0] ?? -1;
        const btn = document.querySelector('[aria-label="סיור במסך הזה"]');
        const withBtn = name();
        // The bar before the tour: no "?", and the home link back in its place
        // (on a phone inside an event the "?" took that place — Shell.module.css).
        const home = document.querySelector('header a[href="/home"]');
        const homeHidden = home && getComputedStyle(home).display === 'none';
        if (btn) btn.style.display = 'none';
        if (homeHidden) home.style.display = 'inline-flex';
        const without = name();
        if (btn) btn.style.display = '';
        if (homeHidden) home.style.display = '';
        return { withBtn: Math.round(withBtn), without: Math.round(without), hasBtn: !!btn };
      }, find);
      ok(r.hasBtn && r.withBtn >= r.without - 2, `@${pw} ${path}: the "?" costs the event name nothing`, `${r.withBtn}px with, ${r.without}px without`);
    }
    await ctx.close();
  }

  // Every other harness runs in a browser flagged as automated. There the tour
  // must stay shut, or its overlay takes the clicks those harnesses make.
  console.log('\n── an ordinary automated browser (how every other harness runs)');
  const plain = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-proxy-server'],
  });
  try {
    const p = await (await plain.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    await p.goto(server.base + '/home');
    await p.evaluate(ev => localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: [ev], activeEventId: 'e1' })), FULL);
    for (const path of ['/events/e1/guests', '/events/e1/entrance']) {
      await p.goto(server.base + path);
      await p.waitForTimeout(1800);
      ok(!(await state(p)), `${path}: the tour does not open by itself`);
      ok(await p.getByRole('button', { name: 'סיור במסך הזה' }).count() === 1, `${path}: but the button to open it is there`);
    }
  } finally {
    await plain.close();
  }
} finally {
  await browser.close();
  await server.stop();
}
if (notes.length) console.log('\nnotes (not failures):\n  ' + notes.join('\n  '));
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
