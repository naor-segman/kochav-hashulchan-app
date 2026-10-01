// One h1 on every guest page, in every state — and the page looks the same
// (29.9 second review, סב36). The published event site's hero, the personal
// entry card and three RSVP steps (details, "no", success) had no h1: the
// couple's names were a <div>, the step titles h2.
//
// Measures the heading outline, and — because the fix turns styled divs and
// spans into headings, which reset.css gives its own font, weight, line-height
// and letter-spacing — the computed style and box of each element that became
// a heading, printed so a before/after run can be compared.
//   node qa/guestH1.mjs            (writes the measurements to stdout)
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const SUPA = 'http://127.0.0.1:4808';
const OUT = mkdtempSync(join(tmpdir(), 'guesth1-'));
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};
execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: 'qa-dummy-key' },
});
const server = await startPreview(4807, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
const EV = { id: '11111111-1111-4111-8111-111111111111', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  venue: 'אולמי הגן', bride_name: 'דנה', groom_name: 'יוסי', rsvp_token: 'rsvp1234', invite_token: 'inv12345',
  site: { enabled: true, sections: {}, schedule: [] } };

const outline = p => p.evaluate(() => [...document.querySelectorAll('h1,h2,h3')]
  .filter(h => h.getClientRects().length).map(h => `h${h.tagName[1]} ${h.textContent.replace(/\s+/g, ' ').trim().slice(0, 30)}`));
const look = (p, sel) => p.evaluate(sel => {
  const el = document.querySelector(sel); if (!el) return 'missing';
  const c = getComputedStyle(el), r = el.getBoundingClientRect();
  return [c.fontFamily.split(',')[0], c.fontSize, c.fontWeight, c.lineHeight, c.letterSpacing, Math.round(r.width), Math.round(r.height)].join(' | ');
}, sel);

try {
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await ctx.route(SUPA + '/**', r => {
      const u = r.request().url();
      if (u.includes('public_event_by_token')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EV) });
      if (u.includes('submit_rsvp_by_token')) return r.fulfill({ status: 204, body: '' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const p = await ctx.newPage();
    const check = async (label, sel) => {
      const hs = await outline(p);
      ok(hs.filter(h => h.startsWith('h1')).length === 1 && hs[0]?.startsWith('h1'), `${width} ${label}: one h1, first`, hs.join(' · '));
      if (sel) console.log(`     look ${label}: ${await look(p, sel)}`);
    };
    await p.goto(server.base + '/invite/inv12345'); await p.waitForTimeout(700);
    await check('event site', '[class*=heroNames]');
    await p.goto(server.base + '/card/inv12345?g=g1&n=' + encodeURIComponent('יעל') + '&t=4'); await p.waitForTimeout(700);
    await check('personal card', '[class*=_names_]');
    await p.goto(server.base + '/rsvp/rsvp1234'); await p.waitForTimeout(700);
    await check('rsvp question');
    await p.getByRole('button', { name: /^כן/ }).first().click(); await p.waitForTimeout(300);
    await check('rsvp details', '[class*=eventBannerName]');
    await p.goto(server.base + '/rsvp/rsvp1234'); await p.waitForTimeout(700);
    await p.getByRole('button', { name: /^לא/ }).first().click(); await p.waitForTimeout(300);
    await check('rsvp no', '[class*=eventBannerName]');
    await p.fill('input', 'דנה כהן');
    await p.locator('button[type=submit], button', { hasText: /שלח/ }).last().click(); await p.waitForTimeout(700);
    await check('rsvp success', '[class*=successTitle]');
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
