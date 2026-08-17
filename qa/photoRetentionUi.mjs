// The retention warning, in a real browser.
//
// The SQL side is driven by qa/photoRetentionSql.mjs and the date logic by
// src/utils/photoRetention.test.js. What neither can see is whether the host is
// ever actually TOLD — and a warning nobody is shown is the same as no warning,
// while the deletion happens either way.
//
// So this drives the thing the host does: open the event, read the sentence,
// press the button, and it checks that the postponement is in localStorage
// afterwards. `photosKeepUntil` passes through normalizeEventSite, which is a
// strict whitelist — the field was missing from it in the first draft, so the
// toast confirmed and the next render had forgotten. Reading it back out of
// storage is the only way to tell those two apart from the outside.
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5201';

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

// Dates relative to the machine's today, so the suite does not rot.
const ymd = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const PHOTO = 'https://x.invalid/storage/v1/object/public/event-site/e1/a.webp';

const ev = ({ daysAgo, gallery = [PHOTO], extra = {} }) => ({
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: ymd(-daysAgo),
  guests: [], tables: [], seating: {}, constraints: [], tasks: [], vendors: [], costs: {},
  eventSite: { gallery, coverPhoto: null, schedule: [], shuttles: [], sections: {}, ...extra },
  tokens: { rsvp: 'r', invite: 'i' }, createdAt: Date.now(), updatedAt: Date.now(),
});

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

async function open(event, path = '/events/e1') {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
    JSON.stringify({ events: [e], activeEventId: 'e1' })), event);
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  return { p, errs };
}

const bannerText = (p) => p.evaluate(() =>
  [...document.querySelectorAll('[class*="banner"]')].map(n => n.textContent.trim()).join(' | '));

console.log('── 25 days after the event: inside the warning week');
{
  const { p, errs } = await open(ev({ daysAgo: 25 }));
  const t = await bannerText(p);
  ok(/יימחקו/.test(t), 'the host is warned', t || '(no banner)');
  ok(/5/.test(t), 'and told how long is left', t);
  ok(errs.length === 0, 'no page error', errs[0] || '');

  // The button that stops it. Pressed, then read back OUT OF STORAGE — the
  // difference between a toast and a field that survives.
  const btn = p.getByRole('button', { name: /שמרו עוד/ });
  ok(await btn.count() > 0, 'there is a way to stop it');
  await btn.first().click();
  await p.waitForTimeout(900);
  const keep = await p.evaluate(() =>
    JSON.parse(localStorage.getItem('kochav_hashulchan_v1')).events[0].eventSite.photosKeepUntil);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(keep || ''), 'the postponement survives normalizeEventSite', String(keep));
  ok(keep === ymd(30), 'and it is 30 days out', `${keep} vs ${ymd(30)}`);

  const after = await bannerText(p);
  ok(!/יימחקו/.test(after), 'and the warning goes away', after || '(no banner)');
  await p.close();
}

console.log('\n── 10 days after: not yet');
{
  const { p } = await open(ev({ daysAgo: 10 }));
  ok(!/יימחקו/.test(await bannerText(p)), 'no warning this early');
  await p.close();
}

console.log('\n── inside the window but with nothing stored');
{
  // A gallery holding only a legacy base64 photo has no object to delete, so
  // warning about it would be a threat the server will never carry out.
  const { p } = await open(ev({ daysAgo: 25, gallery: ['data:image/webp;base64,UklGR'] }));
  ok(!/יימחקו/.test(await bannerText(p)), 'no warning for photos that are not stored objects');
  await p.close();
}

console.log('\n── after the deletion, on the site editor');
{
  const { p } = await open(
    ev({ daysAgo: 40, gallery: [], extra: { photosPurgedAt: ymd(-1) } }),
    '/events/e1/site');
  const t = await bannerText(p);
  ok(/נמחקו/.test(t), 'an empty gallery is explained rather than mysterious', t || '(no banner)');
  await p.close();
}

console.log('\n── after the deletion, on the hub');
{
  const { p } = await open(ev({ daysAgo: 40, gallery: [], extra: { photosPurgedAt: ymd(-1) } }));
  ok(!/נמחקו/.test(await bannerText(p)), 'the hub does not carry a permanent notice about a finished thing');
  await p.close();
}

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
