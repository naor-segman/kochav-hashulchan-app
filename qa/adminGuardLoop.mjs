// /admin with a session whose role cannot be checked (29.9 second review,
// סב18). The guard sent a failed profile read to /admin/login; the login
// screen sent any session straight back to /admin/dashboard. Measured before
// the fix: 96 profile requests in 6 seconds, and "access denied" never on
// screen long enough to read. Realistic trigger: the owner opens /admin while
// Supabase is down.
//
// Production-shaped build, a signed-in session seeded, the profiles read
// answered 500 (and, second case, with no row at all).
//   node qa/adminGuardLoop.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const SUPA = 'http://stub.supabase.co';
const OUT  = mkdtempSync(join(tmpdir(), 'adminloop-'));
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: 'qa-dummy-key' },
});
const server = await startPreview(4803, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
const USER = { id: 'u-owner', aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', app_metadata: {}, user_metadata: {} };

async function run(label, profiles) {
  console.log(`\n── ${label}`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  let reads = 0;
  await ctx.route(SUPA + '/**', r => {
    const u = r.request().url();
    if (u.includes('/rest/v1/profiles')) { reads++; return profiles(r); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const p = await ctx.newPage();
  await p.goto(server.base + '/help');
  await p.evaluate(u => localStorage.setItem('sb-stub-auth-token', JSON.stringify({
    access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: u })), USER);
  await p.goto(server.base + '/admin');
  await p.waitForTimeout(6000);
  const t = await p.evaluate(() => location.pathname + ' | ' + document.body.innerText.replace(/\s+/g, ' ').slice(0, 90));
  await ctx.close();
  return { reads, t };
}

try {
  const a = await run('the profile read fails (500)', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"down"}' }));
  ok(a.reads <= 2, 'the role is asked once, not in a loop', `${a.reads} profile reads in 6 s`);
  ok(/לא ניתן לאמת הרשאות מנהל/.test(a.t), 'and the reason is on screen', a.t);

  // NOTE: this case does not tell .single() from .maybeSingle() — the stub
  // answers [] and does not reproduce PostgREST's 406 for "no row". It pins
  // the outcome (out of the panel, no loop), not the call. The first case is
  // the one observed failing on the old code: 164 reads in 6 s.
  const b = await run('the account has no profile row', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  ok(b.reads <= 2, 'no loop', `${b.reads} profile reads in 6 s`);
  ok(!b.t.startsWith('/admin'), 'treated as "not an admin": sent out of the panel', b.t);
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
