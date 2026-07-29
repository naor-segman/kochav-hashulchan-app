/* Screenshot every in-app screen with a seeded event, so the design pass is
   judged from the rendered page and not from the source. Writes into
   qa/shots/app-<name>-<width>.png. */
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5188';
const DIR = new URL('./shots/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });

const only = process.argv.slice(2).filter(a => !/^\d+$/.test(a));
const widths = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);

const EVENT = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן', startTime: '19:00',
  guests: [
    { id: 'g1', name: 'טל שוורץ',  side: 'bride', group: 'משפחה', count: 2, phone: '0501234567', rsvp: 'confirmed' },
    { id: 'g2', name: 'רון לוי',   side: 'groom', group: 'חברים', count: 1, phone: '0521234567', rsvp: 'pending' },
    { id: 'g3', name: 'שרה כהן',   side: 'bride', group: 'עבודה', count: 3, phone: '', rsvp: 'declined' },
    { id: 'g4', name: 'דני מזרחי', side: 'groom', group: 'חברים', count: 1, phone: '0541234567', rsvp: 'confirmed' },
    { id: 'g5', name: 'מיכל אבני', side: 'bride', group: 'משפחה', count: 4, phone: '0531111111', rsvp: 'confirmed' },
  ],
  tables: [
    { id: 't1', name: 'שולחן 1', capacity: 6,  type: 'regular', shape: 'round' },
    { id: 't2', name: 'שולחן 2', capacity: 10, type: 'regular', shape: 'round' },
    { id: 't3', name: 'שולחן אביר', capacity: 12, type: 'regular', shape: 'rect' },
  ],
  seating: { g1: 't1', g4: 't1', g5: 't2' },
  constraints: [{ id: 'c1', type: 'together', guestA: 'g1', guestB: 'g4' }],
  tasks: [
    { id: 'k1', title: 'לסגור אולם', done: true },
    { id: 'k2', title: 'לשלוח הזמנות', done: false },
  ],
  vendors: [{ id: 'v1', name: 'להקת הכוכבים', category: 'מוזיקה', phone: '0501112233', price: 6000, paid: 2000 }],
  tokens: { rsvp: 'r1', album: 'al1', invite: 'i1', gift: 'gi1', hostess: 'h1', collab: 'c1' },
  cloudId: null, createdAt: 1700000000000, updatedAt: 1700000000000,
};

const ROUTES = [
  ['dashboard',   '/app'],
  ['setup',       '/events/e1/setup'],
  ['tables',      '/events/e1/tables'],
  ['guests',      '/events/e1/guests'],
  ['constraints', '/events/e1/constraints'],
  ['seating',     '/events/e1/seating'],
  ['rsvps',       '/events/e1/rsvps'],
  ['collab',      '/events/e1/collab'],
  ['site',        '/events/e1/site'],
  ['costs',       '/events/e1/costs'],
  ['tasks',       '/events/e1/tasks'],
  ['announce',    '/events/e1/announce'],
  ['vendors',     '/events/e1/vendors'],
  ['messages',    '/events/e1/messages'],
  ['nametags',    '/events/e1/nametags'],
  ['checkin',     '/events/e1/checkin'],
  ['account',     '/account'],
  ['help',        '/help'],
];

const routes = only.length ? ROUTES.filter(([n]) => only.includes(n)) : ROUTES;

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

for (const w of (widths.length ? widths : [1280])) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
    JSON.stringify({ events: [e], activeEventId: 'e1' })), EVENT);
  for (const [name, path] of routes) {
    await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${DIR}/app-${name}-${w}.png`, fullPage: true });
    console.log('shot', name, w);
  }
  await ctx.close();
}
await b.close();
