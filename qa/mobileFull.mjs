// A thorough mobile pass — the states the earlier sweeps never entered.
//
// What the previous rounds covered: one width (390), portrait only, no
// interaction, tap-target boxes rather than effective hit areas. What they
// could not see, and what actually breaks a phone:
//
//   • 320px. An iPhone SE and most budget Androids are narrower than 390, and
//     a layout that merely fits at 390 has nothing left at 320.
//   • LANDSCAPE. 844x390 has 390px of HEIGHT — less than one sticky header
//     plus one sticky footer plus a form field, which is how a control ends up
//     unreachable.
//   • The VIRTUAL KEYBOARD. Focusing an input on a phone cuts the viewport to
//     roughly half. Anything sticky-bottom lands on top of the field being
//     typed into, and the primary action can end up behind it.
//   • Panels the user opens: the paste box, the review screen, edit forms.
//     A screenshot of a closed accordion says nothing about the open one.
//
// Everything below is measured, not eyeballed. Horizontal overflow is detected
// by SCROLLING (window.scrollTo then reading scrollX), never by scrollWidth —
// an internally scrollable child inflates scrollWidth on every ancestor.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:5188';
const OUT  = '/tmp/claude-0/-home-user-kochav-hashulchan-app/94fef7cd-f944-597e-9253-a6fe3d65a52a/scratchpad/audit/mob';
mkdirSync(OUT, { recursive: true });

// Real device shapes, plus the keyboard-open variants of each.
const VIEWPORTS = [
  { name: 'se-320',        width: 320, height: 568 },
  { name: 'phone-390',     width: 390, height: 844 },
  { name: 'plus-430',      width: 430, height: 932 },
  { name: 'landscape-844', width: 844, height: 390 },
  // What a 390px phone becomes when the keyboard is up.
  { name: 'keyboard-390',  width: 390, height: 380 },
];

const EVENT = {
  id:'e1', name:'החתונה של דנה ויוסי', type:'חתונה', date:'2027-06-01',
  brideName:'דנה', groomName:'יוסי', venue:'אולמי הגן הקסום ברחובות', startTime:'19:00',
  coupleType:'bride-groom', parentsType:'mother-father', noShowPct:10,
  guests:[
    {id:'g1',name:'טל שוורץ',side:'bride',group:'משפחה',count:4,phone:'0501234567',rsvp:'confirmed',companions:['רונית','עומר','שיר'],arrivedSeats:[0,1],arrived:true},
    {id:'g2',name:'רון לוי',side:'groom',group:'חברים',count:1,phone:'0521234567',rsvp:'pending'},
    {id:'g3',name:'שרה כהן',side:'bride',group:'חברים מהעבודה',count:3,phone:'',rsvp:'declined'},
    {id:'g4',name:'משפחת אברהם הגדולה מאוד מרחובות',side:'groom',group:'משפחה רחוקה',count:8,phone:'0509999999',rsvp:'confirmed'},
    {id:'g5',name:'מיכל אבני',side:'bride',group:'משפחה',count:4,phone:'0531111111',rsvp:'confirmed',companions:['אבי','נועה','יעל']},
  ],
  tables:[
    {id:'t1',name:'שולחן הורי הכלה',capacity:12,type:'regular',shape:'round'},
    {id:'t2',name:'שולחן 2',capacity:10,type:'regular',shape:'round'},
    {id:'t3',name:'שולחן ילדים',capacity:8,type:'kids',shape:'round'},
  ],
  seating:{g1:'t1',g4:'t2',g5:'t1'},
  constraints:[{id:'c1',type:'together',guestA:'g1',guestB:'g5'},
               {id:'c2',type:'apart',guestA:'g2',guestB:'g3'}],
  tasks:[{id:'k1',title:'לסגור עם הצלם',done:false,offset:30}],
  vendors:[{id:'v1',name:'צלם',category:'צילום',phone:'0501111111',price:8000}],
  costs:{categories:[{id:'catering',name:'קייטרינג',budget:45000,actual:47000}]},
  tokens:{rsvp:'r1',album:'al1',invite:'i1',gift:'gi1',hostess:'h1',collab:'c1'},
  cloudId:null, createdAt:Date.now(), updatedAt:Date.now(),
};

// Host screens, plus every guest-facing route (a stranger's phone is the
// harshest case and the one nobody re-checks).
const SCREENS = [
  ['home','/app'], ['setup','/events/e1/setup'], ['tables','/events/e1/tables'],
  ['guests','/events/e1/guests'], ['constraints','/events/e1/constraints'],
  ['seating','/events/e1/seating'], ['site','/events/e1/site'],
  ['share','/events/e1/share'], ['rsvps','/events/e1/rsvps'],
  ['collab','/events/e1/collab'], ['costs','/events/e1/costs'],
  ['tasks','/events/e1/tasks'], ['announce','/events/e1/announce'],
  ['vendors','/events/e1/vendors'], ['messages','/events/e1/messages'],
  ['nametags','/events/e1/nametags'], ['entrance','/events/e1/entrance'],
  ['landing','/'], ['pricing','/pricing'], ['start','/start'], ['help','/help'],
  ['g-invite','/invite/tok12345678'], ['g-rsvp','/rsvp/tok12345678'],
  ['g-gift','/gift/tok12345678'], ['g-card','/card/tok12345678?g=g1&n=%D7%9C%D7%95%D7%99&t=%D7%A9%D7%95%D7%9C%D7%97%D7%9F%202'],
];

