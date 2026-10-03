// The public and guest pages, measured the way a guest meets them (audit 3.10).
//
// One harness for the findings of the 3.10 public/guest audit, each a section
// that can be run on its own:
//
//   node qa/guestPages.mjs                 every section
//   node qa/guestPages.mjs overflow photo  just those
//
// It builds the app with VITE_SUPABASE_URL pointed at a host this harness
// answers itself, so the REAL guest code path runs — fetchEventByToken, the
// error and offline branches — against the fixtures below, the same way
// qa/guestH1.mjs does. Set GUEST_OUT=<dir> to reuse a build from an earlier run.
//
// Every number is read off the painted page: contrast is computed against the
// pixels under the text (a photo is a ground, and a scrim over it is a ground),
// tap targets with elementFromPoint (this codebase grows hit areas with
// ::after, which no box measurement sees), sideways scroll with
// scrollTo(-1e5) and scrollX (qa/README.md says why not scrollWidth).
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';
import { routeGoogleFonts } from './lib/googleFonts.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const PORT = 6301;
const SUPA = 'http://127.0.0.1:6309';     // never served — every request to it is answered below
const ONLY = process.argv.slice(2);
const want = (s) => !ONLY.length || ONLY.includes(s);

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

/* ── Fixtures ──────────────────────────────────────────────────────────────── */
const FUT = '2027-06-01', PAST = '2026-09-01';
const img = (n) => `https://img.stub/${n}.png`;
const SITE = {
  enabled: true, themeKey: 'rose', fontKey: 'serif', heroEn: 'OUR WEDDING DAY', coverPhoto: img('cover'), countdown: true,
  story: 'אחרי שבע שנים, המון אהבה וכלב אחד — אנחנו מתחתנים. נשמח לחגוג איתכם.',
  gallery: [img('g1'), img('g2')],
  schedule: [{ id: 's1', time: '19:00', title: 'קבלת פנים', icon: '🥂' }, { id: 's2', time: '20:00', title: 'חופה', icon: '💍' }],
  address: 'דרך השדות 4, רחובות', wazeUrl: 'https://waze.com/ul?q=x', parkingNote: 'חניה חינם בחניון הצמוד לאולם.',
  dressCode: 'חגיגי — לבן מומלץ לא לחובה',
  shuttles: [{ id: 'sh1', place: 'תל אביב — רכבת סבידור', time: '18:15', direction: 'הלוך', contactName: 'אבי', contactPhone: '050-1112223' }],
  faq: [{ id: 'f1', q: 'יש חניה?', a: 'חניה חינם בחניון הצמוד.' }],
  contactPhone: '050-1234567',
  sections: { schedule: true, location: true, gift: true, blessings: true, faq: true, shuttles: true, dressCode: true, gallery: true },
};
// Host-typed text with no break opportunity in it: a URL, a long hyphenless
// word. Every block a host writes into must wrap it, not widen the page.
const URL_LONG = 'https://www.instagram.com/alexandra.margarita.benshoshan.and.benjamin.zeev.wedding2027/';
const LONG_SITE = {
  ...SITE,
  story: `הסיפור שלנו התחיל לפני תשע שנים. את כל התמונות אפשר לראות כאן: ${URL_LONG} — ונשמח לראות גם את שלכם.`,
  schedule: [{ id: 's1', time: '18:30', title: `קבלת פנים ${URL_LONG}`, icon: '🥂' }],
  address: `אולמי הגן ${URL_LONG}`,
  parkingNote: `חניה: ${URL_LONG}`,
  dressCode: `קוד לבוש: ${URL_LONG}`,
  shuttles: [{ id: 'sh1', place: `ירושלים ${URL_LONG}`, time: '17:30', direction: 'הלוך', contactName: 'אברהם', contactPhone: '052-9876543' }],
  faq: [{ id: 'f1', q: `איפה ${URL_LONG}?`, a: `כאן: ${URL_LONG}` }],
};
const BASE_EV = {
  id: '11111111-1111-4111-8111-111111111111', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: FUT,
  venue: 'אולמי הגן, רחובות', bride_name: 'דנה', groom_name: 'יוסי',
  rsvp_token: 'ok', gift_token: 'ok', invite_token: 'ok', album_token: 'ok', site: SITE,
  announcements: {
    saveTheDate: { themeKey: 'rose', enabled: true, layout: 'center', photo: img('std') },
    invitation: { themeKey: 'rose', enabled: true, layout: 'card', photo: img('inv') },
  },
};
const LONG_NAME = 'החתונה של אלכסנדרה-מרגריטה בן-שושן ובנימין-זאב יהונתן רוזנבלום-כהן';
function eventFor(token) {
  const [k, a] = String(token).split('-');
  if (k === 'ok') return BASE_EV;
  if (k === 'long') return { ...BASE_EV, name: LONG_NAME, site: LONG_SITE };
  if (k === 'past') return { ...BASE_EV, date: PAST, announcements: { ...BASE_EV.announcements, saveTheDate: { ...BASE_EV.announcements.saveTheDate, showRsvp: true } } };
  // Announcement layouts over a photo. The photo's colour comes from the
  // context's image route, so one token serves every photo.
  if (k === 'lay') {
    const an = { themeKey: a === 'card' ? 'rose' : 'sky', enabled: true, layout: a, photo: img('p'), showRsvp: true, showCountdown: true, showLocation: true };
    return { ...BASE_EV, announcements: { saveTheDate: an, invitation: an } };
  }
  return null;
}
const wall = (t) => Array.from({ length: 4 }, (_, i) => ({
  id: 'w' + i, donor_name: ['משפחת כהן', 'רון ושירה', 'צוות המשרד', 'סבתא מרים'][i],
  message: 'מזל טוב! שתזכו לבנות בית נאמן בישראל', created_at: new Date(Date.UTC(2026, 9, 1, 12 - i)).toISOString(),
})).slice(0, String(t).startsWith('empty') ? 0 : 4);

