// The host's album screen, driven end to end in a real browser. Checklist 57.
//
// Runs the REAL signed-in path: a dev server with VITE_SUPABASE_* pointed at a
// host that does not exist, a session in localStorage, and every Supabase call
// intercepted here. So what is measured is the shipped code doing
//   fetch album_photos → render grid → hide (PATCH) → delete (storage DELETE,
//   then row DELETE) → the grid read back from the DOM,
// and not a component rendered in isolation.
//
// The ORDER of the two deletes is asserted from the network, because it is the
// whole design: the file must go first. If the row went first and the storage
// call then failed, the photo would stay publicly reachable at its URL while
// vanishing from every list the host can see.
//
//   node qa/albumModerationUi.mjs      (starts and stops its own dev server)
import { createRequire } from 'module';
import { startDev } from './lib/preview.mjs';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const CLOUD = '0b6f6c1e-1111-4222-8333-444455556666';
const ev = {
  id: 'e1', cloudId: CLOUD, name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  guests: [], tables: [], seating: {}, constraints: [], tasks: [], vendors: [],
  eventSite: { gallery: [], schedule: [], shuttles: [], sections: {} },
  tokens: { rsvp: 'r', invite: 'i', gift: 'g', album: 'a', hostess: 'h', collab: 'c' },
  createdAt: 1, updatedAt: 1,
};
const PHOTOS = [
  { id: 'p1', storage_path: `${CLOUD}/1-aaa.jpg`, uploader: 'דודה רחל', created_at: '2026-09-27T22:30:00Z', hidden: false },
  { id: 'p2', storage_path: `${CLOUD}/2-bbb.jpg`, uploader: 'מישהו',    created_at: '2026-09-27T21:00:00Z', hidden: false },
  // Arrives already hidden — the host must see it to un-hide it.
  { id: 'p3', storage_path: `${CLOUD}/3-ccc.jpg`, uploader: 'הוסתרה קודם', created_at: '2026-09-27T20:00:00Z', hidden: true },
];
// A 1×1 PNG, so the <img> tiles actually load.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const { base, stop } = await startDev(5193, {
  VITE_SUPABASE_URL: 'https://stub.supabase.co', VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
});
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

