// The admin events list past its cap, driven rather than reasoned about.
//
// THE BUG: the screen loads `.limit(500)` and printed the size of that WINDOW
// as if it were the table. On 1,240 events it read "500 אירועים", full stop —
// a wrong answer to the only question the screen is asked. It could not have
// known better either: nothing requested an exact count, so `rows.length===500`
// meant "500 events" and "at least 500 events" equally.
//
// The case that actually bites is the empty one. AdminUsersScreen links here as
// ?owner=<email>; the search runs client-side over the loaded window, so a
// customer whose events all sit outside it produced "לא נמצאו תוצאות" — which
// reads as "this customer has no events".
//
// Needs the preview server and ?bulk=1240, which pads the mock's events table:
//   npx vite --config vite.admin-preview.config.js --port 5190
//   node qa/adminTruncation.mjs
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.ADMIN_BASE || 'http://127.0.0.1:5190';

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

async function open(query, vp = { width: 1280, height: 900 }) {
  const p = await b.newPage({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await p.goto(BASE + '/admin/events' + query, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);
  return { p, errs };
}

const countText = (p) => p.evaluate(() =>
  document.querySelector('[class*=resultCount]')?.textContent.replace(/\s+/g, ' ').trim() ?? null);

// ── Past the cap ─────────────────────────────────────────────────────────────
console.log('── 1,240 events, a 500-row window');
{
  const { p, errs } = await open('?bulk=1240');
  const t = await countText(p);
  const rows = await p.evaluate(() => document.querySelectorAll('tbody tr').length);

  ok(rows === 500, 'the window really is 500 rows', String(rows));
  ok(/1,240/.test(t || ''), 'the count names the TRUE total', t || '(no count)');
  ok(/מוצגים 500/.test(t || ''), 'and says the list is a window', t || '');
  // The exact defect: the window presented as the whole table.
  ok(!/^500 אירועים$/.test(t || ''), 'not "500 אירועים" full stop', t || '');
  ok(errs.length === 0, 'no page error', errs[0] || '');
  await p.close();
}

// ── Bidi: the VISUAL order, not the DOM order ────────────────────────────────
//
// This codebase has already shipped "{a} / {b}" rendering as `300 / 250` for a
// DOM value of `250 / 300` — bidi rule N1 resolved the neutrals around the
// slash as RTL. The line here is now two numbers, a Hebrew word, a "·" and a
// third number, which is more neutrals than the line that broke. Measured with
// Range rects: in RTL the earlier run must sit to the RIGHT of the later one.
console.log('\n── the numbers read in the right order on screen');
{
  const { p } = await open('?bulk=1240');
  const r = await p.evaluate(() => {
    const el = document.querySelector('[class*=resultCount]');
    // Returns empty rather than throwing when the count line is absent. A
    // missing element is a FAILURE to report, not a crash that takes the rest
    // of the run with it — `createTreeWalker(null)` threw and killed the
    // process mid-mutation, hiding which check had actually failed.
    if (!el) return {};
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const hits = {};
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      for (const [key, needle] of [['win', '500'], ['total', '1,240']]) {
        const i = n.textContent.indexOf(needle);
        if (i < 0 || hits[key]) continue;
        const range = document.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + needle.length);
        const box = range.getBoundingClientRect();
        hits[key] = Math.round(box.right);
      }
    }
    return hits;
  });
  // "500 מתוך 1,240": 500 is the earlier run, so in RTL it is further right.
  ok(r.win != null && r.total != null, 'found both numbers on screen', JSON.stringify(r));
  ok(r.win > r.total, '"500" sits to the right of "1,240" — reads as 500 of 1,240',
     `500@${r.win}px  1,240@${r.total}px`);
  await p.close();
}

// ── The empty search, which is where it actually misleads ────────────────────
console.log('\n── a customer whose events are outside the window');
{
  const { p, errs } = await open('?bulk=1240&owner=nobody@example.com');
  await p.evaluate(() => {
    const i = document.querySelector('input[type=text]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, 'zzzz-no-such-event');
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(700);
  const box = await p.evaluate(() =>
    document.querySelector('[class*=stateBox]')?.innerText.replace(/\s+/g, ' ').trim() ?? null);

  ok(box !== null, 'the empty state rendered');
  ok(/לא נמצאו תוצאות/.test(box || ''), 'it still says nothing matched');
  ok(/500/.test(box || '') && /1,240/.test(box || ''),
     'and says WHAT it searched, so this does not read as "no events"', box || '');
  ok(errs.length === 0, 'no page error', errs[0] || '');
  await p.close();
}

// ── Under the cap: the notice must NOT appear ────────────────────────────────
console.log('\n── 8 events, no cap reached (the notice must stay away)');
{
  const { p, errs } = await open('');
  const t = await countText(p);
  ok(/8 אירועים/.test(t || ''), 'plain count, no "מתוך"', t || '');
  ok(!/מוצגים/.test(t || ''), 'no truncation note on a complete list', t || '');

  await p.evaluate(() => {
    const i = document.querySelector('input[type=text]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, 'zzzz-no-such-event');
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(700);
  const box = await p.evaluate(() =>
    document.querySelector('[class*=stateBox]')?.innerText.replace(/\s+/g, ' ').trim() ?? '');
  ok(/נסה לשנות/.test(box), 'the plain empty hint, not the truncation one', box);
  ok(errs.length === 0, 'no page error', errs[0] || '');
  await p.close();
}

// ── The toolbar has to survive the longer line on a phone ────────────────────
console.log('\n── 390px: the note doubled the length of that line');
{
  const { p, errs } = await open('?bulk=1240', { width: 390, height: 844 });
  // NOT scrollWidth — an internally scrollable child inflates it on every
  // ancestor. Whether the PAGE scrolls sideways is the only real question.
  const moved = await p.evaluate(() => {
    window.scrollTo(9999, 0);
    const x = window.scrollX;
    window.scrollTo(0, 0);
    return x;
  });
  const t = await countText(p);
  ok(moved === 0, 'the page does not scroll sideways', 'scrollX=' + moved);
  ok(/1,240/.test(t || '') && /מוצגים 500/.test(t || ''), 'the whole note is still there', t || '');
  ok(errs.length === 0, 'no page error', errs[0] || '');
  await p.close();
}

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
