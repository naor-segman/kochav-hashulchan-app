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

const small = [], overlap = [];
for (const [name, path] of SCREENS) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1100);

  // elementFromPoint is VIEWPORT-relative and returns null below the fold, so
  // the page is walked one screen at a time rather than measured in one pass.
  const pages = await page.evaluate(() => Math.ceil(document.body.scrollHeight / innerHeight));
  for (let i = 0; i < Math.min(pages, 8); i++) {
    await page.evaluate((i) => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, i * innerHeight);
    }, i);
    await page.waitForTimeout(250);

    const found = await page.evaluate(() => {
      const own = (el, x, y) => {
        if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) return false;
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit) ||
               (hit.closest && hit.closest('a,button,label,select') === el));
      };
      const out = { small: [], overlap: [] };
      const seen = [];
      for (const el of document.querySelectorAll('button, a[href], select, input[type=checkbox], input[type=radio]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.top < 0 || r.bottom > innerHeight) continue;     // only what is fully on screen
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
        if (!own(el, cx, cy)) continue;   // covered by something else entirely; not a size question
        let up = 0, down = 0, lft = 0, rgt = 0;
        while (up   < 30 && own(el, cx, cy - up   - 1)) up++;
        while (down < 30 && own(el, cx + 0, cy + down + 1)) down++;
        while (lft  < 40 && own(el, cx - lft  - 1, cy)) lft++;
        while (rgt  < 40 && own(el, cx + rgt  + 1, cy)) rgt++;
        const label = (el.getAttribute('aria-label') || el.textContent || el.tagName)
          .trim().replace(/\s+/g, ' ').slice(0, 30);
        // The walk steps whole pixels from a fractional centre and loses one at
        // each end, so a true 44 measures 43.
        if (up + down < 43 || lft + rgt < 43)
          out.small.push(`${up + down}h x ${lft + rgt}w  box ${Math.round(r.width)}x${Math.round(r.height)}  "${label}"`);
        // Two targets whose EFFECTIVE areas intersect: the later sibling paints
        // on top, so part of one control belongs to its neighbour.
        const eff = { l: cx - lft, r: cx + rgt, t: cy - up, b: cy + down, label };
        for (const p of seen) {
          if (eff.l < p.r && eff.r > p.l && eff.t < p.b && eff.b > p.t)
            out.overlap.push(`"${p.label}" ∩ "${eff.label}"`);
        }
        seen.push(eff);
      }
      return out;
    });
    for (const s of found.small)   small.push(`${name.padEnd(12)} ${s}`);
    for (const o of found.overlap) overlap.push(`${name.padEnd(12)} ${o}`);
  }
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
