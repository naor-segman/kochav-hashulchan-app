// The host taking a blessing off the wall, driven end to end in a browser.
//
// WHY THIS NEEDS ITS OWN SERVER: qa/costGifts.mjs runs against a dev server with
// no Supabase configuration, so `fetchEventGifts` returns [] for want of a
// client and the donor list never renders at all — the moderation control is
// unreachable there. This starts vite with VITE_SUPABASE_* pointed at a host
// that does not exist and intercepts the REST calls, so the real path runs:
// fetch → render → click → PATCH → optimistic update → toast.
//
//   node qa/giftModerationUi.mjs      (starts and stops its own vite)
import { createRequire } from 'module';
import { spawn, spawnSync } from 'child_process';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const PORT = process.env.PORT || '5192';
const BASE = `http://127.0.0.1:${PORT}`;

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const ev = {
  id: 'e1', cloudId: 'CLOUD-1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  guests: [{ id: 'g1', name: 'טל שוורץ', count: 2, rsvp: 'confirmed' }],
  tables: [], seating: {}, constraints: [], tasks: [], vendors: [],
  costs: { categories: [{ id: 'c1', name: 'אולם', budget: 40000, actual: 12000 }] },
  eventSite: { gallery: [], schedule: [], shuttles: [], sections: {} },
  tokens: { rsvp: 'r', invite: 'i', gift: 'g', album: 'a', hostess: 'h', collab: 'c' },
  createdAt: 1, updatedAt: 1,
};

const GIFTS = [
  { id: 'gift-1', donor_name: 'משפחת כהן', amount: 50000, message: 'מזל טוב!',                created_at: '2026-08-01T10:00:00Z', hidden: false },
  { id: 'gift-2', donor_name: 'טרול',      amount: 500,   message: 'טקסט שאסור על המקרן',      created_at: '2026-08-02T10:00:00Z', hidden: false },
  // Arrives ALREADY hidden — from a previous sitting, or another device. The
  // host has to be able to see that state on load, and a mutation dropping the
  // `hidden` mapping was invisible until this row existed, because every other
  // fixture starts visible.
  { id: 'gift-3', donor_name: 'הוסתר קודם', amount: 1000, message: 'ישן',      created_at: '2026-08-03T10:00:00Z', hidden: true },
];

const vite = spawn('npx', ['vite', '--port', PORT, '--host', '127.0.0.1'], {
  env: { ...process.env, VITE_SUPABASE_URL: 'https://stub.supabase.co', VITE_SUPABASE_ANON_KEY: 'stub-anon-key' },
  stdio: 'ignore',
});
const stopVite = () => { try { process.kill(-vite.pid); } catch { /* already gone */ } vite.kill('SIGKILL'); };

const wait = (ms) => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 40; i++) {
  const r = spawnSync('curl', ['-s', '-o', '/dev/null', `${BASE}/app`]);
  if (r.status === 0) break;
  await wait(500);
}

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

const patches = [];
let failPatch = false;

const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errs = [];
p.on('pageerror', e => errs.push(e.message.slice(0, 140)));

