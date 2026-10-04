// Effective tap area across EVERY screen, not the four hitArea.mjs samples.
//
// qa/tapTargets.mjs measures boxes and reports 56 controls under 44px. That
// number is not wrong, it is answering a different question: this codebase
// deliberately keeps dense chrome visually dense and grows the TARGET with an
// ::after pseudo-element. A box measurement therefore cannot tell a genuinely
// hard-to-tap control from a correctly-handled one — and it also misses the
// worse defect, which is two targets OVERLAPPING so a tap opens the neighbour.
//
// So this asks the browser what it would actually dispatch to, on every screen.
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';

const EVENT = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן הקסום', startTime: '19:00',
  coupleType: 'bride-groom', parentsType: 'mother-father', noShowPct: 10,
  guests: [
    { id: 'g1', name: 'טל שוורץ', side: 'bride', group: 'משפחה', count: 4, phone: '0501234567',
      rsvp: 'confirmed', companions: ['רונית', 'עומר', 'שיר'], arrivedSeats: [0, 1], arrived: true },
    { id: 'g2', name: 'רון לוי', side: 'groom', group: 'חברים', count: 1, phone: '0521234567', rsvp: 'pending' },
    { id: 'g3', name: 'שרה כהן', side: 'bride', group: 'עבודה', count: 3, phone: '', rsvp: 'declined' },
  ],
  tables: [
    { id: 't1', name: 'שולחן הורי הכלה', capacity: 12, type: 'regular', shape: 'round' },
    { id: 't2', name: 'שולחן 2', capacity: 10, type: 'regular', shape: 'round' },
  ],
  seating: { g1: 't1', g3: 't2' },
  constraints: [{ id: 'c1', type: 'together', guestA: 'g1', guestB: 'g3' }],
  tasks: [{ id: 'k1', title: 'לסגור עם הצלם', done: false, offset: 30 }],
  vendors: [{ id: 'v1', name: 'צלם', category: 'צילום', phone: '0501111111', price: 8000 }],
  costs: { categories: [{ id: 'catering', name: 'קייטרינג', budget: 45000, actual: 47000 }] },
  tokens: { rsvp: 'r1', album: 'al1', invite: 'i1', gift: 'gi1', hostess: 'h1', collab: 'c1' },
  createdAt: Date.now(), updatedAt: Date.now(),
};

const SCREENS = [
  ['home', '/app'], ['setup', '/events/e1/setup'], ['tables', '/events/e1/tables'],
  ['guests', '/events/e1/guests'], ['constraints', '/events/e1/constraints'],
  ['seating', '/events/e1/seating'], ['site', '/events/e1/site'],
  ['share', '/events/e1/share'], ['rsvps', '/events/e1/rsvps'],
  ['collab', '/events/e1/collab'], ['costs', '/events/e1/costs'],
  ['tasks', '/events/e1/tasks'], ['announce', '/events/e1/announce'],
  ['vendors', '/events/e1/vendors'], ['messages', '/events/e1/messages'],
  ['nametags', '/events/e1/nametags'], ['entrance', '/events/e1/entrance'],
  ['landing', '/'], ['pricing', '/pricing'], ['help', '/help'],
  ['svc-seating', '/services/seating'], ['svc-site', '/services/event-site'], ['svc-plan', '/services/planning'], ['svc-rsvp', '/services/rsvp'], ['svc-day', '/services/event-day'], ['svc-gifts', '/services/gifts'],   // checklist 87
];

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const page = await b.newPage({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
await page.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
await page.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
  JSON.stringify({ events: [e], activeEventId: 'e1' })), EVENT);

/* Three things this measured wrong, found on the 3.10 leftovers pass — each
 * checked by walking the pixels by hand before the check was changed:
 *
 *   • A control was judged at ONE scroll position per screen page. Right under
 *     the sticky area bar, the setup screen's "הסבר" tip lost 7px of its 44px
 *     pad to the bar and read 36 — one screen earlier the same tip read 43
 *     (= 44, see below). Sticky chrome covers whatever scrolls under it; that
 *     is not the control's size. So a control whose 44px area is under sticky
 *     chrome at an offset is not measured there (seating's "שלחו מספר שולחן"
 *     row read 19 from the one sliver below the bar), and each control keeps
 *     its BEST reading across the offsets it was measured at. Fixed elements
 *     are not excused: a control buried under one at every offset still fails.
 *   • "Fully on screen" was checked vertically only. The tables screen's
 *     sub-nav scrolls sideways and "האירוע" sat half past the right edge; the
 *     walk stopped at the viewport, not at a neighbour (38w for a 76px box).
 *   • A big target with a control drawn ON it — the seating card's header is
 *     one stretched expand button, and the table's name is a rename button on
 *     top of it (SeatingScreen.module.css .tCardToggle) — was measured from its
 *     centre only, which on a long name is 3px from the name. It is now
 *     sampled on a 3x3 grid when its box is ≥ 44 both ways, and passes if any
 *     point has 44 of its own. The same pair was reported as an OVERLAP: one
 *     box containing the other is nesting by design (the inner control wins
 *     the taps on it), not two neighbours fighting over an edge.
 */
