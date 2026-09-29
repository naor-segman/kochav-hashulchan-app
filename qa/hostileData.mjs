// Stored data the app never writes but can meet — a hand-edited cloud row,
// corrupted storage, a future writer bug — must not take the app down (third
// review 30.9, סב49). Measured before the fix: one null guest row put the
// dashboard and every screen of the event on the error page, with "back home"
// looping into it; a number in sideLabels.bride threw inside normalizeEvent
// and took down the whole site.
//
// Local build, each case seeded into localStorage beside a good event.
//   node qa/hostileData.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const OUT = mkdtempSync(join(tmpdir(), 'hostile-'));
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};
execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
});
const server = await startPreview(4809, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });

const GOOD = { id: 'good', name: 'האירוע הטוב', type: 'חתונה', guests: [{ id: 'g1', name: 'דנה', count: 2 }],
  tables: [{ id: 't1', name: 'שולחן 1', capacity: 10 }], seating: { g1: 't1' } };
const base = { id: 'bad', name: 'אירוע', type: 'חתונה', guests: [{ id: 'g1', name: 'דנה' }], tables: [{ id: 't1', name: 'שולחן 1', capacity: 10 }], seating: {} };
const CASES = [
  ['a null guest row', { ...base, guests: [null, { id: 'g1', name: 'דנה' }] }],
  ['a null table row', { ...base, tables: [null, { id: 't1', capacity: 10 }] }],
  ['a number in sideLabels', { ...base, sideLabels: { bride: 5, groom: 6 } }],
  ['a number as the custom domain', { ...base, eventSite: { customDomain: 5 } }],
  ['numbers where names belong', { ...base, name: 12345, guests: [{ id: 'g1', name: 42, phone: 521234567, companions: [5] }], tables: [{ id: 't1', name: 1, capacity: 10 }] }],
  ['a count that is text', { ...base, guests: [{ id: 'g1', name: 'דנה', count: 'abc' }, { id: 'g2', name: 'רון', count: '3' }] }],
  ['null rows in tasks, vendors and the site', { ...base, tasks: [null], vendors: [null], eventSite: { schedule: [null], faq: [null], shuttles: [null] } }],
];
const ROUTES = ['/app', '/events/bad', '/events/bad/guests', '/events/bad/seating', '/events/bad/tables', '/events/bad/rsvps',
  '/events/bad/messages', '/events/bad/nametags', '/events/bad/tasks', '/events/bad/vendors', '/events/bad/site',
  '/events/bad/entrance', '/events/bad/preview-site', '/events/good/seating'];

try {
  for (const [label, ev] of CASES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(server.base + '/help');
    await p.evaluate(evs => localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: evs, activeEventId: 'bad' })), [GOOD, ev]);
    const broken = [];
    for (const r of ROUTES) {
      await p.goto(server.base + r);
      await p.waitForTimeout(350);
      const t = await p.evaluate(() => document.body.innerText);
      if (/שגיאה בלתי צפויה/.test(t) || /\bNaN\b|undefined|\[object Object\]/.test(t)) broken.push(r);
    }
    ok(broken.length === 0 && errs.length === 0, `${label}: every screen renders`, [...broken, ...errs.slice(0, 1)].join(', '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