// Everything Supabase is stubbed here; nothing leaves the machine.
await p.route('**/stub.supabase.co/**', async (route) => {
  const req = route.request();
  const url = req.url();
  if (url.includes('/rest/v1/gifts')) {
    if (req.method() === 'PATCH') {
      patches.push({ url, body: req.postData() });
      if (failPatch) return route.fulfill({ status: 500, body: '{"message":"nope"}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GIFTS) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

try {
  await p.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
  // A session, because with Supabase configured the event routes are behind
  // auth and an anonymous visit lands on the marketing page instead — which is
  // what the first run of this harness measured. supabase-js reads its session
  // straight out of localStorage under `sb-<project-ref>-auth-token`, and the
  // ref of https://stub.supabase.co is "stub".
  await p.evaluate(() => {
    const year = Math.floor(Date.now() / 1000) + 31_536_000;
    localStorage.setItem('sb-stub-auth-token', JSON.stringify({
      access_token: 'stub-access', refresh_token: 'stub-refresh',
      token_type: 'bearer', expires_in: 31_536_000, expires_at: year,
      user: { id: 'u-host', aud: 'authenticated', role: 'authenticated',
              email: 'host@example.com', app_metadata: {}, user_metadata: {} },
    }));
  });
  await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1::u_u-host',
    JSON.stringify({ events: [e], activeEventId: 'e1' })), ev);
  await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
    JSON.stringify({ events: [e], activeEventId: 'e1' })), ev);
  await p.goto(`${BASE}/events/e1/costs`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);

  const rowText = () => p.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find(x => x.innerText.includes('טרול'));
    return li ? li.innerText.replace(/\s+/g, ' ').trim() : null;
  });
  const clickTroll = () => p.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find(x => x.innerText.includes('טרול'));
    li?.querySelector('button')?.click();
    return !!li?.querySelector('button');
  });

  console.log('── the donor list renders with a control');
  {
    const t = await rowText();
    ok(t !== null, 'the offending blessing is listed for the host', t || '(no row)');
    ok(/הסתירו מהקיר/.test(t || ''), 'and it offers to take it off the wall', t || '');
  }

  console.log('\n── one tap takes it down');
  {
    const clicked = await clickTroll();
    ok(clicked, 'the control is a real button');
    await p.waitForTimeout(900);
    const t = await rowText();
    ok(/מוסתר מהקיר/.test(t || ''), 'the row says so immediately', t || '');
    ok(/החזירו לקיר/.test(t || ''), 'and offers to undo it', t || '');
    ok(patches.length === 1, 'exactly one write went out', String(patches.length));
    ok(/"hidden":true/.test(patches[0]?.body || ''), 'and it set hidden', patches[0]?.body || '');
    ok(/id=eq\.gift-2/.test(patches[0]?.url || ''), 'on the right row', patches[0]?.url || '');
  }

  console.log('\n── a row that arrives hidden shows as hidden');
  {
    const t = await p.evaluate(() => {
      const li = [...document.querySelectorAll('li')].find(x => x.innerText.includes('הוסתר קודם'));
      return li ? li.innerText.replace(/\s+/g, ' ').trim() : null;
    });
    ok(/מוסתר מהקיר/.test(t || ''), 'the host can see it was already taken down', t || '(no row)');
    ok(/החזירו לקיר/.test(t || ''), 'and can put it back', t || '');
  }

  console.log('\n── and putting one back works');
  {
    patches.length = 0;
    await clickTroll();                       // troll is currently hidden
    await p.waitForTimeout(900);
    const t = await rowText();
    ok(!/מוסתר מהקיר/.test(t || ''), 'the row is on the wall again', t || '');
    ok(/הסתירו מהקיר/.test(t || ''), 'and offers to hide it once more', t || '');
    ok(/"hidden":false/.test(patches[0]?.body || ''), 'the write cleared the flag', patches[0]?.body || '');
    // Put it back to hidden for the failure case below.
    await clickTroll();
    await p.waitForTimeout(900);
  }

  console.log('\n── the record stays with the host');
  {
    const t = await rowText();
    ok(/טרול/.test(t || ''), 'the blessing is still in the host\'s list — hiding is not deleting');
    const body = await p.evaluate(() => document.body.innerText);
    ok(/משפחת כהן/.test(body), 'and the real blessing is untouched');
  }

  console.log('\n── a failed write puts the row back and says so');
  {
    failPatch = true;
    await clickTroll();
    await p.waitForTimeout(1200);
    const t = await rowText();
    // The one outcome worse than doing nothing: the screen claiming the
    // blessing is hidden while the projector still shows it.
    ok(/מוסתר מהקיר/.test(t || ''), 'the row reverts to hidden', t || '');
    const body = await p.evaluate(() => document.body.innerText);
    ok(/לא הצלחנו לעדכן/.test(body), 'and the host is told', body.slice(0, 80));
  }

  ok(errs.length === 0, 'no page error', errs[0] || '');
} finally {
  await b.close();
  stopVite();
}

console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
