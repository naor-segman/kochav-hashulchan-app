// The budget screen's gift section, in a real browser.
//
// WHAT THIS CAN PROVE HERE. There is no Supabase session in this environment,
// so `fetchEventGifts` returns [] for want of a configured client and the list
// never renders. What the browser CAN establish — and what the unit tests
// cannot — is the half of the change that is pure rendering:
//
//   the sentence that used to be false is gone,
//   the section still works when there are no gifts at all,
//   and nothing in the budget screen broke on the way.
//
// The rendered list itself is covered by the unit tests for shape and by
// checklist item 26, the first run against a real account. Saying so here
// rather than pretending otherwise.
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
    { id: 'g1', name: 'טל שוורץ', side: 'bride', group: 'משפחה', count: 2, rsvp: 'confirmed', estGift: 800 },
    { id: 'g2', name: 'רון לוי',  side: 'groom', group: 'חברים', count: 1, rsvp: 'confirmed', estGift: 400 },
  ],
  tables: [], seating: {}, constraints: [], tasks: [], vendors: [],
  costs: { categories: [{ id: 'venue', name: 'אולם', budget: 30000, actual: 12000 }] },
  eventSite: { gallery: [], schedule: [], shuttles: [], sections: {} },
  tokens: { rsvp: 'r', invite: 'i', gift: 'g', album: 'a', hostess: 'h', collab: 'c' },
  createdAt: Date.now(), updatedAt: Date.now(),
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errs = [];
p.on('pageerror', e => errs.push(e.message.slice(0, 160)));

await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
  JSON.stringify({ events: [e], activeEventId: 'e1' })), ev);
await p.goto(BASE + '/events/e1/costs', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1600);

const text = await p.evaluate(() => document.body.innerText);
// The STAT LABELS, not the page text. The explanatory sentence above the stats
// legitimately contains the phrase "נרשמו בדף המתנה" in quotes, so a substring
// search over innerText matches the explanation and reports the stat as
// rendered when it is not. Caught by this harness failing and the code being
// right — the check was fixed, not the screen.
const statLabels = await p.evaluate(() =>
  [...document.querySelectorAll('[class*="statLabel"]')].map(n => n.textContent.trim()));

console.log('── the sentence that was false is gone');
// EntranceScreen's gift field was deleted — "nobody announces what is in their
// envelope to the person holding the door" — so this promise has been untrue
// ever since, on a screen about money.
ok(!/מתמלאת מהמתנות שנרשמות בצ׳ק-אין/.test(text),
   'no longer claims check-in fills actual income');
ok(/הצהרה, לא כסף שנספר/.test(text),
   'and says what a declared gift actually is');

console.log('\n── the screen still works with no gifts to show');
ok(/הכנסה צפויה/.test(text), 'expected income is still there');
ok(/₪1,200|1,200/.test(text), 'and still adds the per-guest estimates', '800 + 400');
ok(!statLabels.some(l => l.startsWith('נרשמו בדף המתנה')),
   'the declared-gifts stat stays hidden when there are none — not a "₪0" that reads as a fact',
   statLabels.join(' · '));
ok(!/NaN/.test(text), 'no NaN anywhere on a money screen');

console.log('\n── nothing else on the budget screen broke');
for (const label of ['הכנסה צפויה', 'הכנסה בפועל (מתנות)', 'צפי נטו (צפוי − מתוכנן)', 'נטו בפועל']) {
  ok(statLabels.includes(label), label, statLabels.join(' · '));
}
ok(text.includes('אולם'), 'the expense categories are untouched');
ok(errs.length === 0, 'no page error', errs[0] || '');

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
