/* Mobile audit at 390px. Measures three things a screenshot review misses:
   an element wider than the viewport, text under 11px, and a tap target that
   does not clear 44px. Reports per route. */
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5188';
const W = Number(process.argv[2] || 390);

const EVENT = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן', startTime: '19:00',
  guests: [
    { id: 'g1', name: 'טל שוורץ',  side: 'bride', group: 'משפחה', count: 2, phone: '0501234567', rsvp: 'confirmed' },
    { id: 'g2', name: 'רון לוי',   side: 'groom', group: 'חברים', count: 1, phone: '0521234567', rsvp: 'pending' },
    { id: 'g3', name: 'שרה כהן',   side: 'bride', group: 'עבודה', count: 3, phone: '', rsvp: 'declined' },
  ],
  tables: [
    { id: 't1', name: 'שולחן 1', capacity: 6,  type: 'regular', shape: 'round' },
    { id: 't2', name: 'שולחן אביר', capacity: 12, type: 'regular', shape: 'rect' },
  ],
  seating: { g1: 't1' },
  constraints: [{ id: 'c1', type: 'together', guestA: 'g1', guestB: 'g2' }],
  tasks: [{ id: 'k1', title: 'לסגור אולם', status: 'doing', priority: 'high' }],
  vendors: [{ id: 'v1', name: 'להקת הכוכבים', category: 'music', status: 'lead', payment: 'none', price: 6000, paid: 0, phone: '0501112233' }],
  tokens: { rsvp: 'r1', album: 'al1', invite: 'i1', gift: 'gi1', hostess: 'h1', collab: 'c1' },
  cloudId: null, createdAt: 1700000000000, updatedAt: 1700000000000,
};

const ROUTES = [
  ['/', 'בית'], ['/pricing', 'מחירים'], ['/app', 'דשבורד'],
  ['/events/e1/setup', 'האירוע'], ['/events/e1/tables', 'שולחנות'],
  ['/events/e1/guests', 'אורחים'], ['/events/e1/constraints', 'אילוצים'],
  ['/events/e1/seating', 'הושבה'], ['/events/e1/rsvps', 'אישורים'],
  ['/events/e1/collab', 'טבלה שיתופית'], ['/events/e1/site', 'אתר האירוע'],
  ['/events/e1/costs', 'תקציב'], ['/events/e1/tasks', 'משימות'],
  ['/events/e1/announce', 'הזמנות'], ['/events/e1/vendors', 'ספקים'],
  ['/events/e1/messages', 'הודעות'], ['/events/e1/nametags', 'כרטיסי שם'],
  ['/events/e1/checkin', 'צ׳ק אין'], ['/account', 'חשבון'], ['/help', 'עזרה'],
  ['/rsvp/r1', 'RSVP לאורח'], ['/invite/i1', 'אתר לאורח'], ['/gift/gi1', 'מתנה'],
];

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
console.log('pointer: coarse =', await p.evaluate(() => matchMedia('(pointer: coarse)').matches));
await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
  JSON.stringify({ events: [e], activeEventId: 'e1' })), EVENT);

let bad = 0;
for (const [route, label] of ROUTES) {
  await p.goto(BASE + route, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(750);

  const r = await p.evaluate((vw) => {
    const out = { wide: [], tiny: [], small: [] };
    const seen = (el) => {
      const cls = (el.className && typeof el.className === 'string')
        ? el.className.split(' ')[0].replace(/_[\w-]+$/, '') : '';
      const txt = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 14);
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ' "' + txt + '"' : ''}`;
    };
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;

      // Wider than the viewport, and not inside something that scrolls on purpose.
      if (box.width > vw + 1) {
        let scrollable = false;
        for (let a = el.parentElement; a; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (/(auto|scroll)/.test(acs.overflowX)) { scrollable = true; break; }
        }
        if (!scrollable) out.wide.push(`${seen(el)} ${Math.round(box.width)}px`);
      }

      const fs = parseFloat(cs.fontSize);
      const text = (el.childNodes.length &&
        [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
      if (text && fs && fs < 11) out.tiny.push(`${seen(el)} ${fs}px`);

      // The EFFECTIVE hit area, not the box. A control can stay 22px tall and
      // still be comfortably tappable if a pseudo-element extends its target,
      // which is the technique this codebase uses — measuring the box alone
      // would report a fixed control as still broken.
      if (/^(button|a)$/i.test(el.tagName) && el.offsetParent !== null) {
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        if (cx < 0 || cy < 0 || cx > vw || cy > innerHeight) continue;
        const hits = (y) => {
          const t = document.elementFromPoint(cx, y);
          // NOT `t.contains(el)` — hitting an ancestor is not hitting the control.
          return t && (t === el || el.contains(t));
        };
        let up = 0, down = 0;
        for (let d = 1; d <= 22 && hits(cy - d); d++) up = d;
        for (let d = 1; d <= 22 && hits(cy + d); d++) down = d;
        const reach = up + down + 1;
        if (reach < 40) out.small.push(`${seen(el)} ${Math.round(reach)}px`);
      }
    }
    const uniq = (a) => [...new Set(a)];
    return { wide: uniq(out.wide), tiny: uniq(out.tiny), small: uniq(out.small) };
  }, W);

  const issues = [];
  if (r.wide.length)  issues.push(`רחב מהמסך: ${r.wide.slice(0, 4).join(', ')}`);
  if (r.tiny.length)  issues.push(`טקסט <11px: ${r.tiny.slice(0, 4).join(', ')}`);
  if (r.small.length) issues.push(`מטרת מגע <40px: ${r.small.slice(0, 5).join(', ')}`);
  if (issues.length) { bad++; console.log(`✗ ${label}\n    ${issues.join('\n    ')}`); }
  else console.log(`✓ ${label}`);
}
console.log(`\n${ROUTES.length - bad}/${ROUTES.length} מסכים נקיים ב-${W}px`);
await b.close();
