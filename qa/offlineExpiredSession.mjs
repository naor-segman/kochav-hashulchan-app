// The host at a venue with no signal, an hour after they last opened the app
// (29.9 second review, סב14). supabase-js must refresh an expired access
// token; offline that retries for ~50 s and then resolves with no session.
// Measured before the fix: /app and the door screen blank for 52 s, then
// guest mode — the host's own events, stored on this device, nowhere.
//
// Production-shaped build; Supabase unreachable (every request aborted); an
// expired session and the host's event seeded into localStorage.
//   node qa/offlineExpiredSession.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const SUPA = 'http://stub.supabase.co';
const OUT  = mkdtempSync(join(tmpdir(), 'offlinesess-'));
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: 'qa-dummy-key' },
});
const server = await startPreview(4799, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });

const USER = { id: 'u-host', aud: 'authenticated', role: 'authenticated', email: 'host@example.com',
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const EV = { id: 'ev1', name: 'החתונה שלנו', type: 'חתונה', date: '2027-01-01', tables: [],
  guests: [{ id: 'g1', name: 'יעל כהן', count: 1 }], seating: {}, constraints: [],
  version: 2, syncedVersion: 1, cloudId: 'c1', createdAt: 1, updatedAt: 1 };

try {
  for (const path of ['/app', '/events/ev1/entrance', '/events/ev1/seating']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.route(SUPA + '/**', r => r.abort('internetdisconnected'));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const p = await ctx.newPage();
    await p.goto(server.base + '/help');
    await p.evaluate(([u, ev]) => {
      localStorage.setItem('kochav_orientation_v1', '1');
      localStorage.setItem('sb-stub-auth-token', JSON.stringify({
        access_token: 'stub-access', refresh_token: 'stub-refresh', token_type: 'bearer',
        expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 3600, user: u,
      }));
      localStorage.setItem('kochav_hashulchan_v1::u_u-host', JSON.stringify({ events: [ev] }));
    }, [USER, EV]);
    const t0 = Date.now();
    await p.goto(server.base + path);
    let seen = null;
    for (let i = 0; i < 20 && !seen; i++) {
      await p.waitForTimeout(500);
      const t = await p.evaluate(() => document.body.innerText);
      if (t.includes('החתונה שלנו')) seen = Date.now() - t0;
    }
    ok(seen !== null && seen < 8000, `${path}: the host's event is on screen within 8 s`, seen ? `${seen} ms` : 'not within 10 s');
    const t = await p.evaluate(() => location.pathname + ' | ' + document.body.innerText.replace(/\s+/g, ' ').slice(0, 80));
    ok(!/הצטרפו חינם/.test(t), `${path}: not guest mode`, t);
    ok(new URL(p.url()).pathname === path, `${path}: still on the page that was opened`, new URL(p.url()).pathname);
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
