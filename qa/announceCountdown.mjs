// The countdown on the invitation, read off the rendered page.
//
// The unit test pins the arithmetic. This pins what a guest actually sees, at a
// controlled wall-clock time — because the defect was that the number depended
// on the HOUR, and no amount of reading the source shows you that.
//
// The browser clock is overridden per case with an init script, so "the morning
// of the wedding" is a real render at 09:00 and not a fixture.
//
//   npx vite --port 5188 && node qa/announceCountdown.mjs
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const ev = (date) => ({
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date,
  brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן, רחובות',
  guests: [], tables: [], seating: {}, constraints: [], tasks: [], vendors: [], costs: {},
  eventSite: { gallery: [], schedule: [], shuttles: [], sections: {} },
  announcements: {
    saveTheDate: { published: true, showCountdown: true, message: '' },
    invitation:  { published: true, showCountdown: true, message: '' },
  },
  tokens: { rsvp: 'r', invite: 'i', gift: 'g', album: 'a', hostess: 'h', collab: 'c' },
  createdAt: 1, updatedAt: 1,
});

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

/** Render the host preview of the save-the-date with the clock pinned. */
async function countdownAt(nowLocalIso, eventDate) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
  // Asia/Jerusalem, and the clock frozen before any app code runs. Date.now(),
  // `new Date()` and the interval tick all read from it.
  const fixed = new Date(nowLocalIso + '+03:00').getTime();
  await p.addInitScript(`{
    const F = ${fixed};
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(F); }
      static now() { return F; }
    };
  }`);
  await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
    JSON.stringify({ events: [e], activeEventId: 'e1' })), ev(eventDate));
  await p.goto(BASE + '/events/e1/preview-announce/saveTheDate', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);
  const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
  await p.close();
  const m = text.match(/(\d+)\s*(יום|ימים)\s*לאירוע/);
  return { days: m ? Number(m[1]) : null, hasCountdown: !!m, errs, text };
}

console.log('── the same wedding, read at four different hours of the same day');
{
  const seen = new Set();
  for (const h of ['07:30:00', '12:00:00', '18:30:00', '23:30:00']) {
    const r = await countdownAt(`2026-09-01T${h}`, '2026-09-15');
    seen.add(r.days);
    console.log(`     ${h} → ${r.days}`);
    ok(r.errs.length === 0, `no page error at ${h}`, r.errs[0] || '');
  }
  // The whole `ceil`-on-a-duration defect in one assertion: the answer used to
  // move with the time of day, so one guest saw 15 and another saw 14.
  ok(seen.size === 1, 'one answer, not one per hour', [...seen].join(' / '));
  ok(seen.has(14), 'and it is the calendar count', [...seen].join(' / '));
}

console.log('\n── the morning of the wedding');
{
  const r = await countdownAt('2026-09-15T09:00:00', '2026-09-15');
  // The old code rendered "1 יום לאירוע" here — the invitation telling the
  // guests the wedding is tomorrow, ON the day of the wedding.
  //
  // And NO countdown, not "0 ימים לאירוע". Accepting either let a mutation that
  // drops the `days <= 0` guard survive, and "0 ימים" is not a sentence anyone
  // would write in Hebrew. The day itself has its own copy.
  ok(!r.hasCountdown, 'no countdown at all on the day', r.hasCountdown ? `${r.days} ימים` : 'none');
  ok(r.errs.length === 0, 'no page error', r.errs[0] || '');
}

console.log('\n── and after the event has passed');
{
  const r = await countdownAt('2026-09-20T12:00:00', '2026-09-15');
  ok(!r.hasCountdown, 'no negative countdown', r.hasCountdown ? `${r.days}` : 'none');
}

console.log('\n── the morning before');
{
  const r = await countdownAt('2026-09-14T10:00:00', '2026-09-15');
  ok(r.days === 1, 'one day, not two', String(r.days));
}

console.log('\n── across the 25.10.2026 fall-back (two calendar days apart)');
{
  const r = await countdownAt('2026-10-24T18:00:00', '2026-10-26');
  ok(r.days === 2, 'two, not three', String(r.days));
}

console.log('\n── and a date far out still renders normally');
{
  const r = await countdownAt('2026-09-01T12:00:00', '2027-06-01');
  ok(r.days === 273, 'counts across months', String(r.days));
  ok(!/NaN|undefined/.test(r.text), 'nothing rendered as NaN');
}

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
