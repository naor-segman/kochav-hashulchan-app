// The cookie question (WORKPLAN 126, owner 3.10) with Google Analytics (127),
// in a real browser.
//
// Builds with a fake GA id. www.googletagmanager.com is unreachable from here,
// so the page is served a stub gtag.js and every request to a Google host is
// recorded. What GA WOULD receive is everything our code hands gtag(), and that
// all lands in window.dataLayer — so the checks read dataLayer, cookies and the
// network back, never the code that wrote them:
//   • before an answer: the banner is there, gtag.js is not even requested,
//     dataLayer does not exist, no cookie is written;
//   • the two answers are the same size and skin; nothing is pre-ticked;
//   • yes: gtag.js loads, ads stay denied, the page view goes in scrubbed;
//   • no (first layer, or later from the footer): nothing more goes in, our
//     GA cookies are deleted and another site's _ga is left alone;
//   • guest pages: never asked, never measured;
//   • the guided tour waits for the answer instead of covering the banner;
//   • phones: fits at 320, no horizontal scroll, 44px targets.
// What it cannot see: what the REAL gtag.js adds by itself. That is checked in
// GA's DebugView after deploy (WORKPLAN 127).
//   node qa/cookieConsent.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const OUT = mkdtempSync(join(tmpdir(), 'consent-'));
const GA_ID = 'G-TEST12345';
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_GA_ID: GA_ID },
});
const server = await startPreview(4795, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  // The tour skips an automated browser; this test needs it to try to open.
  args: ['--no-proxy-server', '--disable-blink-features=AutomationControlled'],
});

const GOOGLE = /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net)$/;

/** One "computer": a fresh profile, every request to a Google host recorded. */
async function computer({ width = 390, height = 844, touch = width < 600 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  const google = [];
  await ctx.route(u => GOOGLE.test(new URL(u).hostname), async (route) => {
    google.push(route.request().url());
    // A stub gtag.js: it does nothing, so dataLayer keeps exactly what we gave it.
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' });
  });
  return { ctx, p, errs, google };
}
const go = async (p, path) => { await p.goto(server.base + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500); };
const banner = (p) => p.$('section[aria-labelledby="consent-title"]');
const consent = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('kochav_consent_v1') || 'null'));
const btn = (p, name) => p.getByRole('button', { name, exact: true });
/** dataLayer as plain arrays (gtag pushes Arguments objects), or null if absent. */
const layer = (p) => p.evaluate(() => window.dataLayer ? window.dataLayer.map(a => Array.from(a, v => v instanceof Date ? 'date' : v)) : null);
const pageViews = (l) => (l || []).filter(a => a[0] === 'event' && a[1] === 'page_view').map(a => a[2].page_location.replace(/^https?:\/\/[^/]+/, ''));
const cookies = (p) => p.evaluate(() => document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(Boolean));
const hscroll = (p) => p.evaluate(() => { window.scrollTo({ left: -1e5, behavior: 'instant' }); const x = window.scrollX; window.scrollTo({ left: 0, behavior: 'instant' }); return x; });