const net = [];          // [method, kind] in the order they happened
try {
  for (const w of [390, 1280]) {
    console.log(`\n══ @${w}`);
    net.length = 0;
    const rows = PHOTOS.map(r => ({ ...r }));
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message.slice(0, 140)));

    await p.route('**/stub.supabase.co/**', async (route) => {
      const req = route.request();
      const url = req.url();
      const m = req.method();
      if (url.includes('/storage/v1/object/public/event-album/')) {
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      }
      if (url.includes('/storage/v1/object/event-album') && m === 'DELETE') {
        net.push(['DELETE', 'storage']);
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      if (url.includes('/rest/v1/album_photos')) {
        if (m === 'PATCH') {
          net.push(['PATCH', 'row', req.postData()]);
          const id = /id=eq\.([^&]+)/.exec(url)?.[1];
          const body = JSON.parse(req.postData() || '{}');
          rows.forEach(r => { if (r.id === id) Object.assign(r, body); });
          // The affected row, as PostgREST returns it for `.select("id")`.
          // This answered '[]' until 28.9 — which is exactly what an RLS
          // REFUSAL looks like, so the harness could not tell a refused write
          // from a successful one. The client now requires one row back.
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id }]) });
        }
        if (m === 'DELETE') {
          net.push(['DELETE', 'row']);
          const id = /id=eq\.([^&]+)/.exec(url)?.[1];
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id }]) });
        }
        net.push(['GET', 'row', url]);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await p.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => {
      const year = Math.floor(Date.now() / 1000) + 31_536_000;
      localStorage.setItem('sb-stub-auth-token', JSON.stringify({
        access_token: 'stub-access', refresh_token: 'stub-refresh', token_type: 'bearer',
        expires_in: 31_536_000, expires_at: year,
        user: { id: 'u-host', aud: 'authenticated', role: 'authenticated',
                email: 'host@example.com', app_metadata: {}, user_metadata: {} },
      }));
    });
    for (const k of ['kochav_hashulchan_v1::u_u-host', 'kochav_hashulchan_v1']) {
      await p.evaluate(([key, e]) => localStorage.setItem(key, JSON.stringify({ events: [e], activeEventId: 'e1' })), [k, ev]);
    }
    await p.goto(`${base}/events/e1/album`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3000);

    const read = () => p.evaluate(() => {
      const tiles = [...document.querySelectorAll('ul li')].filter(li => li.querySelector('img'));
      return tiles.map(li => ({
        who:    li.querySelector('span')?.parentElement ? li.innerText.split('\n').find(Boolean) : '',
        text:   li.innerText.replace(/\s+/g, ' ').trim(),
        tag:    [...li.querySelectorAll('span')].some(s => s.textContent.trim() === 'מוסתרת'),
        loaded: li.querySelector('img').complete && li.querySelector('img').naturalWidth > 0,
      }));
    });

    console.log('── the album renders, keyed on the CLOUD id');
    const get = net.find(n => n[0] === 'GET');
    ok(!!get && get[2].includes(`event_id=eq.${CLOUD}`), 'reads album_photos by events.id', get?.[2]?.slice(-80));
    let t = await read();
    ok(t.length === 3, 'three tiles, the hidden one included', `${t.length}`);
    ok(t.every(x => x.loaded), 'every image actually loaded');
    ok(t.filter(x => x.tag).length === 1, 'exactly one tile says מוסתרת, in words');

    console.log('── dates are local, not UTC (bug class 2)');
    // 22:30 UTC on the 27th is 01:30 on the 28th in Israel. This browser runs
    // in the container zone, so what is asserted is only that the ISO string
    // never reaches the screen — the zone itself is pinned in the unit test.
    ok(!t.some(x => /\d{4}-\d{2}-\d{2}T/.test(x.text)), 'no raw ISO timestamp under any photo', t[0]?.text.slice(0, 60));

    console.log('── hide');
    await p.evaluate(() => [...document.querySelectorAll('button')].find(bb => /הסתרה מהאלבום: דודה רחל/.test(bb.getAttribute('aria-label') || ''))?.click());
    await p.waitForTimeout(600);
    const patch = net.find(n => n[0] === 'PATCH');
    ok(!!patch && JSON.parse(patch[2]).hidden === true, 'PATCHes hidden=true', patch?.[2]);
    ok(patch && Object.keys(JSON.parse(patch[2])).join() === 'hidden', 'and sends ONLY the hidden column', patch?.[2]);
    t = await read();
    ok(t.filter(x => x.tag).length === 2, 'the tile now says מוסתרת');

    console.log('── delete: the FILE goes first');
    p.once('dialog', d => d.accept());
    await p.evaluate(() => [...document.querySelectorAll('button')].find(bb => /מחיקה: מישהו/.test(bb.getAttribute('aria-label') || ''))?.click());
    // The confirm is the app's own dialog, not window.confirm — press its button.
    await p.waitForTimeout(300);
    await p.evaluate(() => [...document.querySelectorAll('button')].find(bb => bb.textContent.trim() === 'מחקו')?.click());
    await p.waitForTimeout(800);
    const order = net.filter(n => n[0] === 'DELETE').map(n => n[1]);
    ok(order.join(',') === 'storage,row', 'storage DELETE then row DELETE', order.join(','));
    t = await read();
    ok(t.length === 2 && !t.some(x => x.text.includes('מישהו')), 'the tile is gone from the grid', `${t.length}`);

    console.log('── contrast, computed against each element\'s ACTUAL ground (bug class 5)');
    {
      const bad = await p.evaluate(() => {
        const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
        const lum = ([r, g, b]) => {
          const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        // Walk up to the first ancestor with an opaque background — a tint is
        // a ground, and white is not assumed.
        const ground = el => {
          for (let n = el; n; n = n.parentElement) {
            const c = rgb(getComputedStyle(n).backgroundColor);
            if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c;
          }
          return [255, 255, 255];
        };
        const out = [];
        const els = [...document.querySelectorAll('main *, body *')].filter(el =>
          el.children.length === 0 && el.textContent.trim().length > 1 &&
          el.closest('ul li, p') && el.getBoundingClientRect().width > 0);
        for (const el of els) {
          const cs = getComputedStyle(el);
          const fg = rgb(cs.color), bg = ground(el);
          const L1 = lum(fg), L2 = lum(bg);
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
          const need = big ? 3 : 4.5;
          // Text on a dimmed (opacity 0.4) hidden tile is the image, not text.
          if (ratio < need) out.push(`${el.textContent.trim().slice(0, 24)} ${ratio.toFixed(2)}:1 < ${need}`);
        }
        return out;
      });
      ok(bad.length === 0, 'every text node in the grid and the note clears AA', bad.slice(0, 4).join(' | '));
    }

    console.log('── layout');
    const x = await p.evaluate(() => { window.scrollTo({ left: -1e5, behavior: "instant" }); const v = window.scrollX; window.scrollTo(0, 0); return v; });
    ok(x === 0, 'no horizontal scroll', `scrollX=${x}`);
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await p.close();
  }
} finally {
  await b.close();
  stop();
}

console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
