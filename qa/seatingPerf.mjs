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

/* ── 5. The placeholder geometry ──────────────────────────────────────────────
   TableCard renders an expanded-but-off-screen card as a placeholder of its
   estimated height. The comment on those numbers used to say they were
   "MEASURED heights of the real rows (see qa/seatingPerf.mjs)" while this file
   measured nothing of the kind — so the estimate could drift, and did, by 19%
   at 1280px and 39% at 390px. This section prints them, and the error the
   estimate actually makes, so the claim is checkable.

   The error that matters is end-to-end: the height the placeholder PROMISED
   versus the height the real body turned out to be. A negative total is the
   number of pixels the page grows under the host's thumb as they scroll. */

// A CSS-Modules class is `_name_hash_line`, so the probes below match the name
// and not the hash. The helper is re-declared inside each page function because
// those are serialised and cannot close over anything in this file.

async function geometry(vw) {
  const page = await (await b.newContext({ viewport: { width: vw, height: 900 } })).newPage();
  await page.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, seedScript(EVENT)]);
  await page.goto(BASE + '/events/e1/seating', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(WHICH === 'realistic' ? 3000 : 6000);

  await page.evaluate(() => {
    const has = (el, f) => [...el.classList].some(c => c.startsWith('_' + f + '_'));
    [...document.querySelectorAll('div')].filter(el => has(el, 'tCard'))
      .forEach((el, i) => el.setAttribute('data-qa-card', String(i)));
  });

  const btn = (await page.$$('[class*="expandAllBtn"]'))[0];
  if (!btn) { console.log('  (no expand-all button — geometry skipped)'); await page.close(); return; }
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.waitForTimeout(1200);

  // What the placeholders promise, before a single body has been built.
  const promised = await page.evaluate(() => {
    const has = (el, f) => [...el.classList].some(c => c.startsWith('_' + f + '_'));
    const out = {};
    for (const card of document.querySelectorAll('[data-qa-card]')) {
      const ph = [...card.children].find(el => has(el, 'tGuestListPending'));
      if (ph) out[card.getAttribute('data-qa-card')] = ph.getBoundingClientRect().height;
    }
    return out;
  });

  // Scroll the page end to end until every deferred body has been built.
  // `window.scrollTo(0, y)` alone does NOT work here: reset.css sets
  // `html { scroll-behavior: smooth }`, so a tight loop of scrollTo calls
  // animates and never arrives. behavior:'instant' overrides it.
  for (let pass = 0; pass < 8; pass++) {
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight + 2000; y += 300) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await new Promise(r => setTimeout(r, 25));
      }
    });
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => document.querySelectorAll('[class^="_tGuestListPending_"]').length))) break;
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(600);

  // What the bodies really are, piece by piece.
  const real = await page.evaluate(() => {
    const has = (el, f) => [...el.classList].some(c => c.startsWith('_' + f + '_'));
    const outer = el => {
      const cs = getComputedStyle(el);
      return el.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    };
    const out = {};
    const pieces = { row: [], rowSeats: [], actions: [], empty: [], add: [], padding: [], border: [] };
    for (const card of document.querySelectorAll('[data-qa-card]')) {
      const list = [...card.children].find(el => has(el, 'tGuestList'));
      if (!list) continue;
      out[card.getAttribute('data-qa-card')] = list.getBoundingClientRect().height;
      const cs = getComputedStyle(list);
      pieces.padding.push(parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom));
      pieces.border.push(parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth));
      for (const ch of list.children) {
        if      (has(ch, 'tAddGuestRow'))      pieces.add.push(outer(ch));
        else if (has(ch, 'tGuestListActions')) pieces.actions.push(outer(ch));
        else if (has(ch, 'emptyInline'))       pieces.empty.push(outer(ch));
        else if (has(ch, 'tGuestRow'))
          ([...ch.querySelectorAll('span')].some(s => has(s, 'seatNames'))
            ? pieces.rowSeats : pieces.row).push(outer(ch));
      }
    }
    const stat = a => a.length
      ? { n: a.length, min: Math.min(...a), max: Math.max(...a), mean: a.reduce((s, x) => s + x, 0) / a.length }
      : null;
    return { out, pieces: Object.fromEntries(Object.entries(pieces).map(([k, v]) => [k, stat(v)])) };
  });

  console.log(`\n── placeholder geometry @ ${vw}px — the numbers TableCard's constants claim ──`);
  const LABEL = {
    row: '.tGuestRow, single line', rowSeats: '.tGuestRow + companions line',
    actions: '.tGuestListActions', empty: '.emptyInline', add: 'add-a-guest row (incl. margin)',
    padding: '.tGuestList padding', border: '.tGuestList border',
  };
  for (const [k, v] of Object.entries(real.pieces))
    console.log(`  ${LABEL[k].padEnd(30)} ${v
      ? `n=${String(v.n).padStart(4)}   min ${v.min.toFixed(1).padStart(6)}   max ${v.max.toFixed(1).padStart(6)}   mean ${v.mean.toFixed(1).padStart(6)}`
      : '(not rendered by this fixture)'}`);

  const ids = Object.keys(promised).filter(k => real.out[k] != null);
  if (!ids.length) { console.log('  (no card showed a placeholder — nothing to compare)'); await page.close(); return; }
  const errs = ids.map(k => promised[k] - real.out[k]);
  const sum  = errs.reduce((a, x) => a + x, 0);
  const tot  = ids.reduce((a, k) => a + real.out[k], 0);
  console.log(`\n  placeholder vs real, over ${ids.length} cards:`);
  console.log(`    per card   min ${Math.min(...errs).toFixed(1)}px   max ${Math.max(...errs).toFixed(1)}px   mean ${(sum / errs.length).toFixed(1)}px`);
  console.log(`    total      promised ${Math.round(sum + tot)}px vs real ${Math.round(tot)}px  →  ${sum > 0 ? '+' : ''}${Math.round(sum)}px  (${(100 * sum / tot).toFixed(1)}%)`);
  console.log(`    i.e. the page ${sum < 0 ? 'GROWS' : 'shrinks'} ${Math.abs(Math.round(sum))}px as the host scrolls through it.`);
  await page.close();
}

// Desktop and phone, because the row heights are not the same on both: the
// companions line wraps on a narrow screen and a multi-seat row triples.
await geometry(1280);
await geometry(390);
console.log('');

await b.close();
