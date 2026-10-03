// The cookie question (WORKPLAN 126, owner 3.10), in a real browser.
//
// Builds with a fake PostHog key and a host the page routes to a stub, then
// reads every claim back off the wire and out of storage — never from the code
// that wrote it:
//   • before an answer: the banner is there, posthog-js is not even fetched,
//     nothing reaches PostHog, nothing of PostHog's is stored;
//   • the two answers are the same size and skin; nothing is pre-ticked;
//   • yes: it loads and sends; reload: not asked again;
//   • no (first layer, or later from the footer): nothing is sent, and the id
//     PostHog stored is gone;
//   • guest pages: never asked, never measured;
//   • the guided tour waits for the answer instead of covering the banner;
//   • phones: fits at 320, no horizontal scroll, 44px targets.
//   node qa/cookieConsent.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import zlib from 'zlib';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const OUT = mkdtempSync(join(tmpdir(), 'consent-'));
const PH = 'http://127.0.0.1:4796';   // nothing listens: answered by the route below
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_POSTHOG_KEY: 'phc_test', VITE_POSTHOG_HOST: PH },
});
// posthog-js's own chunk, found by CONTENT: a name match passed vacuously once
// (it was module-<hash>.js before src/lib/posthogLoader.js gave it a name).
// The app's entry calls opt_out_capturing too (to withdraw), so it is excluded.
const PH_CHUNKS = readdirSync(join(OUT, 'assets'))
  .filter(f => f.endsWith('.js') && !f.startsWith('index-') && readFileSync(join(OUT, 'assets', f), 'utf8').includes('opt_out_capturing'));
if (PH_CHUNKS.length !== 1) throw new Error('expected one posthog-js chunk, found: ' + PH_CHUNKS.join(', '));
const SW = readFileSync(join(OUT, 'sw.js'), 'utf8');
const server = await startPreview(4795, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  // The tour skips an automated browser; this test needs it to try to open.
  args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
});

const decode = (buf) => {
  if (!buf?.length) return '';
  try { return zlib.gunzipSync(buf).toString('utf8'); } catch { /* not gzip */ }
  const raw = buf.toString('utf8');
  const m = /data=([^&]+)/.exec(raw);
  if (m) { try { return Buffer.from(decodeURIComponent(m[1]), 'base64').toString('utf8'); } catch { /* */ } }
  return raw;
};
/** The capture times of every event in a request body. */
const eventTimes = (body) => {
  try {
    const j = JSON.parse(body);
    const list = Array.isArray(j) ? j : j.batch || [j];
    return list.map(e => Date.parse(e.timestamp || e.properties?.$time * 1000)).filter(Number.isFinite);
  } catch { return [NaN]; }
};

/** One "computer": a fresh profile, every PostHog request and chunk recorded. */
async function computer({ width = 390, height = 844, touch = width < 600 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, hasTouch: touch, isMobile: touch, serviceWorkers: 'block',
    // PostHog drops events from a headless user agent; without a real one the
    // "it sends after a yes" checks would pass vacuously in the other direction.
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  const sent = [];
  const chunks = [];
  p.on('request', r => { if (PH_CHUNKS.some(f => r.url().includes(f))) chunks.push(r.url()); });
  await ctx.route(PH + '/**', async (route) => {
    const u = new String(route.request().url().slice(PH.length));
    u.body = decode(route.request().postDataBuffer());
    sent.push(u);
    if (/\.js(\?|$)/.test(route.request().url())) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
  });
  return { ctx, p, errs, sent, chunks };
}
const go = async (p, path) => { await p.goto(server.base + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500); };
const banner = (p) => p.$('section[aria-labelledby="consent-title"]');
const phKeys = (p) => p.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter(k => k.startsWith('ph_')));
const consent = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('kochav_consent_v1') || 'null'));
const btn = (p, name) => p.getByRole('button', { name, exact: true });
// Flushes posthog's batch: a pagehide sends whatever is queued.
const flush = async (p) => { await p.waitForTimeout(3500); await p.goto('about:blank'); await p.waitForTimeout(600); };
const hscroll = (p) => p.evaluate(() => { window.scrollTo({ left: -1e5, behavior: 'instant' }); const x = window.scrollX; window.scrollTo({ left: 0, behavior: 'instant' }); return x; });

