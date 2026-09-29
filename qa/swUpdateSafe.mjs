// A deploy must not reload a page under someone's fingers (29.9 second
// review, סב13). With registerType 'autoUpdate' the PWA plugin reloaded the
// page itself the moment the new service worker activated — useAppUpdate's
// "only when safe" rule was never consulted. Measured before the fix: a field
// focused, text typed, a new build deployed, the periodic check fired — the
// page reloaded and the field was empty.
//
// Two builds of this tree (B differs only by a byte in its sw.js, which is
// all a browser needs to see an update), served by a tiny Netlify-like static
// server whose root is swapped mid-test.
//   node qa/swUpdateSafe.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, cpSync, appendFileSync, existsSync, statSync, createReadStream } from 'fs';
import { tmpdir } from 'os';
import { join, extname } from 'path';
import http from 'http';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const DIR = mkdtempSync(join(tmpdir(), 'swsafe-'));
const A = join(DIR, 'A'), B = join(DIR, 'B');
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', A, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
});
cpSync(A, B, { recursive: true });
appendFileSync(join(B, 'sw.js'), '\n// build B\n');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.xml': 'application/xml' };
let root = A;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let f = join(root, decodeURIComponent(u.pathname));
  if (!(existsSync(f) && statSync(f).isFile())) f = existsSync(join(f, 'index.html')) ? join(f, 'index.html') : join(root, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate' });
  createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(4798, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4798';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function session(path) {
  root = A;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const p = await ctx.newPage();
  let navs = 0;
  p.on('framenavigated', f => { if (f === p.mainFrame()) navs++; });
  await p.goto(BASE + path);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await sleep(2500);
  // A field of our own, so the check does not depend on one screen's markup.
  await p.evaluate(() => {
    const i = document.createElement('input'); i.id = 'qa-field';
    document.body.prepend(i);
  });
  await p.click('#qa-field');
  await p.keyboard.type('half-typed-addr@exam');
  const before = navs;
  root = B;
  // What useAppUpdate itself does every 60 seconds.
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  return { ctx, p, reloaded: () => navs > before };
}
const value = async p => (await p.$('#qa-field')) ? p.inputValue('#qa-field') : '(gone — the page reloaded)';

try {
  console.log('── host page (/signup): typing when the update lands');
  {
    const s = await session('/signup');
    await sleep(6000);
    ok(!s.reloaded(), 'no reload while the field has focus');
    ok(await value(s.p) === 'half-typed-addr@exam', 'the typed text is still there', await value(s.p));
    await s.p.evaluate(() => document.activeElement.blur());
    for (let i = 0; i < 20 && !s.reloaded(); i++) await sleep(500);
    ok(s.reloaded(), 'once nothing is focused, the update is applied');
    await s.ctx.close();
  }

  console.log('\n── guest page (/rsvp/…): typed into, then left for WhatsApp');
  {
    const s = await session('/rsvp/xxxxxxxx');
    await s.p.evaluate(() => document.activeElement.blur());
    await sleep(8000);
    ok(!s.reloaded(), 'no reload, even with nothing focused');
    ok(await value(s.p) === 'half-typed-addr@exam', 'the guest\'s text is still there', await value(s.p));
    await s.ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
  rmSync(DIR, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
