// The Excel export's gift sheets, end to end: click "ייצוא לאקסל" on the real
// signed-in seating screen, catch the file the browser downloads, and open it
// with the REAL xlsx library. Checklist 92.
//
// The unit tests drive the sheet builder with xlsx mocked. What only this
// proves is the WIRING: that the seating screen reads the `gifts` table before
// building the file, and that what lands on disk has the declared-gifts sheet,
// numeric amounts, and none of the dead per-guest giftAmount field that printed
// ₪0 on every row.
//
// The catch-all stub answers `{}`, not `[]`. The first run answered `[]`, which
// told the app "the cloud has no events" — and the app correctly dropped a local
// event whose cloud row had vanished, so the seating screen never loaded. The
// check was wrong, not the app.
//
//   node qa/exportGifts.mjs      (starts and stops its own dev server)
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');
const XLSX = require('xlsx');
import { startDev } from './lib/preview.mjs';

const CLOUD = '0b6f6c1e-1111-4222-8333-444455556666';
const ev = { id: 'e1', cloudId: CLOUD, name: 'החתונה של דנה', type: 'חתונה', date: '2027-06-01',
  guests: [{ id: 'g1', name: 'משפחת לוי', count: 4, rsvp: 'confirmed', arrivedSeats: [0, 1], arrived: true, giftAmount: 999 }],
  tables: [{ id: 't1', name: 'שולחן 1', capacity: 10, type: 'regular' }], seating: { g1: 't1' }, constraints: [],
  tasks: [], vendors: [], eventSite: { gallery: [], schedule: [], shuttles: [], sections: {} },
  tokens: { rsvp: 'r', invite: 'i', gift: 'g', album: 'a', hostess: 'h', collab: 'c' }, createdAt: 1, updatedAt: 1 };
const GIFTS = [
  { id: 'x1', donor_name: 'משפחת כהן', amount: 100000, message: 'מזל טוב', created_at: '2027-06-01T19:00:00Z', hidden: false },
  { id: 'x2', donor_name: 'טרול', amount: 500, message: 'הוסתר', created_at: '2027-06-01T20:00:00Z', hidden: true },
];
const { base, stop } = await startDev(5194, { VITE_SUPABASE_URL: 'https://stub.supabase.co', VITE_SUPABASE_ANON_KEY: 'stub-anon-key' });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
let fails = 0; const ok = (c, w, d='') => { if (!c) fails++; console.log(`  ${c?'ok  ':'FAIL'} ${w}${d?'  — '+d:''}`); };
try {
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let giftReads = 0;
  await p.route('**/stub.supabase.co/**', route => {
    const url = route.request().url();
    if (url.includes('/rest/v1/gifts')) { giftReads++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GIFTS) }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await p.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    const y = Math.floor(Date.now() / 1000) + 31_536_000;
    localStorage.setItem('sb-stub-auth-token', JSON.stringify({ access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 31_536_000, expires_at: y,
      user: { id: 'u-host', aud: 'authenticated', role: 'authenticated', email: 'h@e.com', app_metadata: {}, user_metadata: {} } }));
  });
  for (const k of ['kochav_hashulchan_v1::u_u-host', 'kochav_hashulchan_v1'])
    await p.evaluate(([key, e]) => localStorage.setItem(key, JSON.stringify({ events: [e], activeEventId: 'e1' })), [k, ev]);
  await p.goto(`${base}/events/e1/seating`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 15000 }),
    p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.includes('ייצוא לאקסל'))?.click()),
  ]);
  const path = await dl.path();
  const wb = XLSX.readFile(path);
  console.log('sheets:', wb.SheetNames.join(' · '));
  ok(giftReads === 1, 'the export read the gifts table once', `${giftReads}`);
  ok(!wb.SheetNames.includes('דוח מתנות'), 'the ₪0 sheet is gone');
  ok(wb.SheetNames.includes('מי הגיע'), 'the arrivals sheet is there');
  ok(wb.SheetNames.includes('מתנות שהוצהרו'), 'the declared-gifts sheet is there');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['מתנות שהוצהרו'], { header: 1 });
  const cohen = rows.find(r => r[0] === 'משפחת כהן');
  ok(cohen && cohen[1] === 1000 && typeof cohen[1] === 'number', 'amount written as the number 1000, not a string', JSON.stringify(cohen));
  const sum = rows.find(r => r[0] === 'סה״כ הוצהר (₪):');
  ok(sum && sum[1] === 1005, 'total 1,005 — hidden blessing included in the host\'s own record', JSON.stringify(sum));
  const all = wb.SheetNames.flatMap(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 })).flat().join('|');
  ok(!all.includes('999'), 'the dead giftAmount field (999 in the fixture) appears nowhere');
  const arr = XLSX.utils.sheet_to_json(wb.Sheets['מי הגיע'], { header: 1 });
  ok(arr.find(r => r[0] === 'משפחת לוי')?.[3] === '2 מתוך 4', 'arrivals per person: 2 מתוך 4');
  ok(wb.Workbook?.Views?.[0]?.RTL === true, 'workbook is RTL');
  ok(errs.length === 0, 'no page errors', errs.join('|'));
} finally { await b.close(); stop(); }
console.log(`\n${fails} failing checks`); process.exit(fails ? 1 : 0);
