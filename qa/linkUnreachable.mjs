// Guest pages: "the server is unreachable" is not "this link is invalid".
// 28.9 audit (guest pages #2, #3, #9, #14; browser audit #2, #3).
//
// Until 28.9 every token fetcher returned null / [] for BOTH a failed call and
// an unknown token, so:
//   - a guest on bad reception read "the link is invalid, or the event was
//     cancelled" on every one of the guest pages
//   - the gift wall, projected in the hall, blanked on one failed poll
//   - the greeter's list at the door was replaced by "invalid link" when one
//     25-second refresh failed
//
// Runs against a PRODUCTION-SHAPED build (Supabase configured, pointed at a
// stub this script answers), because with Supabase unset several pages show a
// mock event instead of any error at all.
//
//   node qa/linkUnreachable.mjs        (builds into a temp dir, serves, cleans up)
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { chromium } = createRequire(ROOT + '/')('playwright');
const SUPA = 'http://127.0.0.1:4719';
const OUT  = mkdtempSync(join(tmpdir(), 'linkunreach-'));

const UNREACHABLE = 'אין חיבור כרגע';
const INVALID_RE  = /אינו תקין|לא תקין|אינו תקף|בוטל|לא נמצא|אינו פעיל/;

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: 'qa-dummy-key' },
});

const server = await startPreview(4718, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

const ROUTES = ['/rsvp/xxxxxxxx', '/invite/xxxxxxxx', '/invitation/xxxxxxxx', '/save-the-date/xxxxxxxx',
  '/card/xxxxxxxx', '/gift/xxxxxxxx', '/gift/xxxxxxxx/wall', '/album/xxxxxxxx', '/collab/xxxxxxxx',
  '/hostess/xxxxxxxx'];

async function open(path, answer) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(SUPA + '/**', answer);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.clock.install();
  await p.goto(server.base + path);
  await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(600);
  return { ctx, p, errs };
}
const text = p => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());

try {
  console.log('── server down (503): every page says connection, none says invalid link');
  for (const path of ROUTES) {
    const { ctx, p, errs } = await open(path, r =>
      r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }));
    const t = await text(p);
    const conn = t.includes(UNREACHABLE) || t.includes('שגיאת חיבור');
    ok(conn && !INVALID_RE.test(t), `${path}: connection message, not "invalid"`, t.slice(0, 110));
    ok(errs.length === 0, `${path}: no page error`, errs[0] || '');
    await ctx.close();
  }

  console.log('\n── unknown token (200 null): every page says invalid, none blames the connection');
  for (const path of ROUTES) {
    const { ctx, p } = await open(path, r => {
      const u = r.request().url();
      if (u.includes('/rest/v1/rpc/')) return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    const t = await text(p);
    ok(!t.includes(UNREACHABLE) && !/בדקו את החיבור/.test(t), `${path}: not blamed on the connection`, t.slice(0, 110));
    await ctx.close();
  }

  console.log('\n── the door: a failed REFRESH keeps the list on screen');
  {
    let calls = 0;
    const data = {
      id: '11111111-1111-4111-8111-111111111111', name: 'החתונה של דנה ויוסי',
      guests: [{ id: 'g1', name: 'יעל כהן', count: 2 }, { id: 'g2', name: 'איתי לוי', count: 1 }],
      tables: [{ id: 't1', name: 'שולחן 1', capacity: 10 }], seating: { g1: 't1', g2: 't1' }, writes_open: true,
    };
    const { ctx, p } = await open('/hostess/xxxxxxxx', r => {
      if (!r.request().url().includes('hostess_data_by_token')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      calls++;
      if (calls === 1) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      return r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' });
    });
    // The door screen lists names only after a search, so what proves the list
    // is loaded is the headcount (2 + 1 seats) and the event name.
    const loaded = t => t.includes('החתונה של דנה ויוסי') && t.includes('מתוך 3');
    ok(loaded(await text(p)), 'the first load shows the event and its headcount');
    await p.clock.runFor(26000);
    await p.waitForTimeout(500);
    const t = await text(p);
    ok(calls >= 2, 'a refresh was attempted and failed', `calls=${calls}`);
    ok(loaded(t) && !/שגיאת חיבור|אינו תקין/.test(t), 'the list is still there after it failed', t.slice(0, 100));
    await ctx.close();
  }

  console.log('\n── the projected wall: a failed poll keeps the blessings');
  {
    let wallCalls = 0;
    const ev = { id: '11111111-1111-4111-8111-111111111111', name: 'החתונה', bride_name: 'דנה', groom_name: 'יוסי' };
    const rows = [{ id: 'w1', donor_name: 'משפחת כהן', message: 'מזל טוב!', created_at: new Date().toISOString() }];
    const { ctx, p } = await open('/gift/xxxxxxxx/wall', r => {
      const u = r.request().url();
      if (u.includes('public_event_by_token')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ev) });
      if (u.includes('gift_wall_by_token')) {
        wallCalls++;
        if (wallCalls === 1) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
        return r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    ok((await text(p)).includes('משפחת כהן'), 'the first poll shows the blessing');
    // WORKPLAN ל2: "1 ברכות התקבלו" on the big screen.
    ok((await text(p)).includes('ברכה אחת התקבלה'), 'one blessing is counted in the singular');
    await p.clock.runFor(31000);
    await p.waitForTimeout(500);
    ok(wallCalls >= 2, 'a second poll was attempted and failed', `calls=${wallCalls}`);
    ok((await text(p)).includes('משפחת כהן'), 'the blessing is still on the wall');
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
