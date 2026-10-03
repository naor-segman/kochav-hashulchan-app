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
    const an = { themeKey: a === 'card' ? 'rose' : 'sky', enabled: true, layout: a, photo: img('p'), showRsvp: true, showCountdown: true, showLocation: true,
      message: 'נשמח לראות אתכם — פרטים נוספים באתר האירוע' };
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

  /* ── P1-2/P1-3 · text over a host's photo ───────────────────────────────── */
  if (want('photo')) {
    console.log('\n── photo: every text element over white / light / mid / dark photos (10th-percentile pixel)');
    const PHOTOS = { white: '#ffffff', light: '#dcdcdc', mid: '#8a8a8a', dark: '#202020' };
    for (const url of ['/save-the-date/lay-center', '/save-the-date/lay-bottom', '/invitation/lay-center', '/invitation/lay-card']) {
      for (const [pname, col] of Object.entries(PHOTOS)) {
        const { ctx, p } = await open(url, { photo: col });
        const els = await p.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll('main *, footer *')) {
            const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.nodeValue.trim()).map(n => n.nodeValue.trim()).join(' ');
            if (!own) continue;
            const r = el.getBoundingClientRect(); if (!r.width) continue;
            const cs = getComputedStyle(el);
            let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
            out.push({ t: own.slice(0, 22), color: cs.color, op, px: parseFloat(cs.fontSize), wt: +cs.fontWeight, r: [r.left, r.top, r.width, r.height] });
          }
          return out;
        });
        if (process.env.GUEST_SHOTS) await p.screenshot({ path: `${process.env.GUEST_SHOTS}/photo${url.replace(/\//g, '_')}-${pname}.png` });
        // The ground WITHOUT the text and WITHOUT its shadow: a text-shadow is
        // a halo, not a ground, and leaning on it is how this page shipped.
        await p.addStyleTag({ content: 'main *, footer * { color: transparent !important; text-shadow: none !important; } main svg, footer svg { visibility: hidden }' });
        await p.waitForTimeout(150);
        const shot = (await p.screenshot()).toString('base64');
        const res = await p.evaluate(async ({ shot, els }) => {
          const im = new Image(); im.src = 'data:image/png;base64,' + shot; await im.decode();
          const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
          const g = c.getContext('2d'); g.drawImage(im, 0, 0);
          const parse = s => { const v = s.match(/[\d.]+/g).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 }; };
          const lum = ({ r, g, b }) => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
          return els.map(e => {
            const [x, y, w, h] = e.r.map(Math.round);
            const d = g.getImageData(Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, h)).data;
            const fg0 = parse(e.color); const a = fg0.a * e.op;
            const rs = [];
            for (let k = 0; k < d.length; k += 4 * 5) {
              const bg = { r: d[k], g: d[k + 1], b: d[k + 2] };
              const fg = { r: fg0.r * a + bg.r * (1 - a), g: fg0.g * a + bg.g * (1 - a), b: fg0.b * a + bg.b * (1 - a) };
              const L1 = lum(fg), L2 = lum(bg); rs.push((Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05));
            }
            rs.sort((m, n) => m - n);
            const need = (e.px >= 24 || (e.px >= 18.66 && e.wt >= 700)) ? 3 : 4.5;
            return { t: e.t, worst: rs[Math.floor(rs.length * 0.1)] ?? 99, need };
          });
        }, { shot, els });
        const bad = res.filter(r => r.worst < r.need);
        const tight = [...res].sort((m, n) => m.worst / m.need - n.worst / n.need)[0];
        const white = res.filter(r => /דנה|ימים לאירוע|נבנה עם/.test(r.t)).map(r => `"${r.t}" ${r.worst.toFixed(2)}`).join(' · ');
        ok(bad.length === 0, `${url} on a ${pname} photo: every text ≥ its AA ratio`,
          bad.length ? bad.map(r => `"${r.t}" ${r.worst.toFixed(2)}/${r.need}`).join(' · ')
            : `tightest "${tight.t}" ${tight.worst.toFixed(2)}/${tight.need}; ${white}`);
        await ctx.close();
      }
    }
  }

} finally {
  await browser.close();
  server.stop();
  if (!process.env.GUEST_OUT) rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
