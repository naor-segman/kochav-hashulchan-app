// A locked table takes no one new on "חשבו מחדש" (29.9 second review, סב9).
// Before the fix this seeded event came back with all seven guests at the
// locked table. Local-only build, event seeded into localStorage, the result
// read back out of localStorage.
//   node qa/seatingLockedTable.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { startPreview } = await import(ROOT + '/qa/lib/preview.mjs');
const { chromium } = createRequire(ROOT + '/')('playwright');
let ok = false;
const OUT = mkdtempSync(join(tmpdir(), 'lock-'));
execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } });
const server = await startPreview(4791, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
  const guests = ['a','b','c','d','e','f','g'].map((id, i) => ({ id, name: 'אורח ' + (i+1), side: 'bride', group: 'משפחה', count: 1, rsvp: 'confirmed' }));
  const EV = { id: 'e1', name: 'בדיקה', type: 'חתונה', date: '2027-06-01', guests,
    tables: [{ id: 'T1', name: 'שולחן 1', capacity: 10, type: 'regular', shape: 'round' }, { id: 'T2', name: 'שולחן 2', capacity: 10, type: 'regular', shape: 'round' }],
    seating: { a: 'T2' }, lockedTables: ['T2'], constraints: [] };
  await p.goto(server.base + '/app');
  await p.evaluate(ev => localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: [ev], activeEventId: 'e1' })), EV);
  await p.goto(server.base + '/events/e1/seating');
  await p.waitForTimeout(800);
  await p.locator('button', { hasText: 'חשבו מחדש' }).first().click();
  await p.waitForTimeout(400);
  const ov = p.locator('[class*=_overlay_]');
  await ov.locator('button', { hasText: 'חשבו מחדש' }).click();
  await p.waitForTimeout(600);
  const seating = await p.evaluate(() => JSON.parse(localStorage.getItem('kochav_hashulchan_v1')).events[0].seating);
  const atT2 = Object.entries(seating).filter(([, t]) => t === 'T2').map(([g]) => g);
  console.log('  seating', JSON.stringify(seating));
  ok = atT2.join(',') === 'a' && Object.keys(seating).length === 7;
  console.log(ok ? '  ok   the locked table kept only its occupant; the rest are seated' : '  FAIL at the locked table: ' + atT2.join(','));

  // סב48: a guest bound "together" to someone at a locked table joins them —
  // the first fix split the pair and the assistant sent the host round in a
  // circle.
  const EV2 = { id: 'e2', name: 'יחד', type: 'חתונה', date: '2027-06-01',
    guests: [{ id: 'A', name: 'אבא', side: 'bride', group: 'משפחה', count: 1, rsvp: 'confirmed' },
             { id: 'B', name: 'בת', side: 'bride', group: 'משפחה', count: 1, rsvp: 'confirmed' }],
    tables: [{ id: 'T1', name: 'שולחן 1', capacity: 4, type: 'regular', shape: 'round' }, { id: 'T2', name: 'שולחן 2', capacity: 10, type: 'regular', shape: 'round' }],
    seating: { A: 'T1' }, lockedTables: ['T1'], constraints: [{ id: 'c1', type: 'together', guestA: 'A', guestB: 'B' }] };
  await p.evaluate(ev => { const st = JSON.parse(localStorage.getItem('kochav_hashulchan_v1')); st.events.push(ev);
    localStorage.setItem('kochav_hashulchan_v1', JSON.stringify(st)); }, EV2);
  await p.goto(server.base + '/events/e2/seating');
  await p.waitForTimeout(800);
  await p.locator('button', { hasText: 'חשבו מחדש' }).first().click();
  await p.waitForTimeout(400);
  await p.locator('[class*=_overlay_]').locator('button', { hasText: 'חשבו מחדש' }).click();
  await p.waitForTimeout(600);
  const s2 = await p.evaluate(() => JSON.parse(localStorage.getItem('kochav_hashulchan_v1')).events.find(e => e.id === 'e2').seating);
  const ok2 = s2.A === 'T1' && s2.B === 'T1';
  console.log(ok2 ? '  ok   the together-partner joined the locked table' : '  FAIL together-partner split: ' + JSON.stringify(s2));
  ok = ok && ok2;
} finally { await browser.close(); await server.stop(); rmSync(OUT, { recursive: true, force: true }); }
process.exit(ok ? 0 : 1);
