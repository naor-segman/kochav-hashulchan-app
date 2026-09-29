// The greeter at the door when the signal comes and goes (29.9 second
// review, סב12). Measured before the fix: three check-ins in a dead spot all
// reverted under one line that named nobody; when the signal came back 0 of
// them were re-sent; the line stayed up even after the other greeter checked
// those families in; and a reload with no signal replaced the whole door with
// "שגיאת חיבור — נסו לרענן את הדף".
//
// Production-shaped build pointed at a stub this script answers.
//   node qa/doorOutbox.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const SUPA = 'http://127.0.0.1:4797';
const OUT  = mkdtempSync(join(tmpdir(), 'dooroutbox-'));
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: 'qa-dummy-key' },
});
const server = await startPreview(4796, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

// A stub server with state: the guests' arrivedSeats, what the mark RPC does
// (ok | fail), and whether the data RPC answers at all.
function stub() {
  const st = {
    seats: { g1: [], g2: [] }, marks: [], markMode: 'ok', dataMode: 'ok', delays: [],
    data() {
      return {
        id: '11111111-1111-4111-8111-111111111111', name: 'החתונה של דנה ויוסי', writes_open: true,
        guests: [{ id: 'g1', name: 'יעל כהן', count: 2, arrivedSeats: st.seats.g1 },
                 { id: 'g2', name: 'איתי לוי', count: 1, arrivedSeats: st.seats.g2 }],
        tables: [{ id: 't1', name: 'שולחן 1', capacity: 10 }], seating: { g1: 't1', g2: 't1' },
      };
    },
  };
  st.route = r => {
    const u = r.request().url();
    if (u.includes('hostess_mark_arrival_by_token')) {
      const b = JSON.parse(r.request().postData() || '{}');
      st.marks.push({ ...b, mode: st.markMode });
      const wait = st.delays.shift() || 0;
      if (wait) {
        // A slow network: the server applies the write only when it answers.
        return new Promise(done => setTimeout(() => {
          st.seats[b.guest_id] = b.seats; done(r.fulfill({ status: 204, body: '' }));
        }, wait));
      }
      if (st.markMode === 'fail') return r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' });
      st.seats[b.guest_id] = b.seats;
      return r.fulfill({ status: 204, body: '' });
    }
    if (u.includes('hostess_data_by_token')) {
      if (st.dataMode === 'down') return r.abort('internetdisconnected');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(st.data()) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  };
  return st;
}

async function door(st) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(SUPA + '/**', st.route);
  const p = await ctx.newPage();
  await p.clock.install();
  await p.goto(server.base + '/hostess/xxxxxxxx');
  await p.waitForTimeout(800);
  return { ctx, p };
}
const text = p => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
const tapFamily = async (p, q) => {
  await p.fill('input[type="search"]', q);
  await p.waitForTimeout(250);
  await p.locator('button', { hasText: /כולם הגיעו|הגיע\/ה/ }).first().click();
  await p.waitForTimeout(400);
};
const refresh = async p => { await p.clock.runFor(26000); await p.waitForTimeout(600); };

try {
  console.log('── a failed check-in is named, and re-sent when the signal is back');
  {
    const st = stub();
    const { ctx, p } = await door(st);
    st.markMode = 'fail';
    await tapFamily(p, 'יעל');
    let t = await text(p);
    ok(/לא נשמר: .*יעל כהן/.test(t), 'the failure names the family', t.match(/לא נשמר[^—]*/)?.[0] || t.slice(0, 120));
    ok(/0 מתוך 3/.test(t), 'the count went back — not shown as checked in');
    st.markMode = 'ok';
    await refresh(p);
    t = await text(p);
    const resent = st.marks.filter(m => m.mode === 'ok' && m.guest_id === 'g1');
    ok(resent.length === 1 && JSON.stringify(resent[0].seats) === '[0,1]', 'the check-in was re-sent once, with the seats asked for', JSON.stringify(st.marks));
    ok(JSON.stringify(st.seats.g1) === '[0,1]', 'the server has the family in', JSON.stringify(st.seats.g1));
    ok(!/לא נשמר/.test(t), 'the failure line is gone');
    ok(/2 מתוך 3/.test(t), 'and the count shows them', t.match(/\d+ מתוך \d+/)?.[0]);
    await ctx.close();
  }

  console.log('\n── the other greeter checked them in meanwhile: nothing re-sent, the line goes');
  {
    const st = stub();
    const { ctx, p } = await door(st);
    st.markMode = 'fail';
    await tapFamily(p, 'יעל');
    st.seats.g1 = [0, 1];          // the other greeter's phone, which had signal
    st.markMode = 'ok';
    await refresh(p);
    const t = await text(p);
    ok(st.marks.filter(m => m.mode === 'ok').length === 0, 'no second write', JSON.stringify(st.marks));
    ok(!/לא נשמר/.test(t), 'the failure line is gone');
    await ctx.close();
  }

  console.log('\n── a reload with no signal keeps the list');
  {
    const st = stub();
    st.seats.g2 = [0];
    const { ctx, p } = await door(st);
    ok(/1 מתוך 3/.test(await text(p)), 'loaded online');
    st.dataMode = 'down';
    await p.reload();
    await p.waitForTimeout(800);
    const t = await text(p);
    ok(/החתונה של דנה ויוסי/.test(t) && /1 מתוך 3/.test(t), 'the event and its count are still on screen', t.slice(0, 120));
    ok(/אין חיבור כרגע — הרשימה מעודכנת לשעה/.test(t), 'and it says the list is not fresh');
    ok(!/נסו לרענן/.test(t), 'no advice to refresh');
    st.dataMode = 'ok';
    await refresh(p);
    ok(!/הרשימה מעודכנת לשעה/.test(await text(p)), 'the note goes once a refresh works');
    await ctx.close();
  }

  console.log('\n── two taps on one family, the first still on the wire when a refresh lands (סב22)');
  {
    const st = stub();
    const { ctx, p } = await door(st);
    await p.fill('input[type="search"]', 'יעל');
    await p.waitForTimeout(250);
    await p.locator('button[aria-label^="סימון חלקי"]').first().click();
    await p.waitForTimeout(200);
    const chip = name => p.evaluate(n => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === n)?.click(), name);
    st.delays = [800, 3000];            // seat 1 answers at 0.8 s, seat 2 at 3 s
    await chip('יעל כהן');
    await p.waitForTimeout(50);
    await chip('אורח 2');
    await p.waitForTimeout(1500);       // the first write is back, the second is not
    await p.clock.runFor(26000);        // …and the refresh lands now, reading [0]
    await p.waitForTimeout(400);
    const mid = (await text(p)).match(/(\d+) מתוך 3/)?.[1];
    ok(mid === '2', 'the second tap is still on screen while it is being saved', `shows ${mid} of 3; server has ${JSON.stringify(st.seats.g1)}`);
    await p.waitForTimeout(2500);
    ok(JSON.stringify(st.seats.g1) === '[0,1]', 'and the server ends with both', JSON.stringify(st.seats.g1));
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
