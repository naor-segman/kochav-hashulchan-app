// The EFFECTIVE tap target, which is not the element's box.
//
// This codebase deliberately grows hit areas with a ::after pseudo-element so a
// dense row keeps its visual size while a finger still gets 44px. A box
// measurement therefore reports false failures — and, worse, misses the real
// defect, which is two targets OVERLAPPING: the later sibling paints on top, so
// part of one control belongs to its neighbour and a tap opens the wrong thing.
//
// So this probes what the browser would actually dispatch to, with
// elementFromPoint, walking outward from each control's centre.
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5188';
const TARGETS = [
  ['header',  '/events/e1/guests', 'header button, header a'],
  ['footer',  '/',                 'footer a'],
  ['landing', '/',                 'header button, header a'],
  ['nametags','/events/e1/nametags','label'],
];

const EVENT = {
  id:'e1', name:'החתונה של דנה ויוסי', type:'חתונה', date:'2027-06-01',
  guests:[], tables:[], seating:{}, constraints:[], tasks:[], vendors:[], costs:{},
  tokens:{rsvp:'r1'}, createdAt:Date.now(), updatedAt:Date.now(),
};

const b = await chromium.launch({
  executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-proxy-server'],
});
const page = await b.newPage({
  viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, deviceScaleFactor:3,
});
await page.goto(BASE + '/app', { waitUntil:'domcontentloaded' });
await page.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
  JSON.stringify({ events:[e], activeEventId:'e1' })), EVENT);

let bad = 0;
for (const [name, path, sel] of TARGETS) {
  await page.goto(BASE + path, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1100);
  const rows = await page.evaluate((sel) => {
    const own = (el, x, y) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit) || (hit.closest && hit.closest('a,button,label') === el));
    };
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (!own(el, cx, cy)) continue;          // hidden behind something else entirely
      // Walk outward until the point stops belonging to this control.
      let up = 0, down = 0, lft = 0, rgt = 0;
      while (up   < 30 && own(el, cx, cy - up   - 1)) up++;
      while (down < 30 && own(el, cx, cy + down + 1)) down++;
      while (lft  < 40 && own(el, cx - lft  - 1, cy)) lft++;
      while (rgt  < 40 && own(el, cx + rgt  + 1, cy)) rgt++;
      out.push({
        label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g,' ').slice(0,26),
        h: up + down, w: lft + rgt,
        box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      });
    }
    return out;
  }, sel);

  console.log(`\n── ${name} (${path})`);
  for (const r of rows) {
    // The walk steps whole pixels out from a fractional centre, so it loses
    // one at each end: a genuine 44px box measures 43. Judged at 43, with the
    // raw box printed beside it so the reading can be checked.
    const ok = r.h >= 43 && r.w >= 43;
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} effective ${String(r.w).padStart(3)}x${String(r.h).padStart(3)}  box ${r.box.padEnd(9)} "${r.label}"`);
  }
}
await b.close();
console.log(`\n${bad} control(s) whose EFFECTIVE hit area is under 44px (43 after the 1px walk loss)`);
