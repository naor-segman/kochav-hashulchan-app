// Contrast as the browser actually paints it, not as a token table predicts.
//
// qa/contrast.mjs computes 40 hand-listed token pairs. That is useful for
// deciding what a token is FOR, but it is a hypothesis list: three of its
// failures (green@.6/.7 and red@.6 on their tints) do not occur anywhere as
// text — the only reduced-opacity rules in the codebase are --text2/--muted on
// neutral grounds and disabled buttons. Chasing them would be fixing a pairing
// the product never renders, which this project has done once before.
//
// So this walks every screen, finds every element with visible text, reads its
// COMPUTED colour, and resolves the ground it actually sits on by walking up
// through transparent ancestors compositing as it goes. Then it computes the
// real ratio against the real background.
//
// The threshold is WCAG AA: 4.5:1 for body text, 3:1 for large text (>=24px,
// or >=18.66px bold).
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';

const EVENT = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן הקסום', startTime: '19:00',
  coupleType: 'bride-groom', parentsType: 'mother-father',
  guests: [
    { id: 'g1', name: 'טל שוורץ', side: 'bride', group: 'משפחה', count: 4, phone: '0501234567',
      rsvp: 'confirmed', companions: ['רונית', 'עומר', 'שיר'], arrivedSeats: [0, 1], arrived: true },
    { id: 'g2', name: 'רון לוי', side: 'groom', group: 'חברים', count: 1, phone: '0521234567', rsvp: 'pending' },
    { id: 'g3', name: 'שרה כהן', side: 'bride', group: 'עבודה', count: 3, rsvp: 'declined' },
  ],
  tables: [{ id: 't1', name: 'שולחן הורי הכלה', capacity: 12, type: 'regular', shape: 'round' },
           { id: 't2', name: 'שולחן 2', capacity: 4, type: 'regular', shape: 'round' }],
  seating: { g1: 't1', g3: 't2' },
  constraints: [{ id: 'c1', type: 'together', guestA: 'g1', guestB: 'g3' }],
  tasks: [{ id: 'k1', title: 'לסגור עם הצלם', done: false, offset: 30 },
          { id: 'k2', title: 'לשלם מקדמה', done: true, offset: 10 }],
  vendors: [{ id: 'v1', name: 'צלם', category: 'צילום', phone: '0501111111', price: 8000, status: 'booked' }],
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
const page = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await page.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
await page.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
  JSON.stringify({ events: [e], activeEventId: 'e1' })), EVENT);

const all = [], gradient = [];
for (const [name, path] of SCREENS) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const rows = await page.evaluate(() => {
    const parse = (c) => {
      const m = String(c).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map(s => parseFloat(s.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
    });
    const lum = (c) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (x, y) => {
      const a = lum(x), b = lum(y);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    // The ground an element actually sits on: walk up compositing every
    // non-transparent background until one is opaque. A tint IS a ground —
    // measuring against white is how --muted got called 5.3:1 when on the
    // warm danger tint it is 4.4:1.
    // Returns null when the ground is a gradient or an image: those are not a
    // single colour, and `backgroundColor` reads rgba(0,0,0,0) for them, so a
    // naive walk sails past a dark hero bar and reports its white text as
    // white-on-white. That produced two confident 1:1 and 2.39:1 "failures"
    // here before this guard existed.
    // A gradient has no single colour, so it is resolved to its colour STOPS
    // and the text is judged against the worst of them. JS cannot read painted
    // pixels, and skipping gradients entirely leaves the dark hero bar — the
    // first thing on the home screen — unmeasured. Judging every stop is
    // conservative in the right direction: it cannot pass something that fails
    // somewhere along the sweep.
    const stopsOf = (img) => {
      const found = [];
      const re = /rgba?\(([^)]+)\)/g;
      let m;
      while ((m = re.exec(img))) {
        const p = m[1].split(',').map(s => parseFloat(s.trim()));
        if (p.length >= 3 && p.every(v => !Number.isNaN(v)))
          found.push({ r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 });
      }
      return found;
    };
    const groundOf = (el) => {
      let acc = null;
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') {
          const stops = stopsOf(cs.backgroundImage);
          // A url() or a gradient whose stops cannot be parsed stays unmeasured
          // and is reported as such rather than guessed at.
          return stops.length ? { stops } : null;
        }
        const bg = parse(cs.backgroundColor);
        if (!bg || bg.a === 0) continue;
        acc = acc ? over(acc, bg) : bg;
        if (acc.a >= 0.999) return { stops: [acc] };
      }
      return { stops: [{ r: 255, g: 255, b: 255, a: 1 }] };
    };
    const out = [], skipped = [];
    for (const el of document.querySelectorAll('body *')) {
      // Only elements that render text of their own.
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const opacity = parseFloat(cs.opacity);
      if (opacity < 0.05) continue;
      // A disabled control is explicitly exempt from WCAG 1.4.3, and the faded
      // look IS the affordance. Counting it as a failure would mean "fixing"
      // the thing that communicates it cannot be pressed.
      const btn = el.closest('button, [aria-disabled="true"], fieldset[disabled]');
      if (btn && (btn.disabled || btn.getAttribute('aria-disabled') === 'true')) continue;
      let fg = parse(cs.color); if (!fg) continue;
      const ground = groundOf(el);
      if (!ground) { skipped.push(`${(el.textContent || '').trim().slice(0, 24)}`); continue; }
      // An `opacity` on the element fades its text towards the ground too.
      fg = { ...fg, a: fg.a * opacity };
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      // Worst stop wins: a gradient that is legible at one end and not at the
      // other is a defect at the end where it fails.
      let worst = null;
      for (const stop of ground.stops) {
        const composited = over(fg, stop);
        const got = ratio(composited, stop);
        if (!worst || got < worst.got) worst = { got, composited, stop };
      }
      if (worst.got < need) {
        out.push({
          ratio: Math.round(worst.got * 100) / 100, need, size: Math.round(size), weight,
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34),
          cls: String(el.className).slice(0, 28),
          fg: `rgb(${Math.round(worst.composited.r)},${Math.round(worst.composited.g)},${Math.round(worst.composited.b)})`,
          bg: `rgb(${Math.round(worst.stop.r)},${Math.round(worst.stop.g)},${Math.round(worst.stop.b)})` +
              (ground.stops.length > 1 ? ` (worst of ${ground.stops.length} gradient stops)` : ''),
        });
      }
    }
    return { out, skipped: [...new Set(skipped)] };
  });
  for (const r of rows.out) all.push({ ...r, screen: name });
  if (rows.skipped.length) gradient.push(`${name}: ${rows.skipped.length}`);
}
await b.close();

// One line per distinct (class, ratio) — the same component repeated down a
// list is one defect, not forty.
const seen = new Map();
for (const r of all) {
  const k = `${r.screen}|${r.cls}|${r.ratio}`;
  if (!seen.has(k)) seen.set(k, r);
}
const rows = [...seen.values()].sort((a, b) => a.ratio - b.ratio);
for (const r of rows) {
  console.log(`${String(r.ratio).padStart(5)}:1  needs ${r.need}  ${r.screen.padEnd(12)} ` +
              `${r.size}px/${r.weight}  ${r.fg} on ${r.bg}  .${r.cls}  "${r.text}"`);
}
console.log(`\n${rows.length} distinct text/ground pairs below WCAG AA, across ${SCREENS.length} screens at 390px`);
console.log(`not computed (ground is a gradient or image, so it has no single colour): ${gradient.join(', ') || 'none'}`);
process.exit(rows.length ? 1 : 0);
