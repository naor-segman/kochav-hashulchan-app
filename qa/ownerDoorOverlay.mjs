// The host's own door screen shows the greeter's check-ins while it is open.
// WORKPLAN ב2, 28.9.
//
// The greeter writes arrivals to the cloud; the host's door screen read only
// the local copy, so a host at the door saw none of them until a reload. It
// now re-reads its own cloud row every 25s and overlays arrivals with the
// sync merge's per-row timestamp rule.
//
// Signed-in, against a stubbed Supabase (no network): the cloud row carries a
// greeter's mark the local copy does not. Then a SECOND greeter mark lands
// and the clock is run forward 25s. Then the host taps the other seat of a
// family the greeter half-marked — and localStorage must hold BOTH seats,
// because a tap that started from the local row would be stamped newer and
// drop the greeter's seat by the merge's own rule.
//
//   node qa/ownerDoorOverlay.mjs      (starts and stops its own dev server)
import { createRequire } from 'module';
import { startDev } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const CLOUD = '0b6f6c1e-1111-4222-8333-444455556666';
const guests = [
  { id: 'g1', name: 'יעל כהן', count: 2, rsvp: 'confirmed', side: 'bride' },
  { id: 'g2', name: 'איתי לוי', count: 1, rsvp: 'confirmed', side: 'groom' },
];
const ev = {
  id: 'e1', cloudId: CLOUD, name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  guests, tables: [{ id: 't1', name: 'שולחן 1', capacity: 10, type: 'regular', shape: 'round' }],
  seating: { g1: 't1', g2: 't1' }, constraints: [], tasks: [], vendors: [],
  tokens: { rsvp: 'r', invite: 'i', gift: 'g', album: 'a', hostess: 'h', collab: 'c' },
  createdAt: 1, updatedAt: 1,
};

// What the cloud row holds. The greeter marked yael's FIRST seat a minute ago.
const T0 = Date.UTC(2027, 5, 1, 18, 0, 0);
let cloudGuests = [
  { ...guests[0], arrivedSeats: [0], arrived: true, arrivedAt: T0 - 60_000 },
  { ...guests[1] },
];

const server = await startDev(5232, { VITE_SUPABASE_URL: 'https://stub.supabase.co', VITE_SUPABASE_ANON_KEY: 'stub-anon-key' });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });

try {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  let reads = 0;
  await p.route('**/stub.supabase.co/**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && url.includes('/rest/v1/events') && url.includes('select=payload') && url.includes(`id=eq.${CLOUD}`)) {
      reads++;
      const row = { payload: { guests: cloudGuests } };
      const wantsObject = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wantsObject ? row : [row]) });
    }
    // Anything else — hydration, pushes — answers an object, which the app
    // treats as a failed read and keeps its local copy (the local copy is the
    // one under test here).
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await p.clock.install({ time: T0 });
  await p.goto(`${server.base}/app`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    const year = Math.floor(Date.now() / 1000) + 31_536_000;
    localStorage.setItem('sb-stub-auth-token', JSON.stringify({
      access_token: 'stub-access', refresh_token: 'stub-refresh', token_type: 'bearer',
      expires_in: 31_536_000, expires_at: year,
      user: { id: 'u-host', aud: 'authenticated', role: 'authenticated', email: 'host@example.com', app_metadata: {}, user_metadata: {} },
    }));
  });
  for (const k of ['kochav_hashulchan_v1::u_u-host', 'kochav_hashulchan_v1']) {
    await p.evaluate(([key, e]) => localStorage.setItem(key, JSON.stringify({ events: [e], activeEventId: 'e1' })), [k, ev]);
  }
  await p.goto(`${server.base}/events/e1/checkin`, { waitUntil: 'domcontentloaded' });
  await p.clock.runFor(3000);
  await p.waitForTimeout(800);

  const counter = () => p.evaluate(() => {
    const m = document.body.innerText.replace(/\s+/g, ' ').match(/(\d+)\s*מתוך\s*(\d+)\s*אורחים/);
    return m ? `${m[1]}/${m[2]}` : null;
  });
  const local = () => p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('kochav_hashulchan_v1::u_u-host') || '{}');
    return st.events?.[0]?.guests?.find(g => g.id === 'g1')?.arrivedSeats ?? null;
  });

  console.log('── the greeter\'s mark shows on the host\'s screen');
  ok(reads >= 1, 'the screen read its own cloud row', `reads=${reads}`);
  ok(await counter() === '1/3', 'one of three seats is shown as arrived', await counter());

  console.log('\n── a second greeter mark arrives while the screen is open');
  cloudGuests = [cloudGuests[0], { ...guests[1], arrivedSeats: [0], arrived: true, arrivedAt: T0 + 10_000 }];
  await p.clock.runFor(26_000);
  await p.waitForTimeout(800);
  ok(reads >= 2, 'it read again 25s later', `reads=${reads}`);
  ok(await counter() === '2/3', 'and shows it without a reload', await counter());

  console.log('\n── the host marks the OTHER seat of the half-marked family');
  await p.fill('input[type="search"]', 'יעל');
  await p.waitForTimeout(400);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /^\d+\/\d+$/.test(b.textContent.trim()))?.click());
  await p.waitForTimeout(300);
  const tapped = await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'אורח 2');
    b?.click();
    return !!b;
  });
  ok(tapped, 'the second seat ("אורח 2") is tappable');
  await p.waitForTimeout(600);
  const seats = await local();
  ok(JSON.stringify(seats) === '[0,1]', 'the local copy holds BOTH seats — the greeter\'s is kept', JSON.stringify(seats));
  ok(await counter() === '3/3', 'three of three', await counter());
  ok(errs.length === 0, 'no page error', errs[0] || '');
} finally {
  await browser.close();
  await server.stop();
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
