// What Google Analytics would receive on the token-bearing pages (127).
//
// The 29.9 review (סב10) found PostHog sending a raw collab token and a guest's
// NAME from ?n=. GA has no before_send hook, so analytics.js sets the page,
// referrer and title gtag attaches by itself, and scrubs every parameter.
//
// Builds with a fake GA id, as a browser that already said yes (the host
// trying the links; a guest's own browser is never measured —
// qa/cookieConsent.mjs). googletagmanager.com is unreachable from here, so a
// stub gtag.js is served and window.dataLayer — everything our code hands to
// gtag — is read back, plus every request to a Google host.
// NOT covered: what the real gtag.js adds by itself. GA's DebugView after
// deploy is the check for that (WORKPLAN 127).
//   node qa/gaPrivacy.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const OUT = mkdtempSync(join(tmpdir(), 'gapriv-'));
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_GA_ID: 'G-TEST12345' },
});
const server = await startPreview(4793, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const GOOGLE = /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net)$/;

const NAME = 'יעל כהן';
const CASES = [
  { path: '/collab/COLLABSECRET99', secrets: ['COLLABSECRET99'] },
  { path: '/hostess/HOSTESSSECRET9', secrets: ['HOSTESSSECRET9'] },
  { path: '/rsvp/RSVPSECRET888', secrets: ['RSVPSECRET888'] },
  { path: '/card/CARDSECRET77?g=g_abc123&n=' + encodeURIComponent(NAME) + '&t=' + encodeURIComponent('שולחן 4'),
    secrets: ['CARDSECRET77', 'g_abc123', 'יעל', '%D7%99%D7%A2%D7%9C', 'שולחן'] },
];

try {
  for (const c of CASES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const google = [];
    await ctx.route(u => GOOGLE.test(new URL(u).hostname), async (route) => {
      google.push(route.request().url() + ' ' + (route.request().postData() || ''));
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' });
    });
    await p.addInitScript(() => {
      localStorage.setItem('kochav_consent_v1', JSON.stringify({ analytics: true, at: '2026-10-03T00:00:00.000Z' }));
    });
    // Arrive FROM another token page, so the referrer is a token-bearing URL too.
    await p.goto(server.base + '/gift/REFERRERSECRET5', { waitUntil: 'domcontentloaded' });
    await p.evaluate(u => { location.href = u; }, server.base + c.path);
    await p.waitForLoadState('domcontentloaded');
    await p.waitForTimeout(2500);
    // Without a database the guest page has no event to name its tab after, so
    // a hosts'-names title is put there, and the page changes once more (a new
    // PATH: pageviews follow the pathname, a hash alone sends none) — the
    // first version of this check passed vacuously on the generic title.
    await p.evaluate(() => { document.title = 'אישור הגעה · דנה ויוסי'; history.pushState({}, '', '/pricing'); dispatchEvent(new PopStateEvent('popstate')); });
    await p.waitForTimeout(800);
    const layer = await p.evaluate(() => JSON.stringify((window.dataLayer || []).map(a => Array.from(a, v => v instanceof Date ? 'date' : v))));
    console.log(`\n── ${c.path.split('?')[0]}`);
    ok(/"page_view"/.test(layer), 'a page view went in (the check is live)');
    const leaked = [...c.secrets, 'REFERRERSECRET5'].filter(sec => layer.includes(sec) || google.some(g => g.includes(sec)));
    ok(leaked.length === 0, 'no token, guest id or guest name in anything handed to Google', leaked.join(', '));
    ok(!layer.includes('דנה'), 'the page title (the hosts\' names) is not handed over');
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
