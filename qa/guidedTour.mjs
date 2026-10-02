// The first-visit guided tour (WORKPLAN 124, owner 2.10 #13), driven in a real
// browser on the screens that have one, at 390 and 1280.
//
// Per step it reads back, from the page: the lit box sits on the part the step
// names (within 8px — the box is the part plus 6px of padding); the card is
// fully on screen and does not cover the part unless the part is taller than
// the screen; the step counter says "N מתוך M"; nothing scrolls sideways. Then:
// the page under the tour takes no clicks; Escape ends it; it does not open by
// itself a second time; "סיור במסך" opens it again; focus goes back.
//
// The app skips the tour in an automated browser (navigator.webdriver), so
// every other harness keeps working; this one launches Chromium with that flag
// off. Screenshots of every step go to SHOTS (default qa/shots, ignored by git).
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
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const guests = Array.from({ length: 14 }, (_, i) => ({
  id: 'g' + i, name: ['טל שוורץ', 'נועה לוי', 'משפחת כהן', 'אבי מזרחי', 'רותם בר', 'שירן אזולאי', 'יואב פרץ'][i % 7] + (i > 6 ? ' ' + (i - 6) : ''),
  side: i % 2 ? 'groom' : 'bride', group: i % 3 ? 'חברים' : 'משפחה', count: (i % 3) + 1,
  rsvp: ['confirmed', 'pending', 'declined', 'confirmed'][i % 4],
}));
const EVENT = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01', venue: 'אולמי הגן',
  brideName: 'דנה', groomName: 'יוסי',
  guests,
  tables: [1, 2, 3].map(n => ({ id: 't' + n, name: 'שולחן ' + n, capacity: 10, type: 'regular', shape: 'round' })),
  // Some seated, some waiting — so the seating tour has both parts to light.
  seating: { g0: 't1', g1: 't1', g3: 't2', g4: 't2', g6: 't3' },
};

const TOURS = {
  hub:     { path: '/events/e1',         steps: 5 },
  guests:  { path: '/events/e1/guests',  steps: 6 },
  seating: { path: '/events/e1/seating', steps: 4 },
};

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
  const card = document.querySelector('[role="dialog"][aria-modal="true"]');
  if (!card) return null;
  const spot = card.parentElement.querySelector('[class*="spot"]');
  const c = card.getBoundingClientRect();
  const s = spot?.getBoundingClientRect() || null;
  return {
    title: card.querySelector('h2')?.textContent || '',
    count: card.querySelector('[class*="count"]')?.textContent || '',
    card: { top: c.top, left: c.left, bottom: c.bottom, right: c.right },
    spot: s && { top: s.top, left: s.left, bottom: s.bottom, right: s.right, height: s.height },
    vw: innerWidth, vh: innerHeight,
    focus: document.activeElement?.textContent?.trim().slice(0, 20) || '',
  };
});
const hScroll = (p) => p.evaluate(() => { scrollTo({ left: -1e5, behavior: 'instant' }); const x = scrollX; scrollTo({ left: 0, behavior: 'instant' }); return x; });

