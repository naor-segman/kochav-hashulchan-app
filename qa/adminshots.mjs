/* Screenshot each admin screen through qa/adminPreview.jsx (the panel itself
   sits behind AdminGuard, which needs a live admin session). */
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const DIR = new URL('./shots/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });

const all = ['dashboard', 'users', 'events', 'templates', 'subscriptions', 'activity', 'settings', 'login'];
const only = process.argv.slice(2).filter(a => !/^\d+$/.test(a));
const widths = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const screens = only.length ? only : all;

const PORT = process.env.ADMIN_PORT || '5188';

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
for (const w of (widths.length ? widths : [1280])) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  for (const s of screens) {
    await p.goto(`http://127.0.0.1:${PORT}/admin-preview.html?s=${s}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${DIR}/adm-${s}-${w}.png`, fullPage: true });
    console.log('shot', s, w);
  }
  await ctx.close();
}
await b.close();
