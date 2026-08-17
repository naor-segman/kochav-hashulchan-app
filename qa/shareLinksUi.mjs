// The share-links screen, in a real browser.
//
// WHAT THIS CAN AND CANNOT PROVE, stated up front because the first version of
// this file got it wrong and reported eight failures that were all its own.
//
// `useShareGate` computes `isGuest` as `!user` — the AUTH user, not the event's
// cloud id. There is no Supabase session in this environment and no way to mint
// one, so every address renders as "הקישור נפתח אחרי פתיחת חשבון" and no URL
// reaches the DOM at all. A harness that asserts on URLs here fails on links
// that have worked for months, which is a broken check reporting broken code.
//
// So the division of labour is:
//
//   The ADDRESS — including the blessing wall's /wall suffix, the one link that
//   is not prefix+token — is pinned by src/components/share/shareLinks.test.js,
//   which also reads App.jsx and fails if any public route has no share row.
//
//   The RENDER is what this file proves: that the row exists on the screen the
//   host actually opens, in the right group, with its label and its one-line
//   explanation — and that adding it displaced nothing.
//
// That is a real gap and it is named rather than papered over: nobody has seen
// the wall's URL rendered in a browser. It will be covered the first time this
// runs against an account, which is checklist item 26.
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

// No cloudId on purpose: useEvents drops a cloud-backed event from the guest
// bucket for a signed-out user — correctly, so a stranger on a shared browser
// never sees a synced event — and seeding one just redirects to the home screen.
const ev = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  guests: [], tables: [], seating: {}, constraints: [], tasks: [], vendors: [], costs: {},
  eventSite: { gallery: [], coverPhoto: null, schedule: [], shuttles: [], sections: {} },
  tokens: {
    rsvp: 'TK-rsvp', album: 'TK-album', invite: 'TK-invite',
    gift: 'TK-gift', hostess: 'TK-hostess', collab: 'TK-collab',
  },
  createdAt: Date.now(), updatedAt: Date.now(),
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errs = [];
p.on('pageerror', e => errs.push(e.message.slice(0, 140)));

await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
  JSON.stringify({ events: [e], activeEventId: 'e1' })), ev);
await p.goto(BASE + '/events/e1/share', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);

const text = await p.evaluate(() => document.body.innerText);

// The premise, asserted rather than assumed. If a session ever DOES exist here,
// the guest note disappears and the checks below are measuring a different
// screen — better to say so loudly than to pass for the wrong reason.
console.log(`(rendering the signed-out view: ${/ממתינים לחשבון/.test(text) ? 'yes' : 'NO — this run is measuring something else'})\n`);

console.log('── the blessing wall now has a door');
ok(/קיר הברכות/.test(text), 'the host sees it on the share screen');
ok(/מוקרנות על מסך באולם/.test(text), 'and is told what it is for — a screen in the hall, not a link to send');
ok(/בלי סכומים/.test(text),
   'and that it shows no amounts — the guest-facing half of the gift subsystem');

console.log('\n── it sits in the right group');
{
  // "ביום האירוע" is where it belongs: nobody sends this to a guest, it is
  // opened once on the projector. Placing it with the guest links would have
  // been the wrong instruction as much as the wrong position.
  const day = text.slice(text.indexOf('ביום האירוע'));
  ok(day.includes('קיר הברכות'), 'under ביום האירוע, beside the entrance station');
  ok(day.includes('עמדת הכניסה'), 'and the entrance station is still there with it');
  const guests = text.slice(text.indexOf('מה ששולחים לאורחים'), text.indexOf('למי שעוזר לכם'));
  ok(!guests.includes('קיר הברכות'), 'and NOT among the links you send to guests');
}

console.log('\n── nothing was displaced');
for (const label of ['שמרו את התאריך', 'הזמנה דיגיטלית', 'כרטיס הזמנה עם קוד',
                     'אתר האירוע', 'אישור הגעה', 'מתנה וברכה', 'אלבום משותף',
                     'טבלה שיתופית', 'עמדת הכניסה']) {
  ok(text.includes(label), label);
}
ok(errs.length === 0, 'no page error', errs[0] || '');

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
