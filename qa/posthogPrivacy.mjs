// What PostHog actually receives on a guest page — decoded off the wire.
// Second review 29.9 (סב10): with the key set, PostHog's /flags call (which
// does not pass through before_send) carried "$initial_current_url":
// ".../collab/<raw token>", and the personal card's ?n=<guest name> reached a
// $pageview. Dormant until VITE_POSTHOG_KEY is set in Netlify — this proves it
// before that happens.
//
// Builds with a fake key and a host the page routes to a stub, opens the guest
// routes, waits for the batch to flush, decodes every request body.
//   node qa/posthogPrivacy.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import zlib from 'zlib';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const OUT = mkdtempSync(join(tmpdir(), 'phpriv-'));
const PH = 'http://127.0.0.1:4794';   // nothing listens: every request is answered by the route below
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_POSTHOG_KEY: 'phc_test', VITE_POSTHOG_HOST: PH },
});
const server = await startPreview(4793, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

const decode = (buf) => {
  if (!buf?.length) return '';
  try { return zlib.gunzipSync(buf).toString('utf8'); } catch { /* not gzip */ }
  const raw = buf.toString('utf8');
  const m = /data=([^&]+)/.exec(raw);
  if (m) { try { return Buffer.from(decodeURIComponent(m[1]), 'base64').toString('utf8'); } catch { /* */ } }
  return raw;
};

const CASES = [
  { path: '/collab/COLLABSECRET99', secrets: ['COLLABSECRET99'] },
  { path: '/hostess/HOSTESSSECRET9', secrets: ['HOSTESSSECRET9'] },
  { path: '/card/CARDSECRET77?g=g_abc123&n=' + encodeURIComponent('יעל כהן') + '&t=' + encodeURIComponent('שולחן 4'),
    secrets: ['CARDSECRET77', 'g_abc123', 'יעל', '%D7%99%D7%A2%D7%9C', '\\u05d9\\u05e2\\u05dc'] },
];

try {
  for (const c of CASES) {
    // PostHog drops events from a browser that says it is automated — a
    // headless user agent or navigator.webdriver — so without these two the
    // stub hears nothing and every privacy check below passes vacuously.
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, serviceWorkers: 'block',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    });
    const p = await ctx.newPage();
    await p.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }); });
    const sent = [];
    await ctx.route(PH + '/**', async (route) => {
      const r = route.request();
      sent.push({ url: r.url().slice(PH.length), body: decode(r.postDataBuffer()) });
      if (/\.js(\?|$)/.test(r.url())) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
    });
    await p.goto(server.base + c.path);
    await p.waitForTimeout(6000);
    await p.goto('about:blank');          // pagehide flushes the batch
    await p.waitForTimeout(1000);
    console.log(`\n── ${c.path.split('?')[0]}  (${sent.length} requests: ${sent.map(s => s.url.split('?')[0]).join(' ')})`);
    ok(sent.some(s => s.url.startsWith('/e/') || s.url.startsWith('/batch') || s.url.startsWith('/i/')), 'an event reached the stub (the check is live)');
    ok(!sent.some(s => /^\/(flags|decide)/.test(s.url)), 'no feature-flag call');
    const leaked = c.secrets.filter(sec => sent.some(s => s.url.includes(sec) || s.body.includes(sec)));
    ok(leaked.length === 0, 'no token, guest id or guest name in any request', leaked.join(', '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
