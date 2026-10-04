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
  if (k === 'long') return { ...BASE_EV, name: LONG_NAME, bride_name: 'אלכסנדרה-מרגריטה', groom_name: 'בנימין-זאב יהונתן', site: LONG_SITE };
  // No couple: the wall shows the event's own name, and this one is long.
  if (k === 'longorg') return { ...BASE_EV, name: `${LONG_NAME} — ערב ההוקרה השנתי למשפחות המייסדים`, bride_name: null, groom_name: null };
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

  /* ── P2-2 · placeholder text at the browser's default grey ──────────────── */
  if (want('placeholder')) {
    console.log('\n── placeholder: ::placeholder colour against the field it is drawn in');
    const pages = [
      ['/login'], ['/signup'], ['/reset-password'], ['/start'],
      ['/rsvp/ok', async p => { await p.getByRole('button', { name: /^כן/ }).first().click(); await p.waitForTimeout(300); }],
      ['/rsvp/ok', async p => { await p.getByRole('button', { name: /^לא/ }).first().click(); await p.waitForTimeout(300); }],
    ];
    for (const [path, drive] of pages) {
      const { ctx, p } = await open(path);
      if (drive) await drive(p);
      const rows = await p.evaluate(() => {
        const parse = (c) => { const v = c.match(/[\d.]+/g).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 }; };
        const lum = ({ r, g, b }) => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
        // The field's own ground: its background composited over its ancestors'.
        const ground = (el) => {
          const layers = [];
          for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
          let bg = { r: 255, g: 255, b: 255, a: 1 };
          for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
          return bg;
        };
        return [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter(el => el.getBoundingClientRect().width > 0).map(el => {
          const ph = getComputedStyle(el, '::placeholder');
          const bg = ground(el);
          const fg = over({ ...parse(ph.color), a: parse(ph.color).a * Number(ph.opacity || 1) }, bg);
          const L1 = lum(fg), L2 = lum(bg);
          return { ph: el.placeholder, ratio: (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05), color: ph.color };
        });
      });
      for (const r of rows) ok(r.ratio >= 4.5, `${path} "${r.ph}" placeholder ≥ 4.5:1`, `${r.ratio.toFixed(2)} (${r.color})`);
      if (!rows.length) ok(false, `${path}: found a field with a placeholder`);
      await ctx.close();
    }
  }

  /* ── P2-3 · the projected gift wall with a long couple's name ───────────── */
  if (want('giftwall')) {
    console.log('\n── giftwall: a long event name truncates with an ellipsis inside the bar');
    for (const [width, token] of [[390, 'long'], [768, 'long'], [768, 'longorg'], [1280, 'longorg']]) {
      const { ctx, p } = await open(`/gift/${token}/wall`, { width, height: 900 });
      const r = await p.evaluate(() => {
        const h = document.querySelector('h1'), bar = h.parentElement, label = bar.lastElementChild;
        const hb = h.getBoundingClientRect(), bb = bar.getBoundingClientRect(), lb = label.getBoundingClientRect();
        return { truncated: h.scrollWidth > h.clientWidth + 1, inBar: hb.left >= bb.left - 1 && hb.right <= bb.right + 1,
          labelOn: lb.left >= 0 && lb.right <= innerWidth, h: [Math.round(hb.left), Math.round(hb.right)], bar: [Math.round(bb.left), Math.round(bb.right)] };
      });
      const sx = await hscroll(p);
      // Inside the bar is the defect: a flex item's min-width:auto kept the h1
      // as wide as its text, so the ellipsis it is styled with never fired and
      // the name ran off the screen (clipped by .root's overflow:hidden).
      ok(r.inBar && r.labelOn && sx === 0, `@${width} ${token}: name inside the bar${r.truncated ? ' (ellipsised)' : ' (fits)'}, "קיר ברכות" on screen, no sideways scroll`,
        `h1 ${r.h} bar ${r.bar} scrollX=${sx}`);
      await ctx.close();
    }
  }

  /* ── P2-4 · /start opens at its hero, not scrolled to the form ──────────── */
  if (want('start')) {
    console.log('\n── start: the first screen a new host sees opens at the top');
    for (const [width, height] of [[320, 568], [360, 640], [390, 844], [768, 1024], [1280, 720], [1024, 560]]) {
      const { ctx, p } = await open('/start', { width, height });
      await p.waitForTimeout(400);
      const r = await p.evaluate(() => {
        const h1 = document.querySelector('h1');
        const name = document.querySelector('[data-tour="start.names"] input');
        // Any scroller that moved, not only the window.
        const moved = [...document.querySelectorAll('*')].filter(e => e.scrollTop > 0).map(e => `${e.tagName}${e.id ? '#' + e.id : ''}:${e.scrollTop}`);
        return { y: Math.round(scrollY), moved, h1Top: h1 ? Math.round(h1.getBoundingClientRect().top) : null,
          nameTop: name ? Math.round(name.getBoundingClientRect().top) : null, focusedName: document.activeElement === name };
      });
      ok(r.y === 0 && r.h1Top !== null && r.h1Top >= 0, `@${width} /start is not scrolled past its hero`, JSON.stringify(r));
      // On a pointer device the first field still takes the caret — the
      // shortcut is kept, only the jump is gone.
      if (width >= 1024) ok(r.focusedName, `@${width} the first name field still has focus`);
      await ctx.close();
    }
  }

  /* ── P2-5 · tap targets on the public and guest pages ───────────────────── */
  if (want('targets')) {
    console.log('\n── targets: EFFECTIVE tap area on a phone (elementFromPoint, so ::after expansions count)');
    // A standalone control needs 44px (measured as ≥43: the walk steps whole
    // pixels from a fractional centre and loses one). A link inside a line of
    // running text is WCAG 2.5.8's inline exception and needs 24.
    const PAGES = ['/login', '/signup', '/terms', '/privacy', '/refunds', '/accessibility', '/pricing', '/help',
      '/invite/ok', '/gift/ok', '/card/ok?g=g1&n=%D7%99%D7%A2%D7%9C&t=4', '/rsvp/ok', '/save-the-date/ok', '/save-the-date/lay-card', '/album/ok',
      // Every guest page's dead-link state, which is a page with one way out.
      ...['invite', 'gift', 'card', 'rsvp', 'save-the-date', 'album', 'collab', 'hostess'].map(r => `/${r}/bad`), '/gift/bad/wall'];
    // Two columns of the legal identity box on a touch tablet.
    const CASES = [...PAGES.map(p => [p, 390]), ['/terms', 768], ['/accessibility', 768]];
    for (const [path, width] of CASES) {
      const { ctx, p } = await open(path, { width, mobile: true });
      const rows = await p.evaluate(() => {
        document.documentElement.style.scrollBehavior = 'auto';
        const out = [];
        for (const el of document.querySelectorAll('a[href], button')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) continue;
          if (el.closest('[class*=skipLink]')) continue;
          const text = (el.getAttribute('aria-label') || el.textContent).trim().replace(/\s+/g, ' ').slice(0, 26);
          const par = el.parentElement;
          const inline = cs.display === 'inline' && par && par.textContent.trim().length > el.textContent.trim().length + 8;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const r = el.getClientRects()[0];
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const own = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
          if (!own(cx, cy)) { out.push({ text, inline, w: 0, h: 0, covered: true }); continue; }
          let up = 0, down = 0, l = 0, rt = 0;
          while (up < 30 && own(cx, cy - up - 1)) up++;
          while (down < 30 && own(cx, cy + down + 1)) down++;
          while (l < 40 && own(cx - l - 1, cy)) l++;
          while (rt < 40 && own(cx + rt + 1, cy)) rt++;
          out.push({ text, inline, w: l + rt + 1, h: up + down + 1 });
        }
        return out;
      });
      const bad = rows.filter(r => r.inline ? r.h < 24 : (r.h < 43 || r.w < 43));
      ok(bad.length === 0, `@${width} ${path}: every control ≥44 (inline links ≥24)`,
        bad.map(r => `"${r.text}" ${r.w}×${r.h}${r.inline ? ' inline' : ''}${r.covered ? ' COVERED' : ''}`).join(' · '));
      await ctx.close();
    }
  }

  /* ── P2-6 · the tab names the page ──────────────────────────────────────── */
  if (want('titles')) {
    console.log('\n── titles: document.title per route and state, read from the live page');
    const { ROUTE_TITLES, NOT_FOUND_TITLE, SEO_PAGES, pageTitle } = await import('../src/data/seo.js');
    const { COMPANY, DESCRIPTOR } = await import('../src/data/company.js');
    const { INVALID_LINK_TEXT, UNREACHABLE_TEXT } = await import('../src/data/guestCopy.js');
    const DEAD = `${INVALID_LINK_TEXT.title} · ${COMPANY.name}`, OFF = `${UNREACHABLE_TEXT.title} · ${COMPANY.name}`;
    const want = [
      ...Object.entries(ROUTE_TITLES).map(([path, t]) => [path, `${t} · ${COMPANY.name}`]),
      ['/no-such-page', NOT_FOUND_TITLE],
      ...['invite', 'rsvp', 'gift', 'card', 'album', 'save-the-date', 'invitation', 'collab', 'hostess'].map(r => [`/${r}/bad`, DEAD]),
      ['/gift/bad/wall', DEAD],
      ...['invite', 'rsvp', 'gift', 'card', 'album', 'save-the-date', 'collab', 'hostess'].map(r => [`/${r}/down`, OFF]), ['/gift/down/wall', OFF],
      // Unchanged: an indexable page keeps its own, the home page its own.
      ['/pricing', pageTitle(SEO_PAGES.find(p => p.path === '/pricing'))],
      ['/home', `${COMPANY.name} — ${DESCRIPTOR}`],
    ];
    for (const [path, title] of want) {
      const { ctx, p } = await open(path, { width: 1280, mobile: false });
      await p.waitForTimeout(300);
      const got = await p.title();
      ok(got === title, `${path} → "${title}"`, got === title ? '' : `got "${got}"`);
      await ctx.close();
    }
    // A client-side move from one 404 to another keeps the screen mounted;
    // the route default runs again and must not win.
    const { ctx, p } = await open('/no-such-page', { width: 1280, mobile: false });
    await p.evaluate(() => { history.pushState({}, '', '/another-missing-page'); dispatchEvent(new PopStateEvent('popstate')); });
    await p.waitForTimeout(300);
    ok((await p.title()) === NOT_FOUND_TITLE, '404 → 404 by client navigation keeps the 404 title', await p.title());
    await p.evaluate(() => { history.pushState({}, '', '/login'); dispatchEvent(new PopStateEvent('popstate')); });
    await p.waitForTimeout(300);
    ok((await p.title()) === `${ROUTE_TITLES['/login']} · ${COMPANY.name}`, '404 → /login by client navigation takes the login title', await p.title());
    await ctx.close();
  }

  /* ── P2-8 · one word alone on a heading's last line ─────────────────────── */
  if (want('orphans')) {
    console.log('\n── orphans: h1–h3 whose last line is a single word (counted per word box)');
    const PAGES = ['/home', '/pricing', '/help', '/services/seating', '/services/event-site', '/services/planning',
      '/services/rsvp', '/services/event-day', '/services/gifts', '/login', '/signup', '/start', '/terms', '/privacy',
      '/accessibility', '/refunds', '/invite/ok', '/invite/long', '/rsvp/ok', '/gift/ok', '/save-the-date/ok', '/album/ok', '/no-such-page'];
    let total = 0, headings = 0;
    const list = [];
    for (const width of [320, 390, 768, 1280]) {
      for (const path of PAGES) {
        const { ctx, p } = await open(path, { width, mobile: width < 800 });
        const r = await p.evaluate(() => {
          const out = []; let n = 0;
          for (const h of document.querySelectorAll('h1,h2,h3')) {
            if (!h.getClientRects().length || getComputedStyle(h).visibility === 'hidden') continue;
            n++;
            const words = [];
            const tw = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
            for (let t; (t = tw.nextNode());) {
              const re = /\S+/g; let m;
              while ((m = re.exec(t.nodeValue))) {
                const rg = document.createRange(); rg.setStart(t, m.index); rg.setEnd(t, m.index + m[0].length);
                const b = rg.getBoundingClientRect(); if (b.width < 1) continue;
                words.push({ w: m[0], y: b.top + b.height / 2 });
              }
            }
            const lines = [];
            for (const w of words) { const L = lines.find(l => Math.abs(l.y - w.y) < 6); if (L) L.ws.push(w.w); else lines.push({ y: w.y, ws: [w.w] }); }
            lines.sort((a, b) => a.y - b.y);
            const last = lines.at(-1);
            if (lines.length >= 2 && last.ws.filter(w => /[\p{L}\p{N}]/u.test(w)).length === 1) out.push(`${h.tagName} "${h.textContent.trim().replace(/\s+/g, ' ').slice(0, 50)}" alone="${last.ws.join(' ')}"`);
          }
          return { out, n };
        });
        total += r.out.length; headings += r.n;
        r.out.forEach(o => list.push(`@${width} ${path} ${o}`));
        await ctx.close();
      }
    }
    list.forEach(l => console.log('     ' + l));
    // 41 before the fix (4.10). Not zero after: at 320px two headings are
    // wider than two of their words can share a line with the third, and
    // balance cannot help a line that holds one word.
    ok(total <= 2, `orphaned headings ≤ 2 (41 before audit 3.10 P2-8)`, `${total} of ${headings} measured`);
    const style = await (async () => {
      const { ctx, p } = await open('/home', { width: 1280, mobile: false });
      const s = await p.evaluate(() => [...document.querySelectorAll('h1,h2,h3')].filter(h => !/balance|pretty/.test(getComputedStyle(h).textWrapStyle || getComputedStyle(h).textWrap)).map(h => h.textContent.trim().slice(0, 30)));
      await ctx.close(); return s;
    })();
    ok(style.length === 0, 'every h1–h3 on /home wraps with balance (or a deliberate pretty)', style.join(' · '));
  }

  /* ── P2-9 · the personal card's ✦ between the two names ─────────────────── */
  if (want('card')) {
    console.log('\n── card: the ✦ between the couple\'s names — one line, or a stack of three, never beside one name');
    const NAMES = [['דנה', 'יוסי'], ['אלכסנדרה-מרגריטה', 'בנימין-זאב יהונתן'], ['שירה', 'בנימין-זאב יהונתן'], ['אלכסנדרה-מרגריטה', 'טל']];
    for (const width of [320, 390, 768]) {
      for (const [a, b] of NAMES) {
        const { ctx, p } = await open('/card/ok', { width, setup: async (pg) => {
          await pg.route(SUPA + '/rest/v1/rpc/public_event_by_token', r => r.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ ...BASE_EV, bride_name: a, groom_name: b }) }));
        } });
        const r = await p.evaluate(() => {
          const h = document.querySelector('h1'); const kids = [...h.children];
          const sep = kids.find(k => k.textContent.trim() === '✦');
          if (!sep) return { err: 'no separator' };
          const mid = el => { const x = el.getBoundingClientRect(); return x.top + x.height / 2; };
          const names = kids.filter(k => k !== sep);
          const sameLine = names.filter(n => Math.abs(mid(n) - mid(sep)) < 8);
          const sx = (() => { scrollTo({ left: -1e5, behavior: 'instant' }); const v = scrollX; scrollTo({ left: 0, behavior: 'instant' }); return v; })();
          return { lines: new Set(kids.map(k => Math.round(mid(k)))).size, withSep: sameLine.length, sx };
        });
        // Fine: all three on one line, or a stack of three with the star on
        // its own line between the names. Not fine: the star riding at the end
        // of the first name's line or leading the second's — a stray mark
        // beside one name, which is what flex-wrap produced.
        const good = !r.err && r.sx === 0 && (r.withSep === 2 || (r.withSep === 0 && r.lines === 3));
        ok(good, `@${width} "${a}" ✦ "${b}"`, JSON.stringify(r));
        await ctx.close();
      }
    }
  }

  /* ── H7 · the self-hosted serif, loaded and rendering ───────────────────── */
  if (want('fonts')) {
    console.log('\n── fonts: Frank Ruhl Libre 500/700/900 load from /fonts and set the text');
    const { ctx, p } = await open('/terms', { width: 1280, mobile: false });
    const r = await p.evaluate(async () => {
      const TEXT = 'תנאי השימוש ✦ Unica Plan 2027';
      const width = (family, weight) => {
        const s = document.createElement('span');
        s.style.cssText = `font: ${weight} 40px ${family}; position: absolute; white-space: nowrap; visibility: hidden`;
        s.textContent = TEXT; document.body.append(s);
        const w = s.getBoundingClientRect().width; s.remove(); return Math.round(w * 100) / 100;
      };
      const out = {};
      for (const wt of [500, 700, 900]) {
        await document.fonts.load(`${wt} 40px "Frank Ruhl Libre"`, TEXT);
        out[wt] = { loaded: document.fonts.check(`${wt} 40px "Frank Ruhl Libre"`, TEXT), serif: width('"Frank Ruhl Libre"', wt), fallback: width('Georgia', wt) };
      }
      out.files = performance.getEntriesByType('resource').map(e => new URL(e.name).pathname).filter(u => u.startsWith('/fonts/'));
      const h1 = document.querySelector('h1');
      out.h1 = getComputedStyle(h1).fontFamily.split(',')[0];
      out.faces = [...document.fonts].filter(f => f.family.includes('Frank')).map(f => `${f.weight}:${f.status}`);
      return out;
    });
    console.log('     ' + JSON.stringify(r));
    for (const wt of [500, 700, 900]) {
      ok(r[wt].loaded && r[wt].serif !== r[wt].fallback, `Frank Ruhl Libre ${wt} loaded and in use`, `width ${r[wt].serif} vs Georgia ${r[wt].fallback}`);
    }
    ok(r.files.length > 0 && r.files.every(f => f.endsWith('.woff2')), 'served as WOFF2', r.files.join(' '));
    await ctx.close();
  }

} finally {
  await browser.close();
  server.stop();
  if (!process.env.GUEST_OUT) rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
