// Drives the three changes in a real browser and reads the result back out of
// the DOM and localStorage, because every one of them is a claim about what a
// host SEES and none of it is provable from the unit tests:
//   1. the parents picker actually renders, persists, and renames both sides
//   2. a pasted row's companion names appear in the guest list
//   3. the paste hint shows the format that gets the most out of the parser
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5188';

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
p.on('console', m => {
  if (m.type() === 'error' && !/favicon|net::|Failed to load resource/i.test(m.text()))
    errs.push(m.text().slice(0, 200));
});
p.on('dialog', d => d.accept());

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : ''));
};

const seed = (over = {}) => ({
  id: 'e1', name: 'הברית של משפחת כהן', type: 'ברית', date: '2027-06-01',
  venue: 'בית הכנסת', guests: [], tables: [], seating: {}, constraints: [],
  tasks: [], vendors: [],
  tokens: { rsvp: 'r1', album: 'al1', invite: 'i1', gift: 'gi1', hostess: 'h1', collab: 'c1' },
  cloudId: null, createdAt: Date.now(), updatedAt: Date.now(), ...over,
});
const load = async (ev, path = '/app') => {
  await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
    JSON.stringify({ events: [e], activeEventId: 'e1' })), ev);
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(700);
};
const readEvent = () => p.evaluate(() =>
  JSON.parse(localStorage.getItem('kochav_hashulchan_v1')).events[0]);

// ── 1. The parents picker ───────────────────────────────────────────────────
await load(seed(), '/events/e1/setup');
const pickerLabels = await p.$$eval('button', bs =>
  bs.map(x => x.textContent.trim()).filter(t => /אמא ואבא|שתי אמהות|שני אבות|הורה יחיד/.test(t)));
check('picker renders all four options', pickerLabels.length >= 4, pickerLabels.join(' · '));

const bodyText = await p.textContent('body');
check('brit no longer asks for the baby name', !/שם התינוק/.test(bodyText));
check('brit asks for the family name', /שם המשפחה/.test(bodyText));

// Pick "שתי אמהות" and confirm it is stored.
const twoMothers = await p.$$('button');
for (const el of twoMothers) {
  if ((await el.textContent()).trim() === 'שתי אמהות') { await el.click(); break; }
}
await p.waitForTimeout(300);
const afterHint = await p.textContent('body');
check('the hint updates to the chosen wording live', /משפחת אמא א׳/.test(afterHint));

// Save, then confirm it survived to localStorage.
const saveBtn = await p.$$('button');
for (const el of saveBtn) {
  if (/שמרו והמשיכו/.test(await el.textContent())) { await el.click(); break; }
}
await p.waitForTimeout(900);
const ev1 = await readEvent();
check('parentsType persisted', ev1.parentsType === 'mother-mother', 'stored=' + ev1.parentsType);

// And that the sides are renamed on a DIFFERENT screen than the one that set it.
await p.goto(BASE + '/events/e1/guests', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(700);
const guestsText = await p.textContent('body');
check('guest screen uses the chosen side names', /משפחת אמא/.test(guestsText));
check('guest screen no longer says משפחת האב', !/משפחת האב/.test(guestsText));

// ── 2. Companion names in the guest list ────────────────────────────────────
await load(seed({
  guests: [{ id: 'g1', name: 'דניאל ישראל', side: 'bride', group: 'משפחה',
             count: 4, phone: '0533307300',
             companions: ['אודליה', 'מיכאל', 'אריאל'] }],
}), '/events/e1/guests');
const listText = await p.textContent('body');
for (const n of ['אודליה', 'מיכאל', 'אריאל']) {
  check('companion "' + n + '" is visible in the list', listText.includes(n));
}

// ── 3. The paste hint, and a real paste end to end ──────────────────────────
await load(seed(), '/events/e1/guests');
// Open the paste panel.
const wayBtn = await p.$('button:has-text("להדביק רשימה שכבר יש לכם")');
if (wayBtn) await wayBtn.click(); else check('paste chooser found', false);
await p.waitForTimeout(500);
const hint = await p.textContent('body');
check('the hint shows the parenthesised format', /\(אודליה, מיכאל, אריאל\)/.test(hint));

const ta = await p.$('textarea');
if (ta) {
  await ta.fill('דניאל ישראל (אודליה, מיכאל, אריאל) 0533307300');
  await p.waitForTimeout(400);
  const reviewBtn = await p.$('button:has-text("בדקו")');
  if (reviewBtn) await reviewBtn.click(); else check('review button found', false);
  await p.waitForTimeout(600);
  const review = await p.textContent('body');
  check('review screen shows the companions before confirming',
    ['אודליה', 'מיכאל', 'אריאל'].every(n => review.includes(n)));

  // 'הוסיף' is a substring of 'להוסיף' — the loose match clicked the
  // add-manually chooser instead, which unmounts the review and drops it.
  const confirmBtn = await p.$('button:has-text("הוסיפו")');
  if (confirmBtn) await confirmBtn.click(); else check('confirm button found', false);
  await p.waitForTimeout(900);
  const ev2 = await readEvent();
  const g = (ev2.guests || [])[0];
  check('the pasted row stored 4 seats', g && g.count === 4, 'count=' + (g && g.count));
  check('the pasted row stored the phone', g && g.phone === '0533307300', 'phone=' + (g && g.phone));
  check('the pasted row stored all three companions',
    g && (g.companions || []).length === 3, JSON.stringify(g && g.companions));
  const afterAdd = await p.textContent('body');
  check('and the names are visible in the list afterwards',
    ['אודליה', 'מיכאל', 'אריאל'].every(n => afterAdd.includes(n)));
} else {
  check('paste textarea found', false);
}

// ── Horizontal overflow at 390px — scrollWidth lies, so scroll and measure ──
const moved = await p.evaluate(() => {
  window.scrollTo(9999, 0);
  const x = window.scrollX;
  window.scrollTo(0, 0);
  return x;
});
check('no horizontal overflow at 390px', moved === 0, 'scrollX=' + moved);

console.log('\nconsole errors: ' + (errs.length ? '\n  ' + errs.join('\n  ') : 'none'));
const failed = results.filter(r => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
await b.close();
process.exit(failed.length ? 1 : 0);