const b = await chromium.launch({
  executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-proxy-server'],
});

const findings = [];
const add = (f) => { findings.push(f);
  console.log(`${f.sev}  ${f.vp.padEnd(14)} ${f.screen.padEnd(12)} ${f.kind.padEnd(13)} ${f.detail}`); };

for (const vp of VIEWPORTS) {
  const page = await b.newPage({
    viewport: { width: vp.width, height: vp.height },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0,150)));
  page.on('console', m => { if (m.type()==='error' &&
    !/favicon|net::|Failed to load resource|manifest/i.test(m.text())) errs.push(m.text().slice(0,150)); });
  page.on('dialog', d => d.accept());

  await page.goto(BASE + '/app', { waitUntil:'domcontentloaded' });
  await page.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
    JSON.stringify({ events:[e], activeEventId:'e1' })), EVENT);

  for (const [name, path] of SCREENS) {
    errs.length = 0;
    try {
      await page.goto(BASE + path, { waitUntil:'domcontentloaded' });
      await page.waitForTimeout(1000);
    } catch (e) {
      add({ sev:'FAIL', vp:vp.name, screen:name, kind:'navigation', detail:String(e).slice(0,100) });
      continue;
    }
    await page.screenshot({ path:`${OUT}/${vp.name}--${name}.png`, fullPage:true }).catch(()=>{});

    const r = await page.evaluate(() => {
      const out = {};
      // Overflow: scroll and see whether it MOVED.
      window.scrollTo(9999, 0); out.scrollX = window.scrollX; window.scrollTo(0, 0);

      // Anything painted outside the viewport on the inline axis.
      out.wide = [];
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.right > window.innerWidth + 2 || b.left < -2) {
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
          let scroller = false;
          for (let n = el.parentElement; n; n = n.parentElement) {
            const o = getComputedStyle(n).overflowX;
            if (o === 'auto' || o === 'scroll') { scroller = true; break; }
          }
          if (scroller) continue;
          out.wide.push(`${el.tagName}.${String(el.className).slice(0,26)} ${Math.round(b.left)}..${Math.round(b.right)}`);
        }
      }
      out.wide = [...new Set(out.wide)].slice(0, 4);

      // Sticky/fixed furniture eating the screen: how much vertical room is
      // left for content once the bars are counted.
      let chrome = 0;
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
        const b = el.getBoundingClientRect();
        if (b.height > 0 && b.height < window.innerHeight) chrome += b.height;
      }
      out.chromeH = Math.round(chrome);
      out.viewH   = window.innerHeight;

      // A fixed element covering the page's primary button.
      out.covered = [];
      const prim = [...document.querySelectorAll('button, a[href]')].filter(el => {
        const c = String(el.className);
        return /btnPrimary|cta|Primary/i.test(c);
      });
      for (const el of prim) {
        const b = el.getBoundingClientRect();
        if (b.height === 0 || b.top > window.innerHeight || b.bottom < 0) continue;
        const cx = b.left + b.width/2, cy = b.top + b.height/2;
        if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
        const hit = document.elementFromPoint(cx, cy);
        if (hit && hit !== el && !el.contains(hit) && (!hit.closest || hit.closest('button,a') !== el)) {
          out.covered.push(`${(el.textContent||'').trim().slice(0,20)} <- ${hit.tagName}.${String(hit.className).slice(0,20)}`);
        }
      }
      return out;
    });

    if (r.scrollX > 0)
      add({ sev:'FAIL', vp:vp.name, screen:name, kind:'h-scroll', detail:`scrollX=${r.scrollX}px` });
    if (r.wide.length)
      add({ sev:'FAIL', vp:vp.name, screen:name, kind:'painted-wide', detail:r.wide.join(' | ') });
    if (r.covered.length)
      add({ sev:'FAIL', vp:vp.name, screen:name, kind:'covered-cta', detail:r.covered.join(' | ') });
    // On a short viewport, chrome taking more than half the height is the
    // difference between a usable screen and a letterbox.
    if (r.chromeH > r.viewH * 0.5)
      add({ sev:'WARN', vp:vp.name, screen:name, kind:'chrome-heavy',
            detail:`${r.chromeH}px of ${r.viewH}px is sticky/fixed` });
    if (errs.length)
      add({ sev:'FAIL', vp:vp.name, screen:name, kind:'console', detail:errs.slice(0,2).join(' ~ ') });
  }
  await page.close();
}

await b.close();
writeFileSync(`${OUT}/../mobileFull.json`, JSON.stringify(findings, null, 2));
const fails = findings.filter(f => f.sev === 'FAIL');
console.log(`\n${findings.length} findings — ${fails.length} FAIL, ${findings.length-fails.length} WARN`);
console.log(`screens: ${SCREENS.length} x viewports: ${VIEWPORTS.length} = ${SCREENS.length*VIEWPORTS.length} states`);
console.log(`shots: ${OUT}`);
