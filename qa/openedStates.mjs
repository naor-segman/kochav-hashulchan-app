// The states a static screenshot sweep never enters: a table card EXPANDED,
// the paste box open with a parsed list in it, the constraint picker with a
// query typed into it. A closed accordion tells you nothing about the open one.
//
// The fixture matters more than the probe here. qa/mobile.mjs uses "שולחן 1"
// and "טל שוורץ", which fit anything; the states below only break with the
// names a real Israeli guest list actually contains. So: a 30-character table
// name, a double-barrelled surname, and a group of nine.
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';

const LONG_TABLE = 'שולחן המשפחה הקרובה של הכלה';
const LONG_NAME  = 'אברהם יצחק בן-שלמה הכהן מזרחי-רוזנבלט';
const COMPANIONS = ['רבקה לאה', 'שלמה זלמן', 'חנה מרים', 'יעקב ישראל',
                    'שרה רחל', 'משה אהרן', 'אסתר מלכה', 'דוד יהונתן'];

const EVENT = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן הקסום', startTime: '19:00',
  coupleType: 'bride-groom', parentsType: 'mother-father',
  guests: [
    { id: 'g1', name: LONG_NAME, side: 'bride', group: 'משפחה', count: 9,
      phone: '0501234567', rsvp: 'confirmed', companions: COMPANIONS },
    { id: 'g2', name: 'רון לוי', side: 'groom', group: 'חברים', count: 1, rsvp: 'pending' },
    { id: 'g3', name: 'שרה כהן', side: 'bride', group: 'עבודה', count: 3, rsvp: 'confirmed' },
  ],
  tables: [{ id: 't1', name: LONG_TABLE, capacity: 12, type: 'regular', shape: 'round' }],
  seating: { g1: 't1', g3: 't1' },
  constraints: [], tasks: [], vendors: [], costs: {},
  site: { schedule: [{ id: 's1', time: '19:00', icon: '💍', title: 'קבלת פנים' }] },
  tokens: { rsvp: 'r1' }, createdAt: Date.now(), updatedAt: Date.now(),
};

const VPS = [{ w: 320, h: 568 }, { w: 390, h: 844 }];

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

let fails = 0;
const say = (ok, s) => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${s}`); };

for (const vp of VPS) {
  const page = await b.newPage({
    viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  // scroll-behavior: smooth on <html> makes scrollTo animate, so every rect
  // read right after it is stale. Kill it before measuring anything.
  await page.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => { document.documentElement.style.scrollBehavior = 'auto'; });
  });
  await page.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  await page.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
    JSON.stringify({ events: [e], activeEventId: 'e1' })), EVENT);

  console.log(`\n══ ${vp.w}x${vp.h}`);

  // ── Seating: expand the table card ────────────────────────────────────────
  await page.goto(BASE + '/events/e1/seating', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const head = page.locator('[class*="tCardHead"]').first();
  if (await head.count()) { await head.click(); await page.waitForTimeout(700); }

  const seat = await page.evaluate((longName) => {
    const q = (s) => document.querySelector(s);
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) }; };
    // .tCardNameText, not .tCardName — the latter is the wrapper, and measuring
    // it reads a healthy 202px while the span inside it is 0.
    const nameSpan = [...document.querySelectorAll('[class*="tCardNameText"]')]
      .map(el => ({ el, t: el.textContent || '' })).find(o => o.t.includes('הכלה'));
    const gInfo = [...document.querySelectorAll('[class*="gInfo"]')]
      .find(el => (el.textContent || '').includes(longName.slice(0, 12)));
    const row = gInfo && gInfo.closest('[class*="tGuestRow"]');
    // Are the hover-only controls actually visible right now?
    const hidden = [...document.querySelectorAll('[class*="tGuestLockBtn"], [class*="tGuestRemoveBtn"]')]
      .filter(el => Number(getComputedStyle(el).opacity) < 0.05).length;
    return { name: box(nameSpan && nameSpan.el), gInfo: box(gInfo), row: box(row), hidden };
  }, LONG_NAME);

  console.log(`── seating, card expanded`);
  say(seat.name && seat.name.w >= 60, `table name span ${seat.name ? seat.name.w + 'px' : 'NOT FOUND'} (needs >=60 to read "${LONG_TABLE}")`);
  say(seat.gInfo && seat.gInfo.w >= 100, `guest block ${seat.gInfo ? seat.gInfo.w + 'x' + seat.gInfo.h : 'NOT FOUND'} (a 6px column renders one letter per line)`);
  say(seat.row && seat.row.h <= 400, `guest row height ${seat.row ? seat.row.h + 'px' : '?'}`);
  say(seat.hidden === 0, `${seat.hidden} guest-row controls at opacity 0 — no hover exists on touch`);

  // ── Guests: open the paste box, parse a list, reach the review screen ─────
  await page.goto(BASE + '/events/e1/guests', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const paste = page.locator('button', { hasText: 'להדביק רשימה' }).first();
  if (await paste.count()) {
    await paste.click(); await page.waitForTimeout(500);
    const ta = page.locator('textarea').first();
    if (await ta.count()) {
      await ta.fill([LONG_NAME, ...COMPANIONS].map((n, i) => `${n}, ${i + 2}`).join('\n'));
      await page.waitForTimeout(600);
    }
  }
  const measure = () => page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(9999, 0); const sx = window.scrollX; window.scrollTo(0, 0);
    const wide = [...document.querySelectorAll('button')]
      .map(el => ({ t: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34), r: el.getBoundingClientRect() }))
      .filter(o => o.r.width > innerWidth)
      .map(o => `"${o.t}" ${Math.round(o.r.width)}px`);
    return { sx, wide };
  });

  console.log(`── guests, paste box open with a parsed list`);
  const g = await measure();
  say(g.sx === 0, `page scrolls sideways by ${Math.abs(g.sx)}px`);
  say(g.wide.length === 0, `buttons wider than the ${vp.w}px viewport: ${g.wide.join(', ') || 'none'}`);

  // The review screen is the state the paste flow exists FOR, and its own
  // primary button carries a label built from live counts. Stopping at the
  // paste box measures the easy half.
  const review = page.locator('button', { hasText: /^בדקו \d+ אורחים/ }).first();
  if (await review.count() && await review.isEnabled()) {
    await review.click(); await page.waitForTimeout(900);
    console.log(`── guests, ImportReview open`);
    const rv = await measure();
    say(rv.sx === 0, `page scrolls sideways by ${Math.abs(rv.sx)}px`);
    say(rv.wide.length === 0, `buttons wider than the ${vp.w}px viewport: ${rv.wide.join(', ') || 'none'}`);
  } else {
    say(false, 'could not reach ImportReview — the paste flow did not parse');
  }

  // ── Site editor: the schedule row ─────────────────────────────────────────
  await page.goto(BASE + '/events/e1/site', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const site = await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(9999, 0); const sx = window.scrollX; window.scrollTo(0, 0);
    const narrow = [...document.querySelectorAll('input[type=text], input:not([type])')]
      .map(el => ({ a: el.getAttribute('aria-label') || el.placeholder || '', w: el.getBoundingClientRect().width }))
      .filter(o => o.w > 0 && o.w < 60 && !/אייקון/.test(o.a))
      .map(o => `"${o.a}" ${Math.round(o.w)}px`);
    return { sx, narrow };
  });
  console.log(`── site editor`);
  say(site.sx === 0, `page scrolls sideways by ${site.sx}px`);
  say(site.narrow.length === 0, `text fields under 60px: ${site.narrow.join(', ') || 'none'}`);

  await page.close();
}

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