try {
  for (const [w, h] of [[320, 640], [390, 844], [1280, 860]]) {
    console.log(`\n── first visit, ${w}px`);
    const { ctx, p, errs, google } = await computer({ width: w, height: h });
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
    await p.waitForTimeout(1500);
    ok(google.length === 0, 'nothing is requested from Google before an answer', google.join(' '));
    ok(await layer(p) === null, 'no dataLayer — nothing is held for Google');
    ok((await cookies(p)).length === 0, 'no cookie is written', (await cookies(p)).join(','));
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await ctx.close();
  }

  console.log('\n── אישור');
  {
    const { ctx, p, errs, google } = await computer();
    await go(p, '/home');
    await btn(p, 'אישור').click();
    await p.waitForTimeout(800);
    ok(!(await banner(p)), 'the question goes away');
    const c = await consent(p);
    ok(c?.analytics === true && !!Date.parse(c?.at), 'the answer is stored, with when it was given', JSON.stringify(c));
    ok(google.length === 1 && google[0].includes('/gtag/js?id=' + GA_ID), 'gtag.js is requested now — once, with our id', google.join(' '));
    const l = await layer(p);
    const cons = l.find(a => a[0] === 'consent' && a[1] === 'default');
    ok(cons && cons[2].ad_storage === 'denied' && cons[2].ad_user_data === 'denied' && cons[2].ad_personalization === 'denied', 'ads stay denied', JSON.stringify(cons?.[2]));
    const cfg = l.find(a => a[0] === 'config');
    ok(cfg && cfg[2].send_page_view === false && cfg[2].allow_google_signals === false && cfg[2].cookie_prefix === 'kh', 'no automatic page view, no Google signals, our own cookie prefix', JSON.stringify(cfg?.[2]));
    ok(JSON.stringify(pageViews(l)) === '["/home"]', 'the page the yes was given on is counted', JSON.stringify(pageViews(l)));
    await p.evaluate(() => { history.pushState({}, '', '/pricing'); dispatchEvent(new PopStateEvent('popstate')); });
    await p.waitForTimeout(800);
    ok(JSON.stringify(pageViews(await layer(p))) === '["/home","/pricing"]', 'and the next page, once', JSON.stringify(pageViews(await layer(p))));
    await go(p, '/home');
    ok(!(await banner(p)), 'not asked again after a reload');
    ok(pageViews(await layer(p)).length === 1, 'and measured from the first page of the new load');

    console.log('\n── changing your mind: the footer');
    // What the real gtag.js would have written, plus another site's _ga (the
    // Unica site, once this one is a subdomain of it).
    await p.evaluate(() => {
      document.cookie = 'kh_ga=GA1.1.123.456; path=/';
      document.cookie = 'kh_ga_TEST12345=GS1.1.789; path=/';
      document.cookie = '_ga=GA1.1.999.888; path=/';
    });
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await btn(p, 'הגדרות עוגיות').click();
    ok(await p.getByRole('dialog', { name: 'העדפות עוגיות ופרטיות' }).isVisible(), 'the footer opens the preferences');
    ok(await p.getByRole('checkbox', { name: 'מדידת שימוש' }).isChecked(), 'showing the yes that was given');
    await btn(p, 'דחיית הכל').click();
    await p.waitForTimeout(500);
    ok((await consent(p))?.analytics === false, 'the no is stored');
    const ck = await cookies(p);
    ok(!ck.some(n => n.startsWith('kh_ga')), 'our GA cookies are deleted', ck.join(','));
    ok(ck.includes('_ga'), 'another site\'s _ga is left alone', ck.join(','));
    ok(await p.evaluate(id => window['ga-disable-' + id], GA_ID) === true, 'Google\'s off switch is set');
    const l2 = await layer(p);
    ok(l2.some(a => a[0] === 'consent' && a[1] === 'update' && a[2].analytics_storage === 'denied'), 'and gtag is told: analytics denied');
    const n2 = l2.length;
    await p.evaluate(() => { history.pushState({}, '', '/help'); dispatchEvent(new PopStateEvent('popstate')); });
    await p.waitForTimeout(800);
    ok((await layer(p)).length === n2, 'nothing more goes in after the no', JSON.stringify((await layer(p)).slice(n2)));

    console.log('\n── and yes again, on the same page');
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));   // /help has the footer too
    await btn(p, 'הגדרות עוגיות').click();
    await btn(p, 'אישור הכל').click();
    await p.evaluate(() => { history.pushState({}, '', '/pricing'); dispatchEvent(new PopStateEvent('popstate')); });
    await p.waitForTimeout(800);
    ok((await layer(p)).length === n2, 'nothing is sent in the same visit — the old id may still be in memory');
    await go(p, '/home');
    ok(pageViews(await layer(p)).length === 1, 'and the next load measures again');
    ok(errs.length === 0, 'no page errors', errs.join(' | '));
    await ctx.close();
  }

  console.log('\n── סירוב');
  {
    const { ctx, p, errs, google } = await computer({ width: 1280, height: 860, touch: false });
    await go(p, '/home');
    await btn(p, 'סירוב').click();
    await p.waitForTimeout(400);
    ok(!(await banner(p)), 'the question goes away');
    ok((await consent(p))?.analytics === false, 'stored as a no');
    await go(p, '/pricing');
    await go(p, '/home');
    ok(!(await banner(p)), 'not asked again');
    ok(google.length === 0 && await layer(p) === null, 'nothing requested from Google, nothing held', `${google.length} requests`);
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
    const { ctx, p, google } = await computer();
    await go(p, path);
    const asked = !!(await banner(p));
    ok(!asked && google.length === 0 && await layer(p) === null, `${path.split('/')[1]}: not asked, not measured`, `${asked ? 'asked ' : ''}${google.length} requests`);
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

  console.log('\n── a guest who goes on to our home page and says yes there');
  {
    const { ctx, p } = await computer();
    await go(p, '/rsvp/GUESTTOKEN123');
    ok(!(await banner(p)), 'not asked on the RSVP page');
    // Client-side, as the RSVP page's own link does: the same JS, the same memory.
    await p.evaluate(() => { history.pushState({}, '', '/home'); dispatchEvent(new PopStateEvent('popstate')); });
    await p.waitForTimeout(1200);
    await btn(p, 'אישור').click();
    await p.waitForTimeout(600);
    const l = JSON.stringify(await layer(p));
    ok(pageViews(await layer(p)).length > 0 && !/rsvp/i.test(l), 'the RSVP page is not sent after the yes', JSON.stringify(pageViews(await layer(p))));
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
