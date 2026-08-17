// The event-name gate, driven from both entry points.
//
// It was written twice — once in the navigation rail and once on the hub —
// because it had ALREADY drifted: the same click was blocked from the nav and
// allowed from the hub. There is one implementation now, and the only way to
// know both screens still enforce it is to click both.
//
//   npx vite --port 5188 && node qa/nameGate.mjs
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const mkEvent = (name) => ({
  id: 'e1', name, type: 'חתונה', date: '2027-06-01',
  guests: [], tables: [], seating: {}, constraints: [], tasks: [], vendors: [], costs: {},
  eventSite: { gallery: [], schedule: [], shuttles: [], sections: {} },
  tokens: { rsvp: 'r', invite: 'i', gift: 'g', album: 'a', hostess: 'h', collab: 'c' },
  createdAt: Date.now(), updatedAt: Date.now(),
});

const GATE_MSG = 'יש להזין שם לאירוע לפני המשך';

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

/** Seed an event, land on `path`, click the first element whose text matches. */
async function clickThrough({ name, path, label, vp, sel = 'button, a' }) {
  const p = await b.newPage({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
    JSON.stringify({ events: [e], activeEventId: 'e1' })), mkEvent(name));
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);

  // Returns false rather than throwing when the control is absent — a missing
  // control is a FAILURE to report, not a crash that hides the other checks.
  // `sel` narrows the search, because matching on label alone picked a
  // DIFFERENT element depending on the event's state: with a name the hub also
  // renders a "המשיכו מכאן" resume button, it sorts first, and it calls `go`
  // directly. So the gated-event case clicked a hub tile and the named-event
  // case clicked the resume button — two different controls compared as if
  // they were one, which is how a mutation that gated EVERY click survived the
  // whole run. (The resume button is only rendered once there is a name, so it
  // is not a hole in the gate — it is a hole in the check.)
  const clicked = await p.evaluate(({ lbl, sel }) => {
    const el = [...document.querySelectorAll(sel)]
      .find(x => (x.innerText || '').includes(lbl) && x.getBoundingClientRect().width > 0);
    if (!el) return false;
    el.click();
    return true;
  }, { lbl: label, sel });

  // The toast is read EARLY and separately from the URL. Reading both at 900ms
  // caught the rail after its toast had already faded and reported a FAILURE
  // against a gate that had fired correctly — the URL in the same snapshot said
  // /setup. Poll for the toast instead of guessing one delay that suits both.
  // Polls for THE MESSAGE, not for "any live region has text". The first
  // version stopped at the first non-empty match and kept catching the loading
  // indicator ("✦ טוען…", role=status) — which made the no-toast assertion pass
  // no matter what, and a mutation that made the gate fire on EVERY click
  // survived the whole run.
  let toast = '';
  for (let i = 0; i < 20 && !toast; i++) {
    toast = await p.evaluate((msg) =>
      [...document.querySelectorAll('[class*=toast], [role=alert], [role=status]')]
        .map(n => (n.innerText || '').replace(/\s+/g, ' ').trim())
        .find(t => t.includes(msg)) || '', GATE_MSG);
    if (!toast) await p.waitForTimeout(100);
  }
  await p.waitForTimeout(900);

  const r = await p.evaluate(() => ({
    url: location.pathname,
    text: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
  }));
  await p.close();
  return { ...r, toast, clicked, errs };
}

const TOAST = GATE_MSG;

console.log('── the rail, on an event with no name');
{
  // NOT the "הרשימה וההושבה" tab. areaLanding() resolves that area to `setup`
  // — the one screen the gate exempts — so clicking it navigates with no toast
  // and that is CORRECT. Measured before believing it: the first version of
  // this check clicked exactly that tab and reported a FAILURE against working
  // code. "ההכנות" lands on `tasks`, which is gated.
  const r = await clickThrough({
    name: '', path: '/events/e1/guests', label: 'ההכנות',
    vp: { width: 1280, height: 900 },
  });
  ok(r.clicked, 'found a gated rail item to click');
  ok(r.toast.includes(TOAST), 'the toast explains why', r.toast || '(no toast seen)');
  ok(r.url === '/events/e1/setup', 'and it landed on setup', r.url);
  ok(r.errs.length === 0, 'no page error', r.errs[0] || '');
}

console.log('\n── the hub, on the same event — the half that used to let it through');
{
  const r = await clickThrough({
    name: '', path: '/events/e1', label: 'אורחים',
    vp: { width: 390, height: 844 }, sel: 'button[class*=item]',
  });
  ok(r.clicked, 'found a hub tile to click');
  ok(r.toast.includes(TOAST), 'the SAME toast, from the same module', r.toast || '(no toast seen)');
  ok(r.url === '/events/e1/setup', 'and it landed on setup too', r.url);
  ok(r.errs.length === 0, 'no page error', r.errs[0] || '');
}

console.log('\n── a named event is not gated (the notice must not cry wolf)');
{
  const r = await clickThrough({
    name: 'החתונה של דנה ויוסי', path: '/events/e1', label: 'אורחים',
    vp: { width: 390, height: 844 }, sel: 'button[class*=item]',
  });
  ok(r.clicked, 'found the same tile');
  ok(!r.toast.includes(TOAST), 'no toast', r.toast || '(none — correct)');
  // The URL alone. `r.text` contains "אורחים" on the setup screen too, so the
  // old form of this passed even when the gate had bounced the click.
  ok(r.url === '/events/e1/guests', 'it opened the screen asked for', r.url);
  ok(r.errs.length === 0, 'no page error', r.errs[0] || '');
}

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
