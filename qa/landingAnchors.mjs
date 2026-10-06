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

/* The header and footer links to "תכונות" / "איך זה עובד" left on 6.10 (the
   owner: section headings that send the reader down the page). The sections
   and their anchors stay — a shared /home#how link still has to land — so the
   fresh-load checks above stay, and the click-through ones went with the links. */

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
  // The landing page's own h1, not a nav word: "תכונות" was the marker until
  // it left the bar (owner, 6.10) and this check failed on a page that was fine.
  const h1 = await p.evaluate(() => document.querySelector('main h1')?.textContent || '');
  const ok = !/אירעה שגיאה בלתי צפויה|Something went wrong/.test(t) && /מתכננים אירוע/.test(h1);
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} /home${bad.padEnd(9)} still renders the landing page  ${ok ? '' : '— ' + t.slice(0, 45)}`);
  await p.close();
}

/* "The same anchor clicked twice must scroll twice" lived here. It drove the
   footer's /home#features link, which left on 6.10 with "תכונות" (owner) —
   no link on the site repeats a cross-page anchor any more. useHashScroll
   still keys on location.key for the next one that does. */

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
