// Numeric pairs in the admin panel, measured as GLYPHS on screen.
//
// THE BUG: a spaced slash between two numbers leaves only NEUTRALS between
// them, so bidi rule N1 resolves the whole run as RTL and reverses it. A table
// seating 8 of 10 rendered `10 / 8` — which is not merely odd, it is a valid
// LTR fraction reading the wrong way round, i.e. an over-capacity table.
//
// This codebase has shipped this exact defect before ("250 / 300" rendering as
// "300 / 250"), and the fix was applied to the stat chip on THIS SCREEN and
// missed the table cards thirty lines below it.
//
// So the check is per-character Range rects, not a string comparison: the DOM
// order was correct the whole time — it is the painted order that was wrong.
//
//   npx vite --config vite.admin-preview.config.js --port 5190
//   node qa/adminBidi.mjs
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
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
await p.goto(BASE + '/admin/events/e0', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2400);

/** The ASCII/digit runs of an element, in left-to-right SCREEN order. */
async function glyphOrder(selector) {
  return p.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const marks = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      for (let i = 0; i < n.textContent.length; i++) {
        const ch = n.textContent[i];
        if (!/[0-9/]/.test(ch)) continue;
        const r = document.createRange();
        r.setStart(n, i); r.setEnd(n, i + 1);
        const box = r.getBoundingClientRect();
        if (box.width === 0) continue;
        marks.push({ ch, x: box.left });
      }
    }
    return marks.sort((a, b) => a.x - b.x).map(m => m.ch).join('');
  }, selector);
}

console.log('── the table cards');
{
  const painted = await glyphOrder('[class*=tableCapacity]');
  const dom = await p.evaluate(() =>
    (document.querySelector('[class*=tableCapacity]')?.textContent || '').replace(/[^0-9/]/g, ''));
  ok(painted !== null, 'found a table card');
  // The whole point: the DOM was already right, so comparing strings proves
  // nothing. What must hold is that the painted order matches the DOM order.
  ok(painted === dom, 'the fraction paints in the order it is written',
     `dom=${dom}  screen=${painted}`);
}

console.log('\n── the stat chip, which was fixed earlier and must stay fixed');
{
  const painted = await glyphOrder('[class*=statChipValue]');
  const dom = await p.evaluate(() =>
    (document.querySelector('[class*=statChipValue]')?.textContent || '').replace(/[^0-9/]/g, ''));
  ok(painted === dom, 'still paints in order', `dom=${dom}  screen=${painted}`);
}

console.log('\n── and the Hebrew still reads right-to-left around it');
{
  // Isolating the number must not drag the sentence with it: "מקומות" belongs
  // to the LEFT of the fraction on an RTL line.
  const r = await p.evaluate(() => {
    const el = document.querySelector('[class*=tableCapacity]');
    if (!el) return null;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let word = null, digit = null;
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const i = n.textContent.indexOf('מקומות');
      if (i >= 0 && word === null) {
        const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 6);
        word = rg.getBoundingClientRect().left;
      }
      const d = n.textContent.search(/[0-9]/);
      if (d >= 0 && digit === null) {
        const rg = document.createRange(); rg.setStart(n, d); rg.setEnd(n, d + 1);
        digit = rg.getBoundingClientRect().left;
      }
    }
    return { word, digit };
  });
  const found = !!(r && r.word !== null && r.digit !== null);
  ok(found, 'found both parts', JSON.stringify(r));
  // Guarded: a missing element is a FAILURE to report, not a crash that takes
  // the rest of the run with it. The first version of this file died here.
  ok(found && r.word < r.digit, '"מקומות" sits to the LEFT of the number, as RTL requires',
     `word@${Math.round(r.word)}  number@${Math.round(r.digit)}`);
}

ok(errs.length === 0, 'no page error', errs[0] || '');
await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
