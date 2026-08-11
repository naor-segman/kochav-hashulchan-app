/* Click→paint for the seating table cards, measured with the Event Timing API.
   `duration` on a PerformanceEventTiming entry runs from the input hardware
   timestamp to the next paint after the handler — i.e. exactly "I clicked and
   the screen changed" — rounded to 8 ms by the spec.

   Usage:  node qa/seatingPerf.mjs [stress|realistic] [label]
*/
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');
import { REALISTIC, STRESS, STORE_KEY, seedScript } from './seatingFixtures.mjs';

// QA_BASE lets the same probe run against `vite preview` (the production
// build), where React does not double-render every component in StrictMode.
const BASE = process.env.QA_BASE || 'http://127.0.0.1:5188';
const WHICH = process.argv[2] || 'stress';
const LABEL = process.argv[3] || WHICH;
const EVENT = WHICH === 'realistic' ? REALISTIC : STRESS;

const OBSERVER = () => {
  window.__clicks = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.name === 'click' || e.name === 'pointerup') {
        window.__clicks.push({
          name: e.name,
          duration: e.duration,                         // input → next paint
          processing: e.processingEnd - e.processingStart, // JS handler only
        });
      }
    }
  }).observe({ type: 'event', durationThreshold: 0, buffered: true });
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('  ! pageerror:', e.message));

await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
await p.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, seedScript(EVENT)]);
await p.goto(BASE + '/events/e1/seating', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);

const domCount = () => p.evaluate(() => document.querySelectorAll('*').length);

// Locate controls by class fragment — CSS Modules hash the suffix, and the
// header element changed from a <button> to a wrapper during this work, so the
// probe accepts either shape.
const headHandles = async () => p.$$(
  '[class*="tCardToggle"], button[class*="tCardHead"]'
);
const expandAllBtn = async () => (await p.$$('[class*="expandAllBtn"]'))[0];
const collapseAllBtn = async () => (await p.$$('[class*="collapseAllBtn"]'))[0];

async function measure(label, act) {
  await p.evaluate(() => { window.__clicks = []; });
  await act();
  await p.waitForTimeout(1200);
  const cl = await p.evaluate(() => window.__clicks);
  const click = cl.filter(c => c.name === 'click').pop();
  const dom = await domCount();
  console.log(`  ${label.padEnd(34)} click→paint ${String(Math.round(click?.duration ?? -1)).padStart(4)} ms   (handler ${String(Math.round(click?.processing ?? -1)).padStart(4)} ms)   DOM ${dom}`);
  return click?.duration ?? -1;
}

console.log(`\n── ${LABEL}: ${EVENT.guests.length} guest rows · ${EVENT.tables.length} tables ──`);
await p.evaluate(OBSERVER);
console.log(`  collapsed DOM nodes: ${await domCount()}`);

// 1. Expand a single card, five different cards in a row.
const single = [];
let heads = await headHandles();
for (let i = 0; i < 5 && i < heads.length; i++) {
  heads = await headHandles();
  await heads[i].scrollIntoViewIfNeeded();
  single.push(await measure(`expand card #${i + 1}`, () => heads[i].click()));
}
// Collapse them again so expand-all starts from a clean state.
for (let i = 0; i < single.length; i++) {
  heads = await headHandles();
  await heads[i].scrollIntoViewIfNeeded().catch(() => {});
  await heads[i].click().catch(() => {});
  await p.waitForTimeout(150);
}
await p.waitForTimeout(500);
await p.evaluate(() => window.scrollTo(0, 0));

// 2. Expand-all — the case the warning is about.
const ea = await expandAllBtn();
let all = -1;
if (ea) {
  await ea.scrollIntoViewIfNeeded();
  all = await measure('EXPAND ALL', () => ea.click());
} else {
  console.log('  (no expand-all button found)');
}

// 3. Collapse-all, when present.
const ca = await collapseAllBtn();
if (ca) {
  await ca.scrollIntoViewIfNeeded();
  await measure('COLLAPSE ALL', () => ca.click());
}

// 4. And a single-card click while everything is open — the worst case.
if (ea) {
  const ea2 = await expandAllBtn();
  if (ea2) { await ea2.scrollIntoViewIfNeeded(); await ea2.click(); await p.waitForTimeout(1500); }
  heads = await headHandles();
  if (heads[0]) {
    await heads[0].scrollIntoViewIfNeeded();
    await measure('collapse one while all open', () => heads[0].click());
  }
}

const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(`\n  single-card expand: min ${Math.round(Math.min(...single))} / median ${Math.round(med(single))} / max ${Math.round(Math.max(...single))} ms`);
console.log(`  expand-all:         ${Math.round(all)} ms\n`);

await b.close();
