// A full pass over every host-facing screen at two viewports, capturing a
// screenshot of each and recording anything measurable that is wrong:
// horizontal overflow, tap targets under 44px, console errors, and elements
// whose text is clipped. The screenshots are for looking at afterwards; the
// numbers below are what makes a finding a finding.
//
// Overflow is measured by scrolling, never by scrollWidth — an internally
// scrollable child inflates scrollWidth on every ancestor and sent an
// afternoon into "fixing" CSS that was already correct.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5188';
const OUT = process.env.SHOT_DIR || '/tmp/claude-0/-home-user-kochav-hashulchan-app/94fef7cd-f944-597e-9253-a6fe3d65a52a/scratchpad/audit/shots';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile',  width: 390,  height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

// Every host-facing screen, with the event seeded so each has real content.
const SCREENS = [
  ['home',        '/app'],
  ['setup',       '/events/e1/setup'],
  ['tables',      '/events/e1/tables'],
  ['guests',      '/events/e1/guests'],
  ['constraints', '/events/e1/constraints'],
  ['seating',     '/events/e1/seating'],
  ['site',        '/events/e1/site'],
  ['share',       '/events/e1/share'],
  ['rsvps',       '/events/e1/rsvps'],
  ['collab',      '/events/e1/collab'],
  ['costs',       '/events/e1/costs'],
  ['tasks',       '/events/e1/tasks'],
  ['announce',    '/events/e1/announce'],
  ['vendors',     '/events/e1/vendors'],
  ['messages',    '/events/e1/messages'],
  ['nametags',    '/events/e1/nametags'],
  ['entrance',    '/events/e1/entrance'],
  ['landing',     '/'],
  ['pricing',     '/pricing'],
  ['start',       '/start'],
];

const EVENT = {
  id: 'e1', name: 'החתונה של דנה ויוסי', type: 'חתונה', date: '2027-06-01',
  brideName: 'דנה', groomName: 'יוסי', venue: 'אולמי הגן הקסום', startTime: '19:00',
  coupleType: 'bride-groom', parentsType: 'mother-father', noShowPct: 10,
  guests: [
    { id:'g1', name:'טל שוורץ', side:'bride', group:'משפחה', count:4, phone:'0501234567', rsvp:'confirmed', companions:['רונית','עומר','שיר'] },
    { id:'g2', name:'רון לוי', side:'groom', group:'חברים', count:1, phone:'0521234567', rsvp:'pending' },
    { id:'g3', name:'שרה כהן', side:'bride', group:'חברים מהעבודה', count:3, phone:'', rsvp:'declined' },
    { id:'g4', name:'דני מזרחי', side:'groom', group:'חברים', count:2, phone:'0541234567', rsvp:'confirmed', companions:['מאיה'] },
    { id:'g5', name:'מיכל אבני', side:'bride', group:'משפחה', count:4, phone:'0531111111', rsvp:'confirmed', companions:['אבי','נועה','יעל'] },
    { id:'g6', name:'משפחת אברהם הגדולה מאוד', side:'groom', group:'משפחה רחוקה', count:8, phone:'0509999999', rsvp:'confirmed' },
  ],
  tables: [
    { id:'t1', name:'שולחן הורי הכלה', capacity:12, type:'regular', shape:'round' },
    { id:'t2', name:'שולחן 2', capacity:10, type:'regular', shape:'round' },
    { id:'t3', name:'שולחן ילדים', capacity:8, type:'kids', shape:'round' },
  ],
  seating: { g1:'t1', g4:'t2', g5:'t1' },
  constraints: [{ id:'c1', type:'together', guestA:'g1', guestB:'g5' },
                { id:'c2', type:'apart',    guestA:'g2', guestB:'g3' }],
  tasks: [{ id:'k1', title:'לסגור עם הצלם', done:false, offset:30 }],
  vendors: [{ id:'v1', name:'צלם', category:'צילום', phone:'0501111111', price:8000 }],
  costs: { catering: 45000, photography: 8000 },
  tokens: { rsvp:'r1', album:'al1', invite:'i1', gift:'gi1', hostess:'h1', collab:'c1' },
  cloudId: null, createdAt: Date.now(), updatedAt: Date.now(),
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});

