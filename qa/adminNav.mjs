// The admin dashboard's nav, read out of the rendered DOM.
//
// adminNav.test.js pins the ARRAY. This pins what the operator's finger meets:
// that "יומן פעילות" is no longer a link, that it wears a badge saying so, and
// that flipping it out of `live` did not quietly un-link the other six.
//
// Runs against vite.admin-preview.config.js (port 5190) — AdminGuard needs an
// admin session this environment does not have, and without the mock the
// dashboard renders its loading branch and the nav never appears at all.
//
//   npx vite --config vite.admin-preview.config.js --port 5190
//   node qa/adminNav.mjs
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.ADMIN_BASE || 'http://127.0.0.1:5190';

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errs = [];
p.on('pageerror', e => errs.push(e.message.slice(0, 140)));

await p.goto(BASE + '/admin/dashboard', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1800);

// Read every nav row as {label, href} — href null means it is not an <a>.
const rows = await p.evaluate(() => {
  const ul = [...document.querySelectorAll('ul')]
    .find(u => u.innerText.includes('ניהול משתמשים'));
  if (!ul) return null;
  return [...ul.querySelectorAll('li')].map(li => ({
    text: li.innerText.replace(/\s+/g, ' ').trim(),
    href: li.querySelector('a')?.getAttribute('href') ?? null,
  }));
});

console.log('── the nav rendered at all (everything below is vacuous otherwise)');
ok(rows !== null, 'found the nav list');
ok(rows && rows.length === 7, 'seven rows', rows ? String(rows.length) : '');

const activity = rows?.find(r => r.text.includes('יומן פעילות'));

console.log('\n── יומן פעילות is present but is not a destination');
ok(!!activity, 'the row is still shown — the operator sees it is planned');
ok(activity?.href === null, 'it is not a link', activity?.href || '');
ok(/בפיתוח/.test(activity?.text || ''), 'and says why', activity?.text || '');

console.log('\n── nothing else lost its link');
for (const label of ['ניהול משתמשים', 'כל האירועים', 'ניהול תבניות', 'מנויים ותשלומים', 'שגיאות', 'הגדרות מערכת']) {
  const r = rows?.find(x => x.text.includes(label));
  ok(!!r?.href, `${label} still links`, r ? String(r.href) : 'row missing');
}

console.log('\n── clicking it does nothing, and the page survives');
const before = p.url();
if (activity) {
  await p.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find(x => x.innerText.includes('יומן פעילות'));
    li?.click();
  });
  await p.waitForTimeout(600);
}
ok(p.url() === before, 'still on the dashboard', p.url());
ok(!/Phase|undefined|NaN/.test(await p.evaluate(() => document.body.innerText)),
   'no "Phase", no undefined badge');
ok(errs.length === 0, 'no page error', errs[0] || '');

console.log('\n── the route is kept on purpose: a bookmark lands somewhere real');
await p.goto(BASE + '/admin/activity', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
const t = await p.evaluate(() => document.body.innerText);
ok(/יומן פעילות/.test(t), 'the screen still renders');
// Note what this canNOT check: the mock serves seven fake activity_logs rows,
// so the "table missing" branch — where the bad migration instruction lived —
// is unreachable here. adminNav.test.js asserts that copy at source level.
ok(!/משהו השתבש|Something went wrong/.test(t), 'no error boundary');

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
