// The two day-of URLs that are printed on things, driven after the shims died.
//
// /events/:id/checkin and /hostess/:token were each a lazy module whose entire
// body was `<EntranceScreen mode="…" />` — two extra chunks for a prop. They are
// aliases in the route table now.
//
// The whole justification for keeping the paths is that they are printed on QR
// codes already out in the world, so "the URL still works" is not a detail of
// this change, it IS the change. Deleting a file and checking the build is
// green would not have told us: an unresolved route falls through to the
// catch-all and redirects, which looks like a clean pass to anything that only
// counts errors.
//
//   npx vite --port 5188 && node qa/entranceAliases.mjs
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const ev = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  guests: [
    { id: 'g1', name: 'טל שוורץ', phone: '0501234567', count: 2, rsvp: 'confirmed' },
    { id: 'g2', name: 'רון לוי',  phone: '0521234567', count: 1, rsvp: 'confirmed' },
  ],
  tables: [{ id: 't1', name: 'שולחן 1', seats: 10 }],
  seating: { g1: 't1' }, constraints: [], tasks: [], vendors: [], costs: {},
  eventSite: { gallery: [], schedule: [], shuttles: [], sections: {} },
  tokens: { rsvp: 'r', invite: 'i', gift: 'g', album: 'a', hostess: 'h', collab: 'c' },
  createdAt: Date.now(), updatedAt: Date.now(),
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

async function visit(path, seed) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  if (seed) {
    await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
      JSON.stringify({ events: [e], activeEventId: 'e1' })), ev);
  }
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);
  // The guest list is behind the search box — the screen opens on the counter,
  // not on the roster. Asserting a guest name on the initial paint reported two
  // FAILURES against a screen that had loaded the event correctly, which is the
  // check being wrong rather than the code. Type first, then read.
  const typed = await p.evaluate(() => {
    const i = document.querySelector('input[type=text], input[type=search]');
    if (!i) return false;
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, 'טל');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  if (typed) await p.waitForTimeout(600);
  const r = await p.evaluate(() => ({
    url: location.pathname,
    text: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
  }));
  await p.close();
  return { ...r, errs, typed };
}

console.log('── /events/:id/checkin — the owner alias');
{
  const r = await visit('/events/e1/checkin', true);
  // The redirect is the failure mode a green build cannot see.
  ok(r.url === '/events/e1/checkin', 'did not fall through to the catch-all', r.url);
  ok(/עמדת הכניסה|כניסה/.test(r.text), 'rendered עמדת הכניסה', r.text.slice(0, 60));
  // 3 = the seat total of the two seeded guests (2 + 1) — the screen derived
  // it from the event it loaded, so this is data, not chrome.
  ok(/החתונה של דנה ויוסי/.test(r.text), 'it is the real event');
  ok(/מתוך 3/.test(r.text), 'and the seat total is derived from its guests', r.text.slice(0, 70));
  ok(r.typed && /טל שוורץ/.test(r.text), 'searching finds a seeded guest');
  ok(r.errs.length === 0, 'no page error', r.errs[0] || '');
}

console.log('\n── /events/:id/entrance — the canonical path, unchanged');
{
  const r = await visit('/events/e1/entrance', true);
  ok(r.url === '/events/e1/entrance', 'still resolves', r.url);
  ok(/החתונה של דנה ויוסי/.test(r.text) && /מתוך 3/.test(r.text), 'same screen, same event');
  ok(r.typed && /טל שוורץ/.test(r.text), 'search works here too');
  ok(r.errs.length === 0, 'no page error', r.errs[0] || '');
}

console.log('\n── /hostess/:token — the greeter alias');
{
  const r = await visit('/hostess/sometoken', false);
  ok(r.url === '/hostess/sometoken', 'did not fall through to the catch-all', r.url);
  // No Supabase here, so the token cannot resolve. What matters is that it
  // reaches EntranceScreen's own token branch and says so, rather than
  // bouncing to the dashboard or blanking.
  ok(/הקישור אינו תקין|טוען|כניסה/.test(r.text),
     'reached EntranceScreen in token mode', r.text.slice(0, 70));
  ok(!/^\s*$/.test(r.text), 'not a blank page');
  ok(r.errs.length === 0, 'no page error', r.errs[0] || '');
}

console.log('\n── /entrance/:token — the canonical token path');
{
  const r = await visit('/entrance/sometoken', false);
  ok(r.url === '/entrance/sometoken', 'still resolves', r.url);
  ok(r.errs.length === 0, 'no page error', r.errs[0] || '');
}

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
