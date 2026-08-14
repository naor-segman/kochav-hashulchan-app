// Which tap targets are ACTUALLY too small for a finger, deduplicated across
// screens and identified precisely enough to fix.
//
// The naive sweep over-reports badly:
//   - it counts the same header/nav controls once per screen
//   - it flags wrapper <a> elements whose box is collapsed around an inline
//     child, where the real hit area is the child
//   - it flags controls inside a horizontally scrolling strip, where a short
//     width is the design, not a defect
// So this one records a CSS-path per element, groups by that path, and reports
// each distinct control once with the worst box seen.
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5188';
const SCREENS = [
  ['home','/app'], ['setup','/events/e1/setup'], ['tables','/events/e1/tables'],
  ['guests','/events/e1/guests'], ['constraints','/events/e1/constraints'],
  ['seating','/events/e1/seating'], ['site','/events/e1/site'],
  ['share','/events/e1/share'], ['rsvps','/events/e1/rsvps'],
  ['collab','/events/e1/collab'], ['costs','/events/e1/costs'],
  ['tasks','/events/e1/tasks'], ['announce','/events/e1/announce'],
  ['vendors','/events/e1/vendors'], ['messages','/events/e1/messages'],
  ['nametags','/events/e1/nametags'], ['entrance','/events/e1/entrance'],
  ['landing','/'], ['pricing','/pricing'], ['start','/start'],
];

const EVENT = {
  id:'e1', name:'החתונה של דנה ויוסי', type:'חתונה', date:'2027-06-01',
  brideName:'דנה', groomName:'יוסי', venue:'אולמי הגן הקסום', startTime:'19:00',
  coupleType:'bride-groom', parentsType:'mother-father', noShowPct:10,
  guests:[
    {id:'g1',name:'טל שוורץ',side:'bride',group:'משפחה',count:4,phone:'0501234567',rsvp:'confirmed',companions:['רונית','עומר','שיר']},
    {id:'g2',name:'רון לוי',side:'groom',group:'חברים',count:1,phone:'0521234567',rsvp:'pending'},
    {id:'g3',name:'שרה כהן',side:'bride',group:'חברים מהעבודה',count:3,phone:'',rsvp:'declined'},
  ],
  tables:[{id:'t1',name:'שולחן הורי הכלה',capacity:12,type:'regular',shape:'round'},
          {id:'t2',name:'שולחן 2',capacity:10,type:'regular',shape:'round'}],
  seating:{g1:'t1'}, constraints:[], tasks:[], vendors:[], costs:{},
  tokens:{rsvp:'r1',album:'al1',invite:'i1',gift:'gi1',hostess:'h1',collab:'c1'},
  cloudId:null, createdAt:Date.now(), updatedAt:Date.now(),
};

const b = await chromium.launch({
  executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-proxy-server'],
});
const page = await b.newPage({ viewport:{ width:390, height:844 } });
await page.goto(BASE + '/app', { waitUntil:'domcontentloaded' });
await page.evaluate(e => localStorage.setItem('kochav_hashulchan_v1',
  JSON.stringify({ events:[e], activeEventId:'e1' })), EVENT);

const byPath = new Map();

for (const [name, path] of SCREENS) {
  await page.goto(BASE + path, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1000);
  const rows = await page.evaluate(() => {
    const cssPath = el => {
      const parts = [];
      for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
        const cls = (n.className && typeof n.className === 'string')
          ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        parts.unshift(n.tagName.toLowerCase() + cls);
      }
      return parts.join('>');
    };
    const out = [];
    const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button]';
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display==='none' || cs.visibility==='hidden' || cs.opacity==='0') continue;
      if (r.width===0 || r.height===0) continue;
      if (r.width >= 44 && r.height >= 44) continue;

      // A wrapper whose only child is itself a control: the child is the real
      // target, so the wrapper's small box is not what a finger hits.
      const onlyChildIsControl = el.children.length === 1 &&
        /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.children[0].tagName);
      if (onlyChildIsControl) continue;

      // Inside a horizontally scrolling strip, a narrow item is deliberate;
      // only its HEIGHT is a finger problem.
      let inScroller = false;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const o = getComputedStyle(n).overflowX;
        if (o === 'auto' || o === 'scroll') { inScroller = true; break; }
      }
      const badW = r.width  < 44 && !inScroller;
      const badH = r.height < 44;
      if (!badW && !badH) continue;

      out.push({
        path: cssPath(el),
        w: Math.round(r.width), h: Math.round(r.height),
        label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g,' ').slice(0,40),
        why: [badW?'W':'', badH?'H':''].filter(Boolean).join('+'),
      });
    }
    return out;
  });
  for (const r of rows) {
    const key = r.path + '|' + r.why;
    const prev = byPath.get(key);
    if (!prev) byPath.set(key, { ...r, screens:[name], worst:r.w*r.h });
    else {
      if (!prev.screens.includes(name)) prev.screens.push(name);
      if (r.w*r.h < prev.worst) { prev.w=r.w; prev.h=r.h; prev.worst=r.w*r.h; }
    }
  }
}

await b.close();
const list = [...byPath.values()].sort((a,b) => b.screens.length - a.screens.length || a.worst - b.worst);
console.log(`${list.length} DISTINCT controls under 44px at 390px\n`);
for (const r of list) {
  console.log(`${String(r.w).padStart(4)}x${String(r.h).padStart(3)} ${r.why.padEnd(3)} ${String(r.screens.length).padStart(2)} screens  "${r.label}"`);
  console.log(`            ${r.path}`);
}
writeFileSync('/tmp/claude-0/-home-user-kochav-hashulchan-app/94fef7cd-f944-597e-9253-a6fe3d65a52a/scratchpad/audit/tapTargets.json', JSON.stringify(list,null,2));