const findings = [];
const record = (f) => { findings.push(f); console.log(
  `${f.severity}  ${f.viewport.padEnd(7)} ${f.screen.padEnd(12)} ${f.kind.padEnd(14)} ${f.detail}`); };

for (const vp of VIEWPORTS) {
  const page = await b.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 180)));
  page.on('console', m => {
    if (m.type() === 'error' && !/favicon|net::|Failed to load resource|manifest/i.test(m.text()))
      errs.push(m.text().slice(0, 180));
  });
  page.on('dialog', d => d.accept());

  await page.goto(BASE + '/app', { waitUntil: 'domcontentloaded' });
  await page.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
    JSON.stringify({ events: [e], activeEventId: 'e1' })), EVENT);

  for (const [name, path] of SCREENS) {
    errs.length = 0;
    try {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);
    } catch (e) {
      record({ severity:'FAIL', viewport:vp.name, screen:name, kind:'navigation', detail:String(e).slice(0,120) });
      continue;
    }

    await page.screenshot({ path: `${OUT}/${vp.name}-${name}.png`, fullPage: true });

    // ── horizontal overflow: scroll and see if it actually moved ──
    const scrolled = await page.evaluate(() => {
      window.scrollTo(9999, 0); const x = window.scrollX; window.scrollTo(0, 0); return x;
    });
    if (scrolled > 0)
      record({ severity:'FAIL', viewport:vp.name, screen:name, kind:'h-overflow', detail:`scrollX=${scrolled}px` });

    // ── tap targets: only things a finger must hit ──
    const small = await page.evaluate(() => {
      const out = [];
      const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [tabindex="0"]';
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < 44 || r.height < 44) {
          const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 34);
          out.push(`${Math.round(r.width)}x${Math.round(r.height)} "${label}"`);
        }
      }
      return out;
    });
    // Only mobile matters for finger targets.
    if (vp.name === 'mobile' && small.length)
      record({ severity:'WARN', viewport:vp.name, screen:name, kind:'tap-target',
               detail:`${small.length} under 44px: ${small.slice(0,6).join(' | ')}` });

    // ── text clipped by its own box ──
    const clipped = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('h1,h2,h3,p,span,button,label,td,th,li')) {
        if (el.children.length) continue;
        const cs = getComputedStyle(el);
        if (cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis') continue;
        if (el.scrollHeight > el.clientHeight + 2 && cs.overflowY === 'hidden' && el.clientHeight > 0) {
          out.push((el.textContent || '').trim().slice(0, 30));
        }
      }
      return out;
    });
    if (clipped.length)
      record({ severity:'WARN', viewport:vp.name, screen:name, kind:'clipped-text',
               detail:`${clipped.length}: ${clipped.slice(0,4).join(' | ')}` });

    // ── tiny type ──
    const tiny = await page.evaluate(() => {
      const out = new Set();
      for (const el of document.querySelectorAll('*')) {
        if (!el.textContent || !el.textContent.trim() || el.children.length) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px && px < 12) out.add(`${px}px "${el.textContent.trim().slice(0,24)}"`);
      }
      return [...out];
    });
    if (tiny.length)
      record({ severity:'WARN', viewport:vp.name, screen:name, kind:'tiny-type',
               detail:`${tiny.length}: ${tiny.slice(0,4).join(' | ')}` });

    if (errs.length)
      record({ severity:'FAIL', viewport:vp.name, screen:name, kind:'console-error', detail:errs.slice(0,3).join(' ~ ') });
  }
  await page.close();
}

await b.close();
writeFileSync(`${OUT}/../walkthrough.json`, JSON.stringify(findings, null, 2));
const fails = findings.filter(f => f.severity === 'FAIL');
console.log(`\n${findings.length} findings (${fails.length} FAIL, ${findings.length - fails.length} WARN)`);
console.log(`screenshots: ${OUT}`);