try {
  for (const w of [390, 1280]) {
    console.log(`\n══ @${w}`);
    const ctx = await browser.newContext({ viewport: { width: w, height: w === 390 ? 844 : 860 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
    await p.goto(server.base + '/app');
    await p.evaluate(ev => {
      localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: [ev], activeEventId: 'e1' }));
      localStorage.setItem('kochav_orientation_v1', '1');
    }, EVENT);
    ok(await p.evaluate(() => navigator.webdriver) === false, 'this browser is not flagged as automated (the tour may open)');

    for (const [screen, t] of Object.entries(TOURS)) {
      console.log(`── ${screen}`);
      await p.goto(server.base + t.path);
      await p.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 5000 }).catch(() => {});
      let st = await state(p);
      ok(!!st, 'opens by itself on the first visit');
      if (!st) continue;
      ok(st.count === `1 מתוך ${t.steps}`, 'counter on the first step', st.count);

      for (let n = 1; n <= t.steps; n++) {
        await p.waitForTimeout(450);          // the move transition
        st = await state(p);
        if (st.spot) {
          // The lit box is the named part plus 6px — read the part's own box.
          const part = await p.evaluate(() => {
            const t = document.querySelector('[role="dialog"]').dataset.target;
            const r = document.querySelector(`[data-tour="${t}"]`)?.getBoundingClientRect();
            return r && { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
          });
          const fits = part && part.top >= 6 && part.bottom <= st.vh - 6;
          const near = part && ['left', 'right'].every(k => Math.abs(part[k] - st.spot[k]) <= 8)
            && (!fits || ['top', 'bottom'].every(k => Math.abs(part[k] - st.spot[k]) <= 8));
          ok(near, `step ${n}: the light is on its part`, JSON.stringify({ part, spot: st.spot }));
        }
        const inView = st.card.top >= 0 && st.card.left >= 0 && st.card.bottom <= st.vh + 0.5 && st.card.right <= st.vw + 0.5;
        ok(inView, `step ${n} "${st.title}": card fully on screen`, JSON.stringify(st.card));
        if (st.spot) {
          const overlap = !(st.card.bottom <= st.spot.top || st.card.top >= st.spot.bottom);
          const tall = st.spot.height > st.vh * 0.55;
          ok(!overlap || tall, `step ${n}: card does not cover the lit part`, tall ? 'part taller than half the screen' : '');
        }
        ok(st.focus.startsWith('הבא') || st.focus.startsWith('הבנתי') || st.focus.startsWith('בואו'), `step ${n}: focus on the forward button`, st.focus);
        ok(await hScroll(p) === 0, `step ${n}: no sideways scroll`);
        await p.screenshot({ path: join(SHOTS, `tour-${screen}-${w}-${n}.png`) });
        if (n === 1) {
          // A click on the page itself must not reach it.
          const before = p.url();
          await p.mouse.click(10, st.vh - 10);
          await p.waitForTimeout(200);
          ok(p.url() === before && !!(await state(p)), 'a click outside the card does nothing');
        }
        if (n < t.steps) await p.keyboard.press('ArrowLeft');      // RTL: left = forward
      }
      ok((await state(p)).count === `${t.steps} מתוך ${t.steps}`, 'ArrowLeft walked to the last step');
      await p.keyboard.press('ArrowRight');
      await p.waitForTimeout(300);
      ok((await state(p)).count === `${t.steps - 1} מתוך ${t.steps}`, 'ArrowRight goes back one');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      ok(!(await state(p)), 'Escape ends it');
      ok(await p.evaluate(s => JSON.parse(localStorage.getItem('kochav_tour_v1') || '{}')[s] === 1, screen), 'remembered as seen');

      await p.reload();
      await p.waitForTimeout(1600);
      ok(!(await state(p)), 'does not open by itself a second time');

      await p.getByRole('button', { name: 'סיור במסך הזה' }).click();
      await p.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 3000 }).catch(() => {});
      ok(!!(await state(p)), '"סיור במסך" opens it again');
      await p.getByRole('button', { name: 'דלגו על ההסבר' }).click();
      await p.waitForTimeout(200);
      ok(!(await state(p)), '"דלגו" closes it');
      ok(await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'סיור במסך הזה', 'focus returns to the button that opened it');
    }
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
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
    await p.goto(server.base + '/app');
    await p.evaluate(ev => localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: [ev], activeEventId: 'e1' })), EVENT);
    await p.goto(server.base + '/events/e1/guests');
    await p.waitForTimeout(1800);
    ok(await p.evaluate(() => navigator.webdriver) === true, 'flagged as automated');
    ok(!(await state(p)), 'the tour does not open by itself');
    ok(await p.getByRole('button', { name: 'סיור במסך הזה' }).count() === 1, 'but the button to open it is there');
  } finally {
    await plain.close();
  }
} finally {
  await browser.close();
  await server.stop();
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
