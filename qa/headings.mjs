// Every host screen has one h1, it comes first, and no level is skipped.
// WORKPLAN 108 (browser audit, 28.9).
//
// What the audit found: the sixteen event screens and the door had no h1 at
// all — their title was PageHeader's h2 — and on the event hub the onboarding
// panel's h2 came BEFORE the page's h1 and, at 390px, pushed the event's name
// below the fold. A screen reader's heading list opened on "לא צריך לעשות הכל
// היום" instead of the event.
//
// Local-only build (no Supabase), the event seeded straight into localStorage.
// The guest pages' error states are checked in qa/linkUnreachable.mjs, which
// already drives them.
//
//   node qa/headings.mjs        (builds into a temp dir, serves, cleans up)
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const OUT = mkdtempSync(join(tmpdir(), 'headings-'));

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const EVENT = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01', venue: 'אולמי הגן',
  brideName: 'דנה', groomName: 'יוסי',
  guests: [{ id: 'g1', name: 'טל שוורץ', side: 'bride', group: 'משפחה', count: 2, rsvp: 'confirmed' }],
  tables: [{ id: 't1', name: 'שולחן 1', capacity: 10, type: 'regular', shape: 'round' }],
  seating: { g1: 't1' },
};
// An event with nothing in it, so the screens that show an EmptyState show it —
// its title sits under the page's h1 and must not skip a level.
const EMPTY = { id: 'e2', name: 'אירוע ריק', type: 'חתונה', guests: [], tables: [], seating: {} };

const TABS = ['setup', 'tables', 'guests', 'constraints', 'seating', 'site', 'share', 'rsvps', 'collab',
  'costs', 'tasks', 'announce', 'vendors', 'messages', 'nametags', 'album', 'entrance'];

execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
});
const server = await startPreview(4738, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

// `withHidden`: count visually-hidden headings too (an sr-only h1 is read by a
// screen reader though it has a 1px box); getClientRects() alone keeps it.
const outline = (p, withHidden = false) => p.evaluate((withHidden) => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
  .filter(h => withHidden || h.getClientRects().length > 0)
  .map(h => ({ level: +h.tagName[1], text: h.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), top: h.getBoundingClientRect().top })), withHidden);

function judge(label, hs) {
  const h1s = hs.filter(h => h.level === 1);
  ok(h1s.length === 1, `${label}: exactly one h1`, hs.map(h => `h${h.level} ${h.text}`).join(' · '));
  ok(hs[0]?.level === 1, `${label}: the h1 is the first heading`, hs[0] ? `h${hs[0].level} ${hs[0].text}` : 'none');
  const skip = hs.find((h, i) => i > 0 && h.level > hs[i - 1].level + 1);
  ok(!skip, `${label}: no skipped level`, skip ? `h${skip.level} ${skip.text}` : '');
}

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(server.base + '/app');
  await p.evaluate(evs => localStorage.setItem('kochav_hashulchan_v1',
    JSON.stringify({ events: evs, activeEventId: 'e1' })), [EVENT, EMPTY]);

  console.log('── the event hub, with the onboarding panel open, at 390px');
  await p.goto(server.base + '/events/e1');
  await p.waitForTimeout(700);
  const how = p.getByRole('button', { name: 'איך זה עובד' });
  if (await how.count()) await how.click();
  await p.waitForTimeout(300);
  const hub = await outline(p);
  ok(hub.some(h => h.text.startsWith('לא צריך לעשות הכל היום')), 'the onboarding panel is open');
  judge('hub', hub);
  const name = hub.find(h => h.level === 1);
  ok(name && name.top >= 0 && name.top < 844, "the event's name is above the fold", name ? `top=${Math.round(name.top)}` : '');

  // The dashboard, with the onboarding panel open (29.9 review: it had no h1).
  console.log('\n── the dashboard (/app)');
  await p.goto(server.base + '/app');
  await p.waitForTimeout(600);
  const howApp = p.getByRole('button', { name: 'איך זה עובד' });
  if (await howApp.count()) await howApp.click();
  await p.waitForTimeout(300);
  judge('dashboard', await outline(p, true));

  // The guest-list import review sits under the page's h1 (review: its h3
  // skipped a level once PageHeader became the h1).
  console.log('\n── the guest import review');
  await p.goto(server.base + '/events/e1/guests');
  await p.waitForTimeout(600);
  await p.locator('button[aria-pressed]', { hasText: 'להדביק רשימה' }).click();
  await p.waitForTimeout(300);
  await p.fill('textarea[aria-label="הדביקו כאן את רשימת השמות"]', 'דנה כהן\nיוסי לוי');
  await p.locator('button', { hasText: /לפני ההוספה/ }).last().click();
  await p.waitForTimeout(400);
  const imp = await outline(p);
  ok(imp.some(h => h.text.startsWith('ככה הבנתי')), 'the review is open', imp.map(h => `h${h.level} ${h.text}`).join(' · '));
  judge('guests + import review', imp);

  for (const [id, label] of [['e1', ''], ['e2', ' (empty)']]) {
    console.log(`\n── every event screen${label}`);
    for (const tab of TABS) {
      await p.goto(`${server.base}/events/${id}/${tab}`);
      await p.waitForTimeout(500);
      judge(tab + label, await outline(p));
    }
  }
  ok(errs.length === 0, 'no page error', errs[0] || '');
  await ctx.close();
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
