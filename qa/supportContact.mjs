// Every "צרו קשר" in the product, read off the rendered pages.
//
// THE BUG: `kochav-hashulchan.co.il` was hardcoded nine times across eight
// files, on a domain nobody owns — so every one of those links drops a
// customer's question into a hole. Two of the nine honoured VITE_SUPPORT_EMAIL
// and seven ignored it, which is worse than none of them doing: setting the
// variable in Netlify fixed a quarter of the problem and looked like it had
// fixed all of it.
//
// The unit tests pin the resolver and sweep the source. This drives the actual
// pages, because "the function is right" and "the link on the page uses it" are
// different claims, and this repo has already been caught confusing them once.
//
//   npx vite --port 5188 && node qa/supportContact.mjs
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

/** Every mailto: on a page, plus the visible text of each. */
async function mailtos(path) {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1600);
  const links = await p.evaluate(() =>
    [...document.querySelectorAll('a[href^="mailto:"]')]
      .map(a => ({ href: a.getAttribute('href'), text: (a.innerText || '').trim() })));
  await p.close();
  return { links, errs };
}

// Every page the sweep found an address on. The legal three are the ones that
// matter most: an accessibility statement with a dead contact is not a
// statement, it is a liability.
const PAGES = [
  ['/home',          'דף הבית'],
  ['/pricing',       'מחירים'],
  ['/help',          'מרכז עזרה'],
  ['/terms',         'תנאי שימוש'],
  ['/privacy',       'פרטיות'],
  ['/accessibility', 'נגישות'],
];

console.log('── every page still offers a way to reach us');
let total = 0;
for (const [path, label] of PAGES) {
  const { links, errs } = await mailtos(path);
  total += links.length;
  ok(links.length > 0, `${label.padEnd(12)} has a contact link`, `${links.length} found`);
  // Not a blank mailto:, which is what a naive "just remove the placeholder"
  // would have produced — a link that opens an empty compose window.
  ok(links.every(l => /^mailto:[^@\s]+@[^@\s]+$/.test(l.href.split('?')[0])),
     `${label.padEnd(12)} every address is well formed`,
     links.map(l => l.href.split('?')[0]).join(' '));
  ok(errs.length === 0, `${label.padEnd(12)} no page error`, errs[0] || '');
}
ok(total >= 7, 'found the whole set across the site', String(total));

console.log('\n── and the visible text matches the address behind it');
{
  // The legal pages print the address as words as well as linking it. Two
  // sources for one fact is how they drift — one gets updated and the other
  // keeps pointing at the old mailbox, which reads as a typo to a customer.
  for (const path of ['/help', '/terms', '/privacy', '/accessibility']) {
    const { links } = await mailtos(path);
    const shown = links.filter(l => l.text.includes('@'));
    ok(shown.every(l => l.href.split('?')[0] === 'mailto:' + l.text),
       `${path.padEnd(16)} text and href agree`,
       shown.map(l => `${l.text} → ${l.href.split('?')[0]}`).join(' · ') || '(no printed address)');
  }
}

console.log('\n── the enterprise CTA reaches a sales mailbox, not support');
{
  for (const path of ['/pricing', '/home']) {
    const { links } = await mailtos(path);
    const sales = links.filter(l => l.href.includes('contact@'));
    ok(sales.length === 1, `${path.padEnd(10)} exactly one sales link`, String(sales.length));
  }
}

console.log('\n── nothing anywhere still names the unowned domain by hand');
{
  // The whole point of centralising: one line changes all of it. This is the
  // proxy for that — every rendered address shares one domain.
  const domains = new Set();
  for (const [path] of PAGES) {
    const { links } = await mailtos(path);
    links.forEach(l => domains.add(l.href.split('?')[0].split('@')[1]));
  }
  ok(domains.size === 1, 'every address on the site is on ONE domain', [...domains].join(' / '));
}

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
