// Whose invitation it is, on the invitation (29.9 second review, סב20).
// ברית, בריתה, יום הולדת, אירוע משפחתי and אחר keep their one name in
// `ownerName`, and the save-the-date / invitation read only bride & groom,
// celebrant and organisation: a birthday invitation said "אתם מוזמנים לחגוג"
// and named nobody, and the page had no h1.
//
// Local build, events seeded into localStorage, the host's preview of each.
//   node qa/announceNames.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const OUT = mkdtempSync(join(tmpdir(), 'announcenames-'));
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
});
const server = await startPreview(4804, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });

const TYPES = [['ברית', 'איתי'], ['בריתה', 'נועה'], ['יום הולדת', 'דניאל'], ['אירוע משפחתי', 'משפחת כהן'], ['אחר', 'רותם']];
const EVENTS = TYPES.map(([type, owner], i) => ({
  id: 'e' + i, name: 'האירוע ' + i, type, date: '2027-06-01', ownerName: owner,
  guests: [], tables: [], seating: {}, constraints: [],
  announcements: { saveTheDate: { published: true, message: '' }, invitation: { published: true, message: '' } },
}));

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(server.base + '/app');
  await p.evaluate(evs => localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: evs, activeEventId: 'e0' })), EVENTS);
  for (const [i, [type, owner]] of TYPES.entries()) {
    for (const kind of ['invitation', 'saveTheDate']) {
      await p.goto(`${server.base}/events/e${i}/preview-announce/${kind}`);
      await p.waitForTimeout(500);
      const h1 = await p.evaluate(() => [...document.querySelectorAll('h1')].map(h => h.textContent.trim()));
      ok(h1.length === 1 && h1[0] === owner, `${type} · ${kind}: the h1 names ${owner}`, JSON.stringify(h1));
    }
  }
  // סב36: the "לאתר האירוע" button only when the site is published.
  for (const enabled of [false, true]) {
    const ev = { ...EVENTS[0], id: 'site' + enabled, tokens: { invite: 'inv12345', rsvp: 'rsvp1234' },
      eventSite: { enabled, sections: {} } };
    await p.evaluate(e => { const st = JSON.parse(localStorage.getItem('kochav_hashulchan_v1')); st.events.push(e);
      localStorage.setItem('kochav_hashulchan_v1', JSON.stringify(st)); }, ev);
    await p.goto(`${server.base}/events/${ev.id}/preview-announce/invitation`);
    await p.waitForTimeout(500);
    const has = await p.evaluate(() => [...document.querySelectorAll('a')].some(a => /לאתר האירוע/.test(a.textContent)));
    ok(has === enabled, `site ${enabled ? 'published' : 'not published'}: the site button is ${enabled ? 'there' : 'not there'}`);
  }
  await ctx.close();
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