function rpc(name, args) {
  const t = String(args.token_value || '');
  if (t.startsWith('down')) return { status: 500, body: { code: '500', message: 'upstream timeout' } };
  switch (name) {
    case 'public_event_by_token': return { body: eventFor(t) };
    case 'gift_wall_by_token':    return { body: eventFor(t) ? wall(t) : [] };
    case 'collab_event_by_token': { const e = eventFor(t); return { body: e && { id: e.id, name: e.name, type: e.type, bride_name: e.bride_name, groom_name: e.groom_name, custom_groups: [] } }; }
    case 'collab_list_by_token':  return { body: eventFor(t) ? [] : null };
    case 'hostess_data_by_token': { const e = eventFor(t); return { body: e && { id: e.id, name: e.name, guests: [], tables: [], seating: {}, writes_open: true } }; }
    case 'album_list_by_token':   return { body: [] };
    default: return { body: null };
  }
}

/* ── Plumbing ──────────────────────────────────────────────────────────────── */
const OUT = process.env.GUEST_OUT || mkdtempSync(join(tmpdir(), 'guestpages-'));
if (!process.env.GUEST_OUT) {
  execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: 'qa-dummy-key' },
  });
}
const server = await startPreview(PORT, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });

/** A context with every outbound host answered. `photo` colours the stub images. */
async function open(path, { width = 390, height = 844, mobile = width < 800, photo = '#cccccc', setup } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    serviceWorkers: 'block', locale: 'he-IL', timezoneId: 'Asia/Jerusalem',
  });
  await routeGoogleFonts(ctx);
  await ctx.route(/^https:\/\/img\.stub\//, r => r.fulfill({ status: 200, contentType: 'image/svg+xml',
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${photo}"/></svg>` }));
  await ctx.route(SUPA + '/**', r => {
    const u = new URL(r.request().url());
    const m = u.pathname.match(/\/rest\/v1\/rpc\/([a-z_]+)/);
    if (m) {
      let args = {}; try { args = JSON.parse(r.request().postData() || '{}'); } catch { /* none */ }
      const out = rpc(m[1], args);
      return r.fulfill({ status: out.status ?? 200, contentType: 'application/json', body: JSON.stringify(out.body ?? null) });
    }
    if (u.pathname.startsWith('/auth/v1/user')) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"msg":"no session"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: r.request().method() === 'GET' ? '[]' : '{}' });
  });
  await ctx.route(u => !/^(127\.0\.0\.1|localhost)$/.test(new URL(u).hostname) && !/fonts\.(googleapis|gstatic)\.com|^img\.stub$/.test(new URL(u).hostname),
    r => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
  if (setup) await setup(p);
  await p.goto(server.base + path, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  return { ctx, p };
}
const hscroll = (p) => p.evaluate(() => {
  window.scrollTo({ left: -1e5, behavior: 'instant' });
  const x = window.scrollX; window.scrollTo({ left: 0, behavior: 'instant' }); return x;
});

try {
  /* ── P1-1 · host text with no break opportunity widens the event site ───── */
  if (want('overflow')) {
    console.log('\n── overflow: /invite with a URL in every host-written block');
    for (const width of [320, 360, 390]) {
      const { ctx, p } = await open('/invite/long', { width });
      // Every FAQ answer is behind its question. A DOM click: on the broken
      // page the question sits off-screen and a pointer click never lands.
      await p.$$eval('[class*=faqQ]', qs => qs.forEach(q => q.click()));
      await p.waitForTimeout(100);
      const sx = await hscroll(p);
      ok(sx === 0, `@${width} /invite/long: no sideways scroll`, `scrollX=${sx}`);
      const wide = await p.evaluate((vw) => [...document.querySelectorAll('main *')]
        .filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.includes('instagram')))
        .map(el => ({ c: (String(el.className).match(/_([A-Za-z]+)_/) || [, el.tagName])[1], r: el.getBoundingClientRect() }))
        .filter(x => x.r.left < -1 || x.r.right > vw + 1)
        .map(x => `${x.c} ${Math.round(x.r.left)}…${Math.round(x.r.right)}`), width);
      ok(wide.length === 0, `@${width} every block carrying the URL lies inside the screen`, wide.join(' | '));
      await ctx.close();
    }
  }

} finally {
  await browser.close();
  server.stop();
  if (!process.env.GUEST_OUT) rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