try {
  for (const [w, h] of [[320, 640], [390, 844], [1280, 860]]) {
    console.log(`\n── first visit, ${w}px`);
    const { ctx, p, errs, sent, chunks } = await computer({ width: w, height: h });
    await go(p, '/home');
    const b = await banner(p);
    ok(!!b, 'the question is shown');
    const box = b && await b.boundingBox();
    ok(box && box.y + box.height <= h && box.x >= 0 && box.x + box.width <= w, 'the banner is fully on screen', box && `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}`);
    if (w <= 390) ok(box && box.height <= h * 0.5, 'and takes no more than half a phone screen', box && `${Math.round(box.height)}px of ${h}`);
    const [y, n] = [await btn(p, 'אישור').boundingBox(), await btn(p, 'סירוב').boundingBox()];
    ok(Math.abs(y.width - n.width) < 1 && Math.abs(y.height - n.height) < 1, 'אישור and סירוב are the same size', `${y.width}×${y.height} / ${n.width}×${n.height}`);
    const skin = await p.evaluate(() => {
      const [a, b] = ['אישור', 'סירוב'].map(t => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t));
      const s = el => { const c = getComputedStyle(el); return [c.backgroundColor, c.color, c.borderColor, c.fontWeight, c.fontSize].join('|'); };
      return [s(a), s(b)];
    });
    ok(skin[0] === skin[1], 'and the same skin (colour, border, weight)', skin.join('  vs  '));
    if (w < 600) {
      for (const name of ['אישור', 'סירוב', 'ניהול העדפות']) {
        const r = await btn(p, name).boundingBox();
        ok(r.height >= 44, `"${name}" is a 44px touch target`, `${r.height}px`);
      }
    }
    ok(await hscroll(p) === 0, 'no horizontal scroll');
    ok(chunks.length === 0, 'posthog-js is not even downloaded', chunks.join(' '));
    ok((await phKeys(p)).length === 0, 'nothing of PostHog\'s is stored');
    await flush(p);
    ok(sent.length === 0, 'nothing reaches PostHog before an answer', sent.join(' '));
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await ctx.close();
  }

  console.log('\n── אישור');
  {
    const { ctx, p, errs, sent, chunks } = await computer();
    await go(p, '/home');
    await btn(p, 'אישור').click();
    await p.waitForTimeout(800);
    ok(!(await banner(p)), 'the question goes away');
    const c = await consent(p);
    ok(c?.analytics === true && !!Date.parse(c?.at), 'the answer is stored, with when it was given', JSON.stringify(c));
    ok(chunks.length > 0, 'posthog-js is fetched now');
    await p.waitForTimeout(1500);
    ok((await phKeys(p)).length > 0, 'and keeps its id', (await phKeys(p)).join(','));
    await go(p, '/pricing');
    ok(!(await banner(p)), 'not asked again on the next page');
    await flush(p);
    ok(sent.some(u => /^\/(e|i|batch)\//.test(u)), 'events reach PostHog — the page the yes was given on included', sent.map(u => u.split('?')[0]).join(' '));
    await go(p, '/home');
    ok(!(await banner(p)), 'not asked again after a reload');

    console.log('\n── changing your mind: the footer');
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await btn(p, 'הגדרות עוגיות').click();
    const dlg = p.getByRole('dialog', { name: 'העדפות עוגיות ופרטיות' });
    ok(await dlg.isVisible(), 'the footer opens the preferences');
    ok(await p.getByRole('checkbox', { name: 'מדידת שימוש' }).isChecked(), 'showing the yes that was given');
    const withdrawnAt = Date.now();
    await btn(p, 'דחיית הכל').click();
    await p.waitForTimeout(500);
    ok((await consent(p))?.analytics === false, 'the no is stored');
    ok((await phKeys(p)).length === 0, 'PostHog\'s id is deleted from the browser', (await phKeys(p)).join(','));
    const before = sent.length;
    await go(p, '/pricing');
    await go(p, '/help');
    await flush(p);
    // posthog-js batches for ~3s. Events captured while the yes still stood
    // can leave in that batch just after the no (opt-out does not empty it) —
    // withdrawal is not retroactive, so that is allowed. Anything CAPTURED
    // after the no is not.
    const after = sent.slice(before).flatMap(u => eventTimes(u.body));
    ok(after.every(t => t < withdrawnAt), 'and nothing captured after the no is sent',
      `${sent.length - before} late request(s), event times ${after.map(t => Number.isFinite(t) ? t - withdrawnAt + 'ms' : 'unreadable').join(', ')}`);
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await ctx.close();
  }

  console.log('\n── no, then yes again, without leaving the page');
  {
    // The id lives in posthog's memory too. Clearing storage alone brought the
    // SAME id back on a yes in the same visit, tying the visits before the
    // withdrawal to the ones after (3.10 review, measured). A reload hides it,
    // so this stays on one page.
    const { ctx, p, errs } = await computer({ width: 1280, height: 860, touch: false });
    const phId = () => p.evaluate(() => { const k = Object.keys(localStorage).find(x => /^ph_.*_posthog$/.test(x)); return k ? JSON.parse(localStorage.getItem(k)).distinct_id : null; });
    await go(p, '/home');
    await btn(p, 'אישור').click();
    await p.waitForTimeout(1500);
    const idBefore = await phId();
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await btn(p, 'הגדרות עוגיות').click();
    await btn(p, 'דחיית הכל').click();
    await p.waitForTimeout(300);
    await btn(p, 'הגדרות עוגיות').click();
    await btn(p, 'אישור הכל').click();
    // Nothing is persisted until something is captured: a client-side page
    // change sends a pageview (a reload would hide what is being tested).
    await p.evaluate(() => { history.pushState({}, '', '/pricing'); dispatchEvent(new PopStateEvent('popstate')); });
    await p.waitForTimeout(1500);
    const idAfter = await phId();
    ok(!!idBefore && !!idAfter && idAfter !== idBefore, 'a yes after a no starts a new id', `${idBefore} → ${idAfter}`);
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await ctx.close();
  }

  console.log('\n── סירוב');
  {
    const { ctx, p, errs, sent, chunks } = await computer({ width: 1280, height: 860, touch: false });
    await go(p, '/home');
    await btn(p, 'סירוב').click();
    await p.waitForTimeout(400);
    ok(!(await banner(p)), 'the question goes away');
    ok((await consent(p))?.analytics === false, 'stored as a no');
    await go(p, '/pricing');
    await go(p, '/home');
    ok(!(await banner(p)), 'not asked again');
    await flush(p);
    ok(chunks.length === 0 && sent.length === 0, 'posthog-js never fetched, nothing sent', `${chunks.length} chunks, ${sent.length} requests`);
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await ctx.close();
  }

  console.log('\n── the preferences, by keyboard');
  {
    const { ctx, p } = await computer({ width: 1280, height: 860, touch: false });
    await go(p, '/home');
    const manage = btn(p, 'ניהול העדפות');
    await manage.focus();
    await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    ok(!(await p.getByRole('checkbox', { name: 'מדידת שימוש' }).isChecked()), 'measurement is not ticked in advance');
    const inside = [];
    for (let i = 0; i < 12; i++) {
      await p.keyboard.press('Tab');
      inside.push(await p.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
    }
    ok(inside.every(Boolean), 'Tab stays inside the dialog');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.activeElement?.textContent.trim()) === 'ניהול העדפות', 'Escape returns focus to "ניהול העדפות"');
    ok(!!(await banner(p)) && (await consent(p)) === null, 'and decided nothing — the question is still there');
    await ctx.close();
  }

  console.log('\n── guest pages');
  for (const path of ['/rsvp/abc123token', '/gift/abc123token', '/album/abc123token', '/invite/abc123token']) {
    const { ctx, p, sent, chunks } = await computer();
    await go(p, path);
    const asked = !!(await banner(p));
    await flush(p);
    ok(!asked && chunks.length === 0 && sent.length === 0, `${path.split('/')[1]}: not asked, not measured`, `${asked ? 'asked' : ''} ${chunks.length} chunks, ${sent.length} requests`);
    await ctx.close();
  }

  console.log('\n── the guided tour waits for the answer');
  {
    const { ctx, p } = await computer({ width: 1280, height: 860, touch: false });
    await go(p, '/start');
    await p.waitForTimeout(4000);
    const tour = () => p.$('[role="dialog"][data-side]');
    ok(!!(await banner(p)) && !(await tour()), 'after 5.5s the question is there and the tour is not');
    await btn(p, 'אישור').click();
    // The click itself counts as input: the tour then waits its 1.5s pause.
    await p.waitForSelector('[role="dialog"][data-side]', { timeout: 6000 }).catch(() => {});
    ok(!!(await tour()), 'answered: the tour opens');
    await ctx.close();
  }

  console.log('\n── service worker');
  ok(!PH_CHUNKS.some(f => SW.includes(f)), 'posthog-js is not in the precache — no guest downloads it', PH_CHUNKS.join(', '));

  console.log('\n── a guest who goes on to our home page and says yes there');
  {
    const { ctx, p, sent } = await computer();
    await go(p, '/rsvp/GUESTTOKEN123');
    ok(!(await banner(p)), 'not asked on the RSVP page');
    // Client-side, as the RSVP page's own link does: the same JS, the same memory.
    await p.evaluate(() => { history.pushState({}, '', '/home'); dispatchEvent(new PopStateEvent('popstate')); });
    await p.waitForTimeout(1200);
    await btn(p, 'אישור').click();
    await flush(p);
    const bodies = sent.map(u => u.body).join(' ');
    ok(sent.length > 0 && !/rsvp/i.test(bodies), 'the RSVP page is not sent after the yes', `${sent.length} requests; rsvp in body: ${/rsvp/i.test(bodies)}`);
    await ctx.close();
  }

  console.log('\n── another dialog while the question is open (360px)');
  {
    const { ctx, p } = await computer({ width: 360, height: 640 });
    await go(p, '/home');
    await p.evaluate(() => {
      const d = document.createElement('div');
      d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true'); d.id = 'probe';
      d.style.cssText = 'position:fixed;inset-inline:16px;bottom:200px;height:44px;z-index:200;background:#eee';
      document.body.appendChild(d);
    });
    const hit = await p.evaluate(() => { const r = document.getElementById('probe').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id; });
    ok(hit === 'probe', 'a tap on the dialog reaches the dialog, not the banner', String(hit));
    await p.evaluate(() => document.getElementById('probe').remove());
    ok(await (await banner(p))?.isVisible(), 'and the banner is back when it closes');
    await ctx.close();
  }

  console.log('\n── focus after a keyboard answer');
  {
    const { ctx, p } = await computer({ width: 1280, height: 860, touch: false });
    await go(p, '/home');
    await btn(p, 'סירוב').focus();
    await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    const where = await p.evaluate(() => document.activeElement?.tagName + '#' + document.activeElement?.id);
    ok(where === 'MAIN#main', 'focus goes to the page content, not <body>', where);
    await ctx.close();
  }

  console.log('\n── the privacy page');
  {
    const { ctx, p } = await computer();
    await go(p, '/privacy#device');
    const top = await p.evaluate(() => document.getElementById('device')?.getBoundingClientRect().top);
    ok(top != null && top > -5 && top < 300, '#device scrolls to section 7', String(top));
    await btn(p, 'סירוב').click();
    await btn(p, 'לשינוי הבחירה — הגדרות עוגיות').click();
    ok(await p.getByRole('dialog', { name: 'העדפות עוגיות ופרטיות' }).isVisible(), 'its button opens the preferences');
    const fits = await p.evaluate(() => { const r = document.querySelector('[role="dialog"]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    ok(fits, 'the dialog fits a phone screen');
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
