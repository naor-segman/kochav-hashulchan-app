// The auth email links, off the wire (131, owner 3.10).
//
// The owner clicked a fresh password-reset link and got "הקישור אינו תקף":
// Supabase's /verify link is a one-time GET that a mail scanner spends before
// the person clicks. The emails now link to our own pages with a token_hash,
// and this checks what actually leaves the browser against a stubbed Supabase:
//   • opening /reset-password?token_hash=… or /auth/callback?token_hash=…
//     sends NO /auth/v1/verify request — what a scanner does spends nothing;
//   • the person's own submit / click sends exactly one, then sets the password;
//   • a spent link offers "שלחו לי קישור חדש" and that sends /auth/v1/recover;
//   • phone (390) and desktop: the pages fit, nothing scrolls sideways.
//   node qa/authLinks.mjs
import { createRequire } from 'module';
import { startDev } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const { base, stop } = await startDev(5196, {
  VITE_SUPABASE_URL: 'https://stub.supabase.co', VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
});
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

const SESSION = {
  access_token: 'stub-access', refresh_token: 'stub-refresh', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'u-1', aud: 'authenticated', role: 'authenticated', email: 'host@example.com', app_metadata: {}, user_metadata: {} },
};

/** A fresh browser with Supabase stubbed; `verify` decides what /verify answers. */
async function page({ width = 390, height = 844, verify = 'ok' } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const calls = [];
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await p.route('**/stub.supabase.co/**', async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    calls.push(`${r.method()} ${u.pathname}`);
    if (u.pathname.endsWith('/auth/v1/verify')) {
      if (verify === 'spent') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) });
    }
    if (u.pathname.endsWith('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION.user) });
    if (u.pathname.endsWith('/auth/v1/recover')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (r.method() === 'GET' && u.pathname.includes('/rest/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  return { ctx, p, calls, errs };
}
const verifies = (calls) => calls.filter(c => c.endsWith('/auth/v1/verify'));
const hscroll = (p) => p.evaluate(() => { window.scrollTo({ left: -1e5, behavior: 'instant' }); const x = window.scrollX; window.scrollTo({ left: 0, behavior: 'instant' }); return x; });

try {
  for (const [w, h] of [[390, 844], [1280, 860]]) {
    console.log(`\n── the reset link, ${w}px`);
    const { ctx, p, calls, errs } = await page({ width: w, height: h });
    await p.goto(`${base}/reset-password?token_hash=abc123&type=recovery`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);   // longer than any scanner waits
    ok(verifies(calls).length === 0, 'opening the link sends nothing to /verify — a scanner spends nothing', calls.join(' | '));
    ok(await p.getByLabel('סיסמה חדשה').isVisible(), 'the form is there straight away');
    ok(await hscroll(p) === 0, 'no horizontal scroll');
    await p.getByLabel('סיסמה חדשה').fill('secret12');
    await p.getByLabel('אימות סיסמה').fill('secret12');
    await p.getByRole('button', { name: 'עדכנו סיסמה' }).click();
    await p.waitForTimeout(1200);
    const v = verifies(calls);
    const putUser = calls.filter(c => c === 'PUT /auth/v1/user');
    ok(v.length === 1 && putUser.length === 1, 'submit: one /verify, then the password is set', calls.join(' | '));
    ok(calls.indexOf(v[0]) < calls.indexOf(putUser[0]), 'in that order');
    ok((await p.textContent('main')).includes('הסיסמה עודכנה'), 'and it says so');
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await ctx.close();
  }

  console.log('\n── a spent reset link');
  {
    const { ctx, p, calls, errs } = await page({ verify: 'spent' });
    await p.goto(`${base}/reset-password?token_hash=old&type=recovery`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(800);
    await p.getByLabel('סיסמה חדשה').fill('secret12');
    await p.getByLabel('אימות סיסמה').fill('secret12');
    await p.getByRole('button', { name: 'עדכנו סיסמה' }).click();
    await p.waitForTimeout(800);
    ok(!calls.includes('PUT /auth/v1/user'), 'no password is set on a refused link');
    ok((await p.textContent('main')).includes('הקישור הזה כבר לא פעיל'), 'it says the link is no longer active');
    await p.getByLabel('כתובת האימייל').fill('host@example.com');
    await p.getByRole('button', { name: 'שלחו לי קישור חדש' }).click();
    await p.waitForTimeout(800);
    ok(calls.some(c => c === 'POST /auth/v1/recover'), 'and sends a new one from right there', calls.join(' | '));
    ok((await p.textContent('main')).includes('שלחנו קישור חדש'), 'confirming where it went');
    ok(await hscroll(p) === 0, 'no horizontal scroll');
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await ctx.close();
  }

  console.log('\n── the signup confirmation link');
  {
    const { ctx, p, calls, errs } = await page();
    await p.goto(`${base}/auth/callback?token_hash=sig123&type=email`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    ok(verifies(calls).length === 0, 'opening it sends nothing to /verify', calls.join(' | '));
    await p.getByRole('button', { name: 'אישור והמשך' }).click();
    await p.waitForTimeout(800);
    ok(verifies(calls).length === 1, 'the button sends exactly one');
    ok((await p.textContent('main')).includes('האימייל אושר'), 'and says it worked');
    await p.waitForURL('**/app', { timeout: 4000 }).catch(() => {});
    ok(new URL(p.url()).pathname === '/app', 'then goes to the app', p.url());
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await ctx.close();
  }
} finally {
  await b.close();
  await stop();
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
