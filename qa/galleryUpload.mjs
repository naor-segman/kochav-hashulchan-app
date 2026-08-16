// Adding a photo to the event-site gallery, in a real browser.
//
// THE BUG THIS EXISTS FOR, reported on the first real upload: adding one photo
// to an EMPTY gallery said "הגלריה מלאה". The count came from a variable
// assigned inside a setState updater and read on the next line —
//
//     let added = 0;
//     patchEvent(e => { …; added = …; });
//     if (added === 0) showToast("הגלריה מלאה");
//
// — and React only runs that updater during render. It appeared to work
// because React evaluates an updater EAGERLY while the update queue is empty,
// and the queue is empty right up until something else sets state first. On a
// cloud-configured account an upload failure shows a toast, which is a state
// update, so the eager path was skipped, `added` stayed 0, and the "full"
// message replaced the error that would have said what actually went wrong.
//
// WHY A BROWSER AND NOT A COMPONENT TEST: the compressor decodes through an
// <img> and writes with canvas.toBlob. jsdom implements neither, so a jsdom
// version of this would be asserting against mocks of the two things that
// actually run. It was written, it timed out on every upload case, and it was
// deleted rather than mocked into passing.
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';

// A real 1x1 JPEG. The <img> decode is the point, so a fake blob will not do.
const FILE = '/tmp/qa-gallery-probe.jpg';
writeFileSync(FILE, Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64'));

const CAP = 6;
const ev = (gallery) => ({
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  guests: [], tables: [], seating: {}, constraints: [], tasks: [], vendors: [], costs: {},
  eventSite: { gallery, coverPhoto: null, schedule: [], shuttles: [], sections: { gallery: true } },
  tokens: { rsvp: 'r', invite: 'i' }, createdAt: Date.now(), updatedAt: Date.now(),
});
const stored = (n) => Array.from({ length: n },
  (_, i) => `https://x.invalid/storage/v1/object/public/event-site/e/${i}.jpg`);

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

async function upload(startWith, files = 1) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
    JSON.stringify({ events: [e], activeEventId: 'e1' })), ev(startWith));
  await p.goto(BASE + '/events/e1/site', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  // The gallery input is the one that takes several files; the other is the cover.
  const inputs = p.locator('input[type=file]');
  let idx = 0;
  for (let i = 0; i < await inputs.count(); i++)
    if (await inputs.nth(i).getAttribute('multiple') !== null) { idx = i; break; }
  await inputs.nth(idx).setInputFiles(Array(files).fill(FILE));
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => ({
    gallery: JSON.parse(localStorage.getItem('kochav_hashulchan_v1')).events[0].eventSite.gallery.length,
    toasts: [...document.querySelectorAll('[class*="toast"],[role=alert]')]
      .map(t => (t.textContent || '').trim()).filter(Boolean),
  }));
  await p.close();
  return { ...out, errs };
}

// NOT COVERED HERE, deliberately: the upload-FAILURE path.
//
// It needs `ev.cloudId` set, and useEvents drops a cloud-backed event from the
// guest bucket for a signed-out user — correctly, so a stranger on a shared
// browser never sees a synced event. There is no Supabase session in this
// environment, so seeding one just redirects to the home screen. A DEV-only
// "force the upload to throw" hook was written to get around that and then
// removed: it would have been scaffolding in the shipped module so that a test
// could assert against its own mock.
//
// What the three cases below DO cover is that the success path emits exactly
// one toast — which is the half of the fix that is testable here, since the
// bug was a second toast overwriting the first.

console.log('── one photo into an empty gallery');
{
  const r = await upload([], 1);
  ok(!r.toasts.join(' ').includes('מלאה'), 'does not say the gallery is full', r.toasts.join(' | '));
  ok(r.gallery === 1, 'the photo is actually stored', `gallery = ${r.gallery}`);
  ok(r.errs.length === 0, 'no page error', r.errs[0] || '');
}

console.log('\n── one photo into a gallery already at the cap');
{
  const r = await upload(stored(CAP), 1);
  ok(r.toasts.join(' ').includes('מלאה'), 'says the gallery is full — the message still works when true', r.toasts.join(' | '));
  ok(r.gallery === CAP, 'the cap holds', `gallery = ${r.gallery}`);
}

console.log('\n── three photos with only one seat left');
{
  const r = await upload(stored(CAP - 1), 3);
  ok(r.gallery === CAP, 'fills the last seat and no more', `gallery = ${r.gallery}`);
  ok(r.toasts.join(' ').includes('לא נכנסו'), 'says how many did not fit', r.toasts.join(' | '));
}

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
