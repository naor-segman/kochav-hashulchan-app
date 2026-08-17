// The landing page's section anchors, measured rather than assumed.
//
// THE BUG THIS EXISTS FOR, and it was two bugs wearing one coat:
//
//   1. "תכונות" and "איך זה עובד" in the pricing nav and the footer pointed at
//      /#features and /#how. App.jsx sends a signed-in visitor from / straight
//      to /app, so every logged-in user who clicked either one landed on their
//      dashboard.
//
//   2. And it was broken for everyone else too, which only measuring found.
//      A fresh load of /#features leaves scrollY at 0 while the section sits at
//      y=3320: the browser looks for the element while parsing the HTML shell,
//      before React has rendered anything, finds nothing, and never retries.
//      Both links dropped every visitor at the top of the page.
//
// So the check is not "does the URL contain #features" — that passed the whole
// time. It is "did the viewport actually move to the section", which is the only
// question a visitor cares about.
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';

let fails = 0;
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

/** Drive one path to the page, then assert the viewport reached the anchor. */
async function landsOn(label, drive) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
  await drive(p);
  // Generous: the scroll is smooth and the hero's height settles after its
  // media lays out, so an immediate read catches the page mid-flight.
  await p.waitForTimeout(2200);
  const r = await p.evaluate(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    const n = id && document.getElementById(id);
    return {
      url: location.pathname + location.hash,
      y: Math.round(window.scrollY),
      target: n ? Math.round(n.getBoundingClientRect().top + window.scrollY) : null,
      errs: null,
    };
  });
  // Within 250px of the section top. Not equality: smooth scrolling settles on
  // a sub-pixel offset and any sticky chrome shifts it.
  const ok = r.target !== null && Math.abs(r.y - r.target) < 250;
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(40)} url=${r.url}  y=${r.y}  section=${r.target}`);
  if (errs.length) { fails++; console.log(`  FAIL page error: ${errs[0]}`); }
  await p.close();
}

console.log('── a fresh load with a hash (the case the browser gives up on)');
await landsOn('/home#features', p => p.goto(BASE + '/home#features', { waitUntil: 'load' }));
await landsOn('/home#how',      p => p.goto(BASE + '/home#how',      { waitUntil: 'load' }));

console.log('\n── clicking through from another route');
await landsOn('pricing nav → תכונות', async p => {
  await p.goto(BASE + '/pricing', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  await p.getByRole('link', { name: 'תכונות' }).first().click();
});
await landsOn('footer → איך זה עובד', async p => {
  await p.goto(BASE + '/pricing', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  // Returns false rather than throwing when the link is absent: a missing link
  // is a FAILURE to report, not a crash that takes the rest of the run with it.
  // Found by mutating the links back to /# — the harness died on
  // `.pop().click()` of an empty list instead of saying which check failed.
  const clicked = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a')].filter(x => x.getAttribute('href') === '/home#how').pop();
    if (!a) return false;
    a.click();
    return true;
  });
  if (!clicked) console.log('  (no footer link to /home#how — the click was skipped)');
});

console.log('\n── the landing page\'s own nav, which was never broken');
await landsOn('landing nav → תכונות', async p => {
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('a[href="#features"]').click());
});

console.log('\n── no link points at / any more');
{
  const p = await b.newPage();
  await p.goto(BASE + '/pricing', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1000);
  const stale = await p.evaluate(() =>
    [...document.querySelectorAll('a')].map(a => a.getAttribute('href')).filter(h => h && h.startsWith('/#')));
  const ok = stale.length === 0;
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} nothing still links to /#…  ${stale.join(' ') || ''}`);
  await p.close();
}


console.log('\n── a malformed hash must not take the marketing page down');
// FOUND BY AN ADVERSARIAL REVIEW OF THE FIX ABOVE, and it was the fix's own
// doing: `decodeURIComponent` throws URIError on a lone `%`, and a throw in an
// effect reaches the root ErrorBoundary. Three URLs white-screened /home with
// "אירעה שגיאה בלתי צפויה" — the PUBLIC page — and this harness never drove a
// hash that was not a valid anchor, so it passed the whole time.
for (const bad of ['#50%', '#%E0', '#utm_x%', '#%%%']) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(BASE + '/home' + bad, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
  const ok = !/אירעה שגיאה בלתי צפויה|Something went wrong/.test(t) && /תכונות/.test(t);
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} /home${bad.padEnd(9)} still renders the landing page  ${ok ? '' : '— ' + t.slice(0, 45)}`);
  await p.close();
}

console.log('\n── the same anchor clicked twice must scroll twice');
// Also from that review. The effect was keyed on `hash` alone, so the second
// click produced a new location object with the identical hash string, the
// dependency array did not change, and nothing moved. Every footer anchor was
// one-shot per hash value; this harness clicked each exactly once.
{
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(BASE + '/pricing', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  const click = () => p.evaluate(() =>
    [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/home#features')?.click());
  await click();
  await p.waitForTimeout(2000);
  const first = await p.evaluate(() => Math.round(window.scrollY));
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
  await click();
  await p.waitForTimeout(2000);
  const second = await p.evaluate(() => Math.round(window.scrollY));
  const ok = first > 500 && second > 500;
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} first click y=${first}, second click y=${second}  (0 on the second = dead click)`);
  await p.close();
}

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
