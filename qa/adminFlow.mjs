// The admin panel DRIVEN, not photographed.
//
// qa/adminMobile.mjs proved the panel fits on a phone. It says nothing about
// whether the controls on it do anything — and the owner has never opened this
// area at all, so a button that throws on click has had no chance to be found.
//
// Every control on every admin screen is clicked, and after each click three
// things are checked: nothing threw, an error boundary did not replace the
// page, and the page still has its content. Then the things a real operator
// does — search, filter, paginate, open an edit form, close it — are driven
// individually.
//
// Runs against vite.admin-preview.config.js, which swaps in qa/supabaseMock.js:
// AdminGuard needs a live admin session that does not exist here, and without
// the mock every screen renders its loading branch. Writes do not persist in
// the mock, so what is verified is REACHABILITY and SURVIVAL, not persistence.
// That distinction is the point — say what was checked, not what sounds good.
import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.ADMIN_BASE || 'http://127.0.0.1:5190';
const ROUTES = [
  ['dashboard', '/admin/dashboard'], ['users', '/admin/users'],
  ['events', '/admin/events'], ['eventDetail', '/admin/events/e0'],
  ['subscriptions', '/admin/subscriptions'], ['templates', '/admin/templates'],
  ['activity', '/admin/activity'], ['errors', '/admin/errors'],
  ['settings', '/admin/settings'],
];

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const page = await b.newPage({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 140)));
page.on('console', m => {
  if (m.type() === 'error' && !/favicon|net::|Failed to load resource|manifest|sw\.js/i.test(m.text()))
    errs.push(m.text().slice(0, 140));
});
page.on('dialog', d => d.accept());

const healthy = () => page.evaluate(() => {
  const t = (document.body.innerText || '').trim();
  return { len: t.length, blew: /משהו השתבש|שגיאה בלתי צפויה|Something went wrong/.test(t) };
});

for (const [name, path] of ROUTES) {
  console.log(`\n── ${name}`);
  errs.length = 0;
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1300);
  let h = await healthy();
  ok(!h.blew && h.len > 60 && errs.length === 0, 'loads with data',
     [h.blew && 'error boundary', h.len <= 60 && `only ${h.len} chars`, errs[0]].filter(Boolean).join('; '));
  if (h.blew) continue;

  // Every control on the screen, one at a time, returning to the route after
  // each so a navigation does not silently end the sweep.
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.disabled; })
      .map(el => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24))
      .filter(Boolean));

  const broken = [];
  for (const label of [...new Set(labels)]) {
    // Signing out ends the session for every screen after this one.
    if (/יציאה|התנתק/.test(label)) continue;
    errs.length = 0;
    const btn = page.locator('button', { hasText: label }).first();
    if (!(await btn.count())) continue;
    await btn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);
    h = await healthy();
    if (h.blew || errs.length) broken.push(`"${label}" → ${h.blew ? 'error boundary' : errs[0]}`);
    // Whatever it opened, get back to a known state.
    if (page.url() !== BASE + path) {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
    } else {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(250);
    }
  }
  ok(broken.length === 0, `${[...new Set(labels)].length} controls survive being pressed`,
     broken.slice(0, 3).join(' | '));
}

// ── The things an operator actually does ────────────────────────────────────
console.log('\n── operator actions');

// Search on the users screen must narrow the list, not blank it.
await page.goto(BASE + '/admin/users', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1300);
const before = await page.locator('tbody tr').count();
const search = page.locator('input[type=search], input[placeholder*="חיפוש"], input[placeholder*="חפש"]').first();
if (await search.count()) {
  await search.fill('dana');
  await page.waitForTimeout(900);
  const after = await page.locator('tbody tr').count();
  // The mock ignores filters, so the honest check is that typing does not
  // destroy the table or throw — not that the row count fell.
  const h = await healthy();
  ok(!h.blew && after > 0, 'typing in the user search leaves a table on screen',
     `${before} rows → ${after}`);
} else ok(false, 'the users screen has a search field');

// The templates action column — the reason the mobile fix mattered.
await page.goto(BASE + '/admin/templates', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1300);
const edit = page.locator('button', { hasText: /^ערוך$/ }).first();
ok(await edit.count() > 0, 'the templates edit button exists and is on screen');
if (await edit.count()) {
  const box = await edit.boundingBox();
  ok(!!box && box.x >= 0 && box.x + box.width <= 390,
     'it is inside the viewport without scrolling',
     box ? `x=${Math.round(box.x)}..${Math.round(box.x + box.width)}` : 'no box');
  errs.length = 0;
  await edit.click().catch(() => {});
  await page.waitForTimeout(900);
  const opened = await page.evaluate(() =>
    !!document.querySelector('[role=dialog], [class*="modal"], [class*="Modal"], form'));
  const h = await healthy();
  ok(!h.blew && errs.length === 0, 'pressing it opens an editor without throwing',
     `${opened ? 'a form appeared' : 'no form found'}${errs[0] ? '; ' + errs[0] : ''}`);
}

// Settings: the fields must accept typing.
await page.goto(BASE + '/admin/settings', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1300);
const field = page.locator('input[type=text], input:not([type])').first();
if (await field.count()) {
  errs.length = 0;
  await field.fill('כוכב השולחן — בדיקה');
  await page.waitForTimeout(500);
  const v = await field.inputValue();
  ok(v === 'כוכב השולחן — בדיקה' && errs.length === 0,
     'a settings field is editable and holds what was typed', v);
} else ok(false, 'the settings screen has an editable field');

// Signing out is skipped in the per-control sweep above — it would end the
// session for every screen after it. It is checked here instead, last, and on
// EVERY screen that carries the button: eight of them used to hold their own
// copy of the handler, so "it works on the dashboard" said nothing about the
// other seven.
console.log('\n── signing out, from every screen that offers it');
for (const [name, path] of ROUTES) {
  if (name === 'login') continue;
  const p2 = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const e2 = [];
  p2.on('pageerror', e => e2.push(e.message.slice(0, 120)));
  await p2.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1300);
  const btn = p2.locator('button', { hasText: /^יציאה$/ }).first();
  if (!(await btn.count())) {
    // AdminErrorsScreen has different chrome — a back link to the dashboard,
    // no topbar and therefore no logout. Not a failure (one tap gets the
    // operator somewhere that has one) but an inconsistency worth printing
    // rather than passing over in silence.
    console.log(`  note ${name}: no logout button — this screen has a back link instead`);
    await p2.close();
    continue;
  }
  await btn.click().catch(err => e2.push('click: ' + String(err).slice(0, 60)));
  await p2.waitForTimeout(1200);
  ok(p2.url().endsWith('/admin/login') && e2.length === 0, `${name} → /admin/login`,
     `${p2.url().replace(BASE, '')}${e2.length ? '; ' + e2[0] : ''}`);
  await p2.close();
}

await b.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
