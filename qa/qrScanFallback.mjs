// QR check-in on a browser WITHOUT BarcodeDetector — i.e. an iPhone.
// WORKPLAN ד2/ק, 28.9.
//
// Until 28.9 the scan button was gated on `"BarcodeDetector" in window`, so on
// Safari — every iPhone, most of the phones at the door — it did not exist.
// The scanner now falls back to jsQR, loaded only on such browsers.
//
// This drives the real entrance screen with a FAKE CAMERA: a Y4M video whose
// frames are a real QR code for guest g1, fed to Chromium as its webcam.
// BarcodeDetector is deleted before any page script runs, so the only way the
// guest can end up checked in is through the jsQR path. The result is read
// back out of localStorage, not the DOM.
//
//   node qa/qrScanFallback.mjs      (starts and stops its own dev server)
import { createRequire } from 'module';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startDev } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const require = createRequire(ROOT + '/');
const { chromium } = require('playwright');
const QRCode = require('qrcode');

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

// ── A Y4M (raw YUV 4:2:0) video of the QR code. No ffmpeg here, and the
//    format is simple enough to write by hand: header, then per frame a
//    luma plane and two quarter-size chroma planes. Black 16, white 235.
function qrY4m(text, W = 640, H = 480, frames = 30) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size, quiet = 4;
  const cell = Math.floor(Math.min(W, H) * 0.8 / (n + quiet * 2));
  const side = cell * (n + quiet * 2);
  const x0 = Math.floor((W - side) / 2), y0 = Math.floor((H - side) / 2);
  const Y = Buffer.alloc(W * H, 235);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!modules.get(r, c)) continue;
    for (let dy = 0; dy < cell; dy++) {
      const y = y0 + (r + quiet) * cell + dy;
      Y.fill(16, y * W + x0 + (c + quiet) * cell, y * W + x0 + (c + quiet + 1) * cell);
    }
  }
  const UV = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Y, UV, UV]);
  return Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`), ...Array(frames).fill(frame)]);
}

const DIR = mkdtempSync(join(tmpdir(), 'qrscan-'));
const VIDEO = join(DIR, 'qr.y4m');
writeFileSync(VIDEO, qrY4m('kh1:g1'));

const EVENT = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  brideName: 'דנה', groomName: 'יוסי',
  guests: [
    { id: 'g1', name: 'יעל כהן', count: 2, rsvp: 'confirmed', side: 'bride' },
    { id: 'g2', name: 'איתי לוי', count: 1, rsvp: 'confirmed', side: 'groom' },
  ],
  tables: [{ id: 't1', name: 'שולחן 1', capacity: 10, type: 'regular', shape: 'round' }],
  seating: { g1: 't1', g2: 't1' }, constraints: [],
  tokens: { rsvp: 'r1', album: 'al1', invite: 'i1', gift: 'gi1', hostess: 'h1', collab: 'c1' },
  cloudId: null, createdAt: 1700000000000, updatedAt: 1700000000000,
};

const server = await startDev(5231);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
         `--use-file-for-fake-video-capture=${VIDEO}`],
});

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  // An iPhone: no native detector. Removed before any app code runs.
  await ctx.addInitScript(() => { delete window.BarcodeDetector; });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const jsqrLoaded = [];
  p.on('request', r => { if (/jsqr/i.test(r.url())) jsqrLoaded.push(r.url()); });

  await p.goto(server.base + '/app', { waitUntil: 'domcontentloaded' });
  await p.evaluate(e => {
    localStorage.setItem('kochav_orientation_v1', '1');
    localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: [e], activeEventId: 'e1' }));
  }, EVENT);
  await p.goto(server.base + '/events/e1/checkin', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);

  ok(await p.evaluate(() => !('BarcodeDetector' in window)), 'the page has no BarcodeDetector (the premise)');
  const btn = p.getByRole('button', { name: /סרקו קוד/ });
  ok(await btn.count() === 1, 'the scan button exists anyway — it did not, on an iPhone');
  ok(jsqrLoaded.length === 0, 'jsQR is not loaded before the scanner opens', jsqrLoaded[0] || '');

  await btn.click();
  let arrived = null;
  for (let i = 0; i < 40 && !arrived?.length; i++) {
    await p.waitForTimeout(250);
    arrived = await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('kochav_hashulchan_v1') || '{}');
      return st.events?.[0]?.guests?.find(g => g.id === 'g1')?.arrivedSeats ?? null;
    });
  }
  ok(jsqrLoaded.length > 0, 'jsQR was loaded when the scanner opened');
  ok(Array.isArray(arrived) && arrived.length === 2, 'the scanned guest is checked in — both seats, in localStorage', JSON.stringify(arrived));
  const g2 = await p.evaluate(() => JSON.parse(localStorage.getItem('kochav_hashulchan_v1')).events[0].guests.find(g => g.id === 'g2').arrivedSeats ?? []);
  ok(g2.length === 0, 'and nobody else is');
  ok(/יעל כהן/.test(await p.evaluate(() => document.body.innerText)), 'the screen names who was checked in');
  ok(errs.length === 0, 'no page error', errs[0] || '');
  await ctx.close();

  // ── Offline at the venue, on an iPhone: the decoder download fails. The
  //    message has to be about the connection, not the camera (29.9 review).
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'], serviceWorkers: 'block' });
    await c.addInitScript(() => { delete window.BarcodeDetector; });
    await c.route(/jsqr/i, r => r.abort('internetdisconnected'));
    const pg = await c.newPage();
    await pg.goto(server.base + '/app', { waitUntil: 'domcontentloaded' });
    await pg.evaluate(e => {
      localStorage.setItem('kochav_orientation_v1', '1');
      localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({ events: [e], activeEventId: 'e1' }));
    }, EVENT);
    await pg.goto(server.base + '/events/e1/checkin', { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1200);
    await pg.getByRole('button', { name: /סרקו קוד/ }).click();
    await pg.waitForTimeout(1500);
    const t = await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
    ok(/אין חיבור/.test(t) && !/לפתוח את המצלמה/.test(t), 'decoder download failed: the message says connection, not camera',
       (t.match(/הסורק[^.]*|לא הצלחנו[^.]*/) || [''])[0]);
    await c.close();
  }

  // ── On a GREETER'S link (29.9 review). The host's screen above saves through
  //    localStorage; the greeter's saves over the wire, and that path read the
  //    seats inside a React state updater — which, for a scan (a callback from
  //    requestAnimationFrame after an await), had not run yet. Every scanned
  //    check-in went out as "seats [] from []": the server changed nothing,
  //    the screen said the guest was in, the next refresh took it back. The
  //    request BODY is what is checked here, and a stub server applies it.
  console.log('\n── on the greeter\'s link');
  const SUPA = 'https://stub.supabase.co';
  const door = await startDev(5233, { VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: 'stub-anon-key' });
  try {
    const DATA = {
      id: '11111111-1111-4111-8111-111111111111', name: 'החתונה של דנה ויוסי', writes_open: true,
      guests: [{ id: 'g1', name: 'יעל כהן', count: 2 }, { id: 'g2', name: 'איתי לוי', count: 1 }],
      tables: [{ id: 't1', name: 'שולחן 1', capacity: 10 }], seating: { g1: 't1', g2: 't1' },
    };
    const run = async (offline) => {
      const serverSeats = {}, marks = [];
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'], serviceWorkers: 'block' });
      await c.addInitScript(() => { delete window.BarcodeDetector; });
      await c.route(SUPA + '/**', r => {
        const u = r.request().url();
        if (u.includes('hostess_mark_arrival_by_token')) {
          if (offline) return r.abort('internetdisconnected');
          const b = JSON.parse(r.request().postData() || '{}');
          marks.push(b);
          const cur = new Set(serverSeats[b.guest_id] || []);
          for (const x of b.seats) if (!(b.base || []).includes(x)) cur.add(x);
          for (const x of b.base || []) if (!b.seats.includes(x)) cur.delete(x);
          serverSeats[b.guest_id] = [...cur].sort();
          return r.fulfill({ status: 204, body: '' });
        }
        if (u.includes('hostess_data_by_token')) {
          if (offline && marks.length === 0 && c._loaded) return r.abort('internetdisconnected');
          c._loaded = true;
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DATA) });
        }
        return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });
      const pg = await c.newPage();
      await pg.goto(door.base + '/entrance/h1234567', { waitUntil: 'domcontentloaded' });
      await pg.waitForTimeout(1500);
      await pg.getByRole('button', { name: /סרקו קוד/ }).click();
      for (let i = 0; i < 40 && !(offline ? /לא נשמר/.test(await pg.evaluate(() => document.body.innerText)) : marks.length); i++) await pg.waitForTimeout(250);
      await pg.waitForTimeout(400);
      const text = await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
      await c.close();
      return { marks, serverSeats, text };
    };

    const on = await run(false);
    ok(on.marks.length === 1 && JSON.stringify(on.marks[0].seats) === '[0,1]' && JSON.stringify(on.marks[0].base) === '[]',
       'a scan sends the scanned family\'s seats, and what the screen showed before', JSON.stringify(on.marks[0]));
    ok(JSON.stringify(on.serverSeats.g1) === '[0,1]', 'and the server ends up with both seats', JSON.stringify(on.serverSeats));

    // Offline at the door: the save fails. The mark must not stay on screen
    // as if it had been saved.
    const off = await run(true);
    ok(/לא נשמר: /.test(off.text), 'offline: the failure is said, with the name', off.text.slice(0, 120));
    ok(/0 מתוך 3/.test(off.text), 'offline: the count goes back — the family is not shown as checked in', off.text.slice(0, 90));
    // סב23: the line under the camera said "2 סומנו כהגיעו" after the save failed.
    ok(!/סומנו כהגיעו/.test(off.text) && /לא נשמר, ננסה שוב/.test(off.text), 'offline: the scan line does not claim the check-in', off.text.match(/יעל כהן — [^.]*/)?.[0] || '');
  } finally {
    await door.stop();
  }
} finally {
  await browser.close();
  await server.stop();
  rmSync(DIR, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
