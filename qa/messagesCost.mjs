// What the messages screen tells the host about money.
//
// THE CHECKLIST ITEM THIS BELONGS TO WAS WRONG, and that is worth recording.
// It read "remove the ₪0.12-per-message cost the host is charged" — copied from
// a survey that said the screen "bills a host for messages they send by hand".
// The screen never did. Its first sentence has always been
// "כרגע השליחה ידנית דרך וואטסאפ ולכן ללא עלות".
//
// What was actually wrong is smaller and real: after that sentence the card
// projected a bill for automated sending that does not exist, at a rate the
// code itself documented as a guess. That is OUR cost structure, on a screen
// whose job is to help a host send an invitation, pricing a service they can
// neither buy nor avoid.
//
// So the assertions are two-sided on purpose. The reassurance has to STAY —
// deleting the whole card would leave the real question ("will this cost me?")
// unanswered — and the projection has to be GONE.
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
    { id: 'g1', name: 'טל שוורץ', phone: '0501234567', count: 2, rsvp: 'pending', side: 'bride', group: 'משפחה' },
    { id: 'g2', name: 'רון לוי',  phone: '0521234567', count: 1, rsvp: 'confirmed', side: 'groom', group: 'חברים' },
  ],
  tables: [], seating: {}, constraints: [], tasks: [], vendors: [], costs: {},
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
p.on('pageerror', e => errs.push(e.message.slice(0, 140)));

await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
await p.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
  JSON.stringify({ events: [e], activeEventId: 'e1' })), ev);
await p.goto(BASE + '/events/e1/messages', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1600);

const text = await p.evaluate(() => document.body.innerText);

console.log('── the question a host actually has is still answered');
ok(/ללא עלות/.test(text), '"will this cost me money?" — no');
ok(/מהוואטסאפ שלכם/.test(text), 'and says why: it goes out from their own WhatsApp');

console.log('\n── our cost structure is off the customer\'s screen');
ok(!/בהערכה של/.test(text), 'no per-message rate');
ok(!/₪0\.1[23]/.test(text), 'no ₪0.12 / ₪0.13');
ok(!/אם נחבר שליחה/.test(text), 'no projected bill for a service they cannot buy');
ok(!/ללא הגבלה/.test(text), 'no package-pricing reasoning');

console.log('\n── and the screen still does its job');
ok(/Save the Date|שמרו את התאריך/.test(text), 'the stages render');
ok(/מתוכננות|נשלחו/.test(text), 'the per-stage counters render');
ok(!/NaN|undefined/.test(text), 'nothing rendered as NaN or undefined');
ok(errs.length === 0, 'no page error', errs[0] || '');

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
