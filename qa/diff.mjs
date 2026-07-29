/* Before/after on one page. Two dev servers, the same seeded event, the same
   viewport — then the two shots stacked into one PNG with a label on each, so
   a change can be judged instead of argued about.

   usage: node qa/diff.mjs <route> [width] [beforePort] [afterPort] */
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const route  = process.argv[2] || '/events/e1/guests';
const width  = Number(process.argv[3] || 900);
const before = process.argv[4] || '5199';
const after  = process.argv[5] || '5188';
const DIR    = new URL('./shots/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });

const EVENT = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן', startTime: '19:00',
  guests: [
    { id: 'g1', name: 'טל שוורץ',  side: 'bride', group: 'משפחה', count: 2, phone: '0501234567', rsvp: 'confirmed' },
    { id: 'g2', name: 'רון לוי',   side: 'groom', group: 'חברים', count: 1, phone: '0521234567', rsvp: 'pending' },
    { id: 'g3', name: 'שרה כהן',   side: 'bride', group: 'עבודה', count: 3, phone: '', rsvp: 'declined' },
    { id: 'g4', name: 'דני מזרחי', side: 'groom', group: 'חברים', count: 1, phone: '0541234567', rsvp: 'confirmed' },
  ],
  tables: [
    { id: 't1', name: 'שולחן 1', capacity: 6,  type: 'regular', shape: 'round' },
    { id: 't2', name: 'שולחן 2', capacity: 10, type: 'regular', shape: 'round' },
  ],
  seating: { g1: 't1', g4: 't1' },
  constraints: [{ id: 'c1', type: 'together', guestA: 'g1', guestB: 'g4' }],
  tasks: [
    { id: 'k1', title: 'לסגור אולם',    status: 'done',  priority: 'high' },
    { id: 'k2', title: 'לשלוח הזמנות',  status: 'doing', priority: 'normal' },
    { id: 'k3', title: 'לבחור מנות',    status: 'todo',  priority: 'low' },
  ],
  vendors: [{ id: 'v1', name: 'להקת הכוכבים', category: 'music', status: 'lead', payment: 'none', price: 6000, paid: 2000, phone: '0501112233' }],
  tokens: { rsvp: 'r1', album: 'al1', invite: 'i1', gift: 'gi1', hostess: 'h1', collab: 'c1' },
  cloudId: null, createdAt: 1700000000000, updatedAt: 1700000000000,
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

async function shoot(port) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const base = `http://127.0.0.1:${port}`;
  await p.goto(base + '/app', { waitUntil: 'domcontentloaded' });
  await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
    JSON.stringify({ events: [e], activeEventId: 'e1' })), EVENT);
  await p.goto(base + route, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1100);
  const buf = await p.screenshot({ fullPage: true });
  await ctx.close();
  return buf;
}

const [bufBefore, bufAfter] = [await shoot(before), await shoot(after)];

// Stack them side by side in a plain page and shoot that, so the comparison is
// one file the owner can open on a phone.
const page = await b.newPage({ viewport: { width: width * 2 + 60, height: 900 }, deviceScaleFactor: 1 });
await page.setContent(`
  <html dir="rtl"><body style="margin:0;background:#2a2a2e;font:600 15px Heebo,system-ui;color:#fff">
    <div style="display:flex;gap:20px;padding:20px;align-items:flex-start">
      <div style="flex:1">
        <div style="padding:8px 12px;background:#3a3a40;border-radius:8px 8px 0 0">אחרי</div>
        <img src="data:image/png;base64,${bufAfter.toString('base64')}" style="width:100%;display:block;border-radius:0 0 8px 8px" />
      </div>
      <div style="flex:1">
        <div style="padding:8px 12px;background:#3a3a40;border-radius:8px 8px 0 0">לפני</div>
        <img src="data:image/png;base64,${bufBefore.toString('base64')}" style="width:100%;display:block;border-radius:0 0 8px 8px" />
      </div>
    </div>
  </body></html>`, { waitUntil: 'load' });
await page.waitForTimeout(500);
const name = route.replace(/\//g, '-').replace(/^-/, '');
const out = `${DIR}/diff-${name}-${width}.png`;
await page.screenshot({ path: out, fullPage: true });
console.log(out);
await b.close();
