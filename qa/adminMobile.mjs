// The admin panel on a 320px phone — the one surface nobody has ever opened
// on a phone, because it sits behind AdminGuard and this environment has no
// admin session. vite.admin-preview.config.js swaps in qa/supabaseMock.js so
// the tables are POPULATED; measuring an empty state proves nothing.
//
// Three things are measured, all by execution:
//   1. Horizontal overflow — by SCROLLING (window.scrollX), never scrollWidth.
//   2. The sticky topbar covering page content — the topbar's bottom edge
//      against the first content element's top edge.
//   3. Columns pushed off-screen inside each table, and whether the user is
//      told they can scroll. A column that is 100% off-screen with no
//      affordance is a feature that does not exist on a phone.
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.ADMIN_BASE || 'http://127.0.0.1:5190';
const ROUTES = [
  ['login',    '/admin/login'],
  ['dash',     '/admin/dashboard'],
  ['eventDet', '/admin/events/e0'],
  ['users',    '/admin/users'],
  ['events',   '/admin/events'],
  ['subs',     '/admin/subscriptions'],
  ['templates','/admin/templates'],
  ['activity', '/admin/activity'],
  ['errors',   '/admin/errors'],
  ['settings', '/admin/settings'],
];

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const page = await b.newPage({
  viewport: { width: 320, height: 568 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});

const rows = [];
for (const [name, path] of ROUTES) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const r = await page.evaluate(() => {
    const out = { coarse: matchMedia('(pointer: coarse)').matches };

    window.scrollTo(9999, 0); out.scrollX = window.scrollX; window.scrollTo(0, 0);

    // A bar covering the page below it. The admin topbars are NOT sticky, so
    // looking for sticky/fixed elements finds nothing and reports a clean
    // pass — the first version of this probe did exactly that. The real shape
    // is `height: 56px` + `flex-wrap: wrap`: at 320px the right-hand group
    // wraps to a second row the fixed height has no room for, and paints
    // straight over whatever comes next. So: any container whose children
    // spill past its own bottom edge.
    out.overlap = 0; out.spill = '';
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.height === 0 || getComputedStyle(el).overflow !== 'visible') continue;
      for (const c of el.children) {
        const cr = c.getBoundingClientRect();
        if (cr.height === 0) continue;
        const over = Math.round(cr.bottom - r.bottom);
        if (over > out.overlap) {
          out.overlap = over;
          out.spill = `${String(el.className).slice(0, 24)} h=${Math.round(r.height)} <- ${String(c.className).slice(0, 20)}`;
        }
      }
    }

    // Every horizontal scroller holding a table: how much is hidden, and is
    // any column entirely out of reach without scrolling.
    out.tables = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') continue;
      if (!el.querySelector('table')) continue;
      const hidden = el.scrollWidth - el.clientWidth;   // inside a real scroller this is legitimate
      const heads = [...el.querySelectorAll('thead th')].map(th => {
        const r = th.getBoundingClientRect();
        const w = el.getBoundingClientRect();
        // RTL: visible means the header box intersects the scroller's box.
        const vis = r.right > w.left + 1 && r.left < w.right - 1;
        return `${(th.textContent || '').trim().slice(0, 12)}:${vis ? 'vis' : 'OFF'}`;
      });
      out.tables.push({ hidden: Math.round(hidden), heads });
    }

    // Is the user told the table scrolls?
    const hint = [...document.querySelectorAll('[class*="scrollHint"]')]
      .filter(el => getComputedStyle(el).display !== 'none');
    out.hint = hint.length > 0 ? (hint[0].textContent || '').trim().slice(0, 40) : false;

    // Tap targets, measured as the browser would DISPATCH them, not as boxes.
    // The admin patch grows hit areas with an ::after pseudo-element on
    // purpose — a box measurement reports the drawn 26x25 and calls a
    // correctly-sized control a defect.
    const own = (el, x, y) => {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit) ||
             (hit.closest && hit.closest('a,button,label') === el));
    };
    out.small = [];
    for (const el of document.querySelectorAll('button, a[href], select, input, textarea, label')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      // A <label> sitting above its field is a caption. It focuses the field
      // when tapped, but the field itself is the target a finger goes for, and
      // that is what gets measured. Only a label that WRAPS a control (the
      // checkbox-row idiom) is judged as a target in its own right.
      if (el.tagName === 'LABEL' && !el.querySelector('input,select,textarea')) continue;
      // A checkbox inside a label that is itself big enough is reachable —
      // the label is the target, and flagging the 20px box inside it is the
      // box-measurement mistake in miniature.
      if (el.tagName === 'INPUT') {
        const lab = el.closest('label');
        if (lab) { const lr = lab.getBoundingClientRect();
                   if (lr.height >= 43 && lr.width >= 43) continue; }
      }
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (!own(el, cx, cy)) continue;          // off-screen or covered; not a size question
      let up = 0, down = 0, lft = 0, rgt = 0;
      while (up   < 30 && own(el, cx, cy - up   - 1)) up++;
      while (down < 30 && own(el, cx, cy + down + 1)) down++;
      while (lft  < 40 && own(el, cx - lft  - 1, cy)) lft++;
      while (rgt  < 40 && own(el, cx + rgt  + 1, cy)) rgt++;
      // The walk steps whole pixels from a fractional centre, so a true 44
      // measures 43. Judged at 43, with the drawn box printed beside it.
      if (up + down < 43 || lft + rgt < 43)
        out.small.push(`"${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 14)}" eff ${lft + rgt}x${up + down} box ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    out.small = [...new Set(out.small)].slice(0, 8);
    return out;
  });

  // A column being off-screen is only acceptable if scrolling the wrapper
  // actually reaches it. Scroll each table scroller to its far end and re-read
  // which headers are visible; anything still OFF is genuinely unreachable.
  r.unreachable = await page.evaluate(() => {
    const stuck = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if ((cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') || !el.querySelector('table')) continue;
      // Only the scroller that ACTUALLY scrolls. An ancestor with overflow-x
      // set but nothing to scroll still contains the inner table's headers,
      // and reports every one of them stuck — which is the probe's fault,
      // not the layout's.
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      const reached = new Set();
      // Sweep the whole range in viewport-sized steps, both directions —
      // RTL scrollLeft runs negative in Chromium. Sampling only the two ends
      // misses every middle column and calls it unreachable.
      const span = el.scrollWidth, step = Math.max(40, Math.floor(el.clientWidth / 2));
      const stops = [];
      for (let x = 0; x <= span; x += step) { stops.push(x, -x); }
      stops.push(span, -span);
      for (const pos of stops) {
        el.scrollLeft = pos;
        const w = el.getBoundingClientRect();
        for (const th of el.querySelectorAll('thead th')) {
          const b = th.getBoundingClientRect();
          if (b.right > w.left + 1 && b.left < w.right - 1) reached.add(th);
        }
      }
      el.scrollLeft = 0;
      for (const th of el.querySelectorAll('thead th'))
        if (!reached.has(th)) stuck.push((th.textContent || '').trim().slice(0, 14) || '(empty)');
    }
    return [...new Set(stuck)];
  });
  if (r.unreachable.length) console.log(`           UNREACHABLE even after scrolling: ${r.unreachable.join(', ')}`);

  rows.push([name, r]);
  const t = r.tables.map(t => `${t.hidden}px hidden [${t.heads.join(' ')}]`).join(' || ') || '—';
  console.log(
    `${name.padEnd(10)} coarse=${r.coarse} scrollX=${r.scrollX} spill=${r.overlap}px${r.spill ? ' (' + r.spill + ')' : ''} hint=${r.hint || 'none'}\n` +
    `           tables: ${t}\n` +
    (r.small.length ? `           small: ${r.small.join(', ')}\n` : '')
  );
}

await b.close();
// An off-screen column inside a scroller that ANNOUNCES itself and can be
// scrolled to is not a defect — it is the layout working. The defects are:
// the page itself scrolling sideways, the topbar covering content, a hidden
// table with no affordance, a column no amount of scrolling reaches, and a
// control a finger cannot hit.
const bad = rows.filter(([, r]) =>
  r.scrollX > 0 || r.overlap > 0 ||
  r.tables.some(t => t.hidden > 0 && !r.hint) ||
  r.unreachable.length > 0 || r.small.length > 0);
console.log(`\n${rows.length} routes — ${bad.length} with a problem: ${bad.map(b => b[0]).join(', ') || 'none'}`);
