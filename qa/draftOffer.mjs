// A draft made WITHOUT an account, on a shared browser (33d, owner 2.10).
//
// Before: signing in pulled every logged-out draft on the browser into the
// account that signed in — a stranger's guest list, phone numbers included,
// landing in whoever used the computer next. Now the draft is offered by name
// and joins only on a yes; "לא שלי" leaves it on the browser, logged out. And
// a signup started from inside the draft carries it in with no question, since
// the share dialog promised exactly that.
//
// Logged-in session against a stubbed Supabase; every assertion reads the DOM
// or localStorage back, never the code that wrote it.
//   node qa/draftOffer.mjs
import { createRequire } from 'module';
import { startDev } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const GUEST_KEY = 'kochav_hashulchan_v1';
const userKey = (id) => `${GUEST_KEY}::u_${id}`;
const draft = {
  id: 'd-shared', cloudId: null, name: 'החתונה של דנה', type: 'חתונה', date: '2027-06-01',
  guests: [{ id: 'g1', name: 'יעל כהן', phone: '0501234567', count: 2 }],
  tables: [], seating: {}, constraints: [], tasks: [], vendors: [],
  tokens: { rsvp: 'r', invite: 'i', gift: 'g', album: 'a', hostess: 'h', collab: 'c' },
  createdAt: 1, updatedAt: 1, version: 1,
};

const { base, stop } = await startDev(5195, {
  VITE_SUPABASE_URL: 'https://stub.supabase.co', VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
});
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

/** A fresh browser profile (one "computer"), logged in as `uid`. */
async function computer(uid, { carry = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  const creates = [];
  await p.route('**/stub.supabase.co/**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes('/rest/v1/events') && req.method() === 'POST') {
      creates.push(JSON.parse(req.postData() || '{}'));
      return route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ id: '0b6f6c1e-1111-4222-8333-44445555' + String(creates.length).padStart(4, '0'), version: 1 }) });
    }
    if (req.method() === 'GET' && url.includes('/rest/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await p.goto(`${base}/home`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(([gk, d, id, carryIt]) => {
    // The draft someone made logged out on this browser.
    localStorage.setItem(gk, JSON.stringify({ events: [d] }));
    const year = Math.floor(Date.now() / 1000) + 31_536_000;
    localStorage.setItem('sb-stub-auth-token', JSON.stringify({
      access_token: 'stub-access', refresh_token: 'stub-refresh', token_type: 'bearer',
      expires_in: 31_536_000, expires_at: year,
      user: { id, aud: 'authenticated', role: 'authenticated',
              email: `${id}@example.com`, app_metadata: {}, user_metadata: {} },
    }));
    if (carryIt) sessionStorage.setItem('kochav_carry_drafts', String(Date.now()));
  }, [GUEST_KEY, draft, uid, carry]);
  await p.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  return { ctx, p, errs, creates };
}

const ids = (p, key) => p.evaluate(k => (JSON.parse(localStorage.getItem(k) || '{"events":[]}').events || []).map(e => e.id), key);
const banner = (p) => p.evaluate(() => document.querySelector('[aria-label="אירועים שנוצרו בלי חשבון"]')?.innerText.replace(/\s+/g, ' ').trim() || '');
// Waits rather than reads once: a single read raced the render and failed on
// a page that showed the event a moment later.
const onDashboard = (p) => p.waitForFunction(() => document.body.innerText.includes('החתונה של דנה'), null, { timeout: 5000 })
  .then(() => true, () => false);
const click = (p, label) => p.evaluate(l => [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(l))?.click(), label);

try {
  console.log('── someone else signs in on the same computer');
  {
    const { ctx, p, errs, creates } = await computer('u-other');
    const text = await banner(p);
    ok(text.includes('החתונה של דנה'), 'the banner NAMES the draft', text.slice(0, 90));
    ok(JSON.stringify(await ids(p, userKey('u-other'))) === '[]', 'the account holds nothing of it yet');
    ok(JSON.stringify(await ids(p, GUEST_KEY)) === '["d-shared"]', 'it is still in the logged-out bucket');
    ok(creates.length === 0, 'nothing was uploaded', `${creates.length}`);

    await click(p, 'לא שלי');
    await p.waitForTimeout(500);
    ok(await banner(p) === '', '"לא שלי" closes the banner');
    ok(JSON.stringify(await ids(p, userKey('u-other'))) === '[]', 'and the account still holds nothing of it');
    ok(JSON.stringify(await ids(p, GUEST_KEY)) === '["d-shared"]', 'and it stays on the browser for whoever made it');

    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    ok(await banner(p) === '', 'not offered to this account again after a reload');
    ok(creates.length === 0, 'still nothing uploaded', `${creates.length}`);
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await ctx.close();
  }

  console.log('── the person who made it signs in and says yes');
  {
    const { ctx, p, errs, creates } = await computer('u-owner');
    ok((await banner(p)).includes('החתונה של דנה'), 'offered by name');
    await click(p, 'צרפו לחשבון');
    await p.waitForTimeout(2500);
    ok(await onDashboard(p), 'the event is on the dashboard');
    ok(JSON.stringify(await ids(p, userKey('u-owner'))) === '["d-shared"]', 'it now lives in the account\'s bucket');
    ok(JSON.stringify(await ids(p, GUEST_KEY)) === '[]', 'and is gone from the logged-out bucket');
    ok(creates.length === 1 && creates[0].payload?.localId === 'd-shared', 'uploaded exactly once — this draft', JSON.stringify(creates.map(c => c.payload?.localId)));
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await ctx.close();
  }

  console.log('── signed up from inside the draft (the share dialog / הצטרפו)');
  {
    const { ctx, p, errs, creates } = await computer('u-new', { carry: true });
    ok(await banner(p) === '', 'no question asked');
    ok(await onDashboard(p), 'the event is on the dashboard straight away');
    ok(JSON.stringify(await ids(p, GUEST_KEY)) === '[]', 'gone from the logged-out bucket');
    // The upload starts once the account's cloud read returns; on a loaded
    // machine that is past a fixed 2.5s wait, and a single read flaked (3.10).
    for (let t = 0; t < 40 && creates.length === 0; t++) await p.waitForTimeout(200);
    await p.waitForTimeout(400);   // and no second upload follows
    ok(creates.length === 1, 'uploaded once, with no click', `${creates.length}`);
    ok(await p.evaluate(() => sessionStorage.getItem('kochav_carry_drafts')) === null, 'the carry mark is used up');
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await ctx.close();
  }
} finally {
  await b.close();
  await stop();
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