const small = [], overlap = [];
for (const [name, path] of SCREENS) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1100);
  const best = new Map();   // control id → its best reading on this screen

  // elementFromPoint is VIEWPORT-relative and returns null below the fold, so
  // the page is walked a screen at a time rather than measured in one pass.
  // Three-quarter screens, not whole ones: with a whole-screen step, the band
  // that lands under the sticky bar at the top of each screen was off the
  // bottom of the screen before — never measured at all. Measured: with the
  // WORKPLAN-129 waNotifyItem fix removed, the whole-screen walk (before and
  // after the changes above) reported nothing; the rows only ever came into
  // view under the bar. Same reach as before: 8 whole screens.
  const STEP = Math.floor(844 * 0.75);
  const pages = await page.evaluate((step) => Math.ceil(document.body.scrollHeight / step), STEP);
  for (let i = 0; i < Math.min(pages, Math.ceil(8 * 844 / STEP)); i++) {
    await page.evaluate((y) => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, y);
    }, i * STEP);
    await page.waitForTimeout(250);

    const found = await page.evaluate(() => {
      const own = (el, x, y) => {
        if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) return false;
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit) ||
               (hit.closest && hit.closest('a,button,label,select') === el));
      };
      const walk = (el, x, y) => {
        let up = 0, down = 0, lft = 0, rgt = 0;
        while (up   < 30 && own(el, x, y - up   - 1)) up++;
        while (down < 30 && own(el, x, y + down + 1)) down++;
        while (lft  < 40 && own(el, x - lft  - 1, y)) lft++;
        while (rgt  < 40 && own(el, x + rgt  + 1, y)) rgt++;
        return { x, y, up, down, lft, rgt, h: up + down, w: lft + rgt };
      };
      window.__hitN = window.__hitN || 0;
      // Sticky chrome on screen at this offset. Content scrolls under it and
      // always scrolls back out — a sticky element returns to its own place at
      // the end of the scroll — so a control whose 44px area is under one
      // right now is not measurable HERE, the same as one past the fold.
      // Fixed elements are NOT excused: one can cover a control for good.
      const sticky = [...document.querySelectorAll('body *')]
        .filter(s => getComputedStyle(s).position === 'sticky')
        .map(s => ({ s, r: s.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight);
      const underSticky = (el, cx, cy) => sticky.some(({ s, r }) => !s.contains(el) &&
        cx + 22 > r.left && cx - 22 < r.right && cy + 22 > r.top && cy - 22 < r.bottom);
      const out = { measured: [], overlap: [] };
      const seen = [];
      for (const el of document.querySelectorAll('button, a[href], select, input[type=checkbox], input[type=radio]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // only what is fully on screen — both ways
        if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        // A checkbox inside a label IS the label as far as a finger is
        // concerned — tapping anywhere on the row toggles it. Measuring the
        // 16px box inside a 44px label is the box-measurement mistake again,
        // one level down.
        if (el.tagName === 'INPUT') {
          const lab = el.closest('label');
          if (lab) {
            const lr = lab.getBoundingClientRect();
            if (lr.height >= 43 && lr.width >= 43) continue;
          }
        }
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (underSticky(el, cx, cy)) continue;
        const pts = [[cx, cy]];
        if (r.width >= 44 && r.height >= 44) {
          for (const fy of [1 / 6, 1 / 2, 5 / 6]) for (const fx of [1 / 6, 1 / 2, 5 / 6])
            pts.push([r.left + r.width * fx, r.top + r.height * fy]);
        }
        let m = null;
        for (const [x, y] of pts) {
          if (!own(el, x, y)) continue;
          const w = walk(el, x, y);
          if (!m || Math.min(w.h, w.w) > Math.min(m.h, m.w)) m = w;
          if (m.h >= 43 && m.w >= 43) break;
        }
        if (!m) continue;   // covered by something else entirely; not a size question
        if (!el.dataset.hitId) el.dataset.hitId = String(++window.__hitN);
        const label = (el.getAttribute('aria-label') || el.textContent || el.tagName)
          .trim().replace(/\s+/g, ' ').slice(0, 30);
        out.measured.push({ id: el.dataset.hitId, h: m.h, w: m.w,
          text: `${m.h}h x ${m.w}w  box ${Math.round(r.width)}x${Math.round(r.height)}  "${label}"` });
        // Two targets whose EFFECTIVE areas intersect: the later sibling paints
        // on top, so part of one control belongs to its neighbour. Not when one
        // BOX contains the other — that is a control drawn on a bigger one.
        const eff = { l: m.x - m.lft, r: m.x + m.rgt, t: m.y - m.up, b: m.y + m.down, label,
                      box: { l: r.left, r: r.right, t: r.top, b: r.bottom } };
        const inside = (a, b) => a.l >= b.l - 0.5 && a.r <= b.r + 0.5 && a.t >= b.t - 0.5 && a.b <= b.b + 0.5;
        for (const p of seen) {
          if (inside(eff.box, p.box) || inside(p.box, eff.box)) continue;
          if (eff.l < p.r && eff.r > p.l && eff.t < p.b && eff.b > p.t)
            out.overlap.push(`"${p.label}" ∩ "${eff.label}"`);
        }
        seen.push(eff);
      }
      return out;
    });
    for (const m of found.measured) {
      const b0 = best.get(m.id);
      if (!b0 || Math.min(m.h, m.w) > Math.min(b0.h, b0.w)) best.set(m.id, m);
    }
    for (const o of found.overlap) overlap.push(`${name.padEnd(12)} ${o}`);
  }
  // The walk steps whole pixels from a fractional centre and loses one at
  // each end, so a true 44 measures 43.
  for (const m of best.values()) if (m.h < 43 || m.w < 43) small.push(`${name.padEnd(12)} ${m.text}`);
}
await b.close();

const uniq = (a) => [...new Set(a)];
const S = uniq(small), O = uniq(overlap);
console.log(`── controls whose EFFECTIVE tap area is under 44px (${S.length})`);
for (const s of S) console.log('  ' + s);
console.log(`\n── controls whose effective areas OVERLAP a neighbour (${O.length})`);
for (const o of O) console.log('  ' + o);
console.log(`\n${SCREENS.length} screens at 390x844, pointer: coarse`);
process.exit(S.length + O.length ? 1 : 0);
