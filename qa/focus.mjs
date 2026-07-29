import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-proxy-server'] });
const p = await b.newPage({ viewport:{width:1280,height:900} });
await p.addInitScript(() => {
  const g=(id,n,side,grp,c,r='confirmed')=>({id,name:n,side,group:grp,count:c,rsvp:r,phone:'0501234567'});
  localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({events:[{
    id:'e1',name:'החתונה',type:'חתונה',date:'2027-06-01',venue:'אולם',
    guests:[g('g1','טל','bride','משפחה',2),g('g2','רון','groom','חברים',1)],
    tables:[{id:'t1',name:'שולחן 1',capacity:10,type:'regular'}],
    seating:{g1:'t1'},constraints:[],tasks:[],vendors:[],
    tokens:{rsvp:'r1',invite:'i1',gift:'gi1',hostess:'h1',collab:'c1',album:'al1'},
    createdAt:Date.now(),updatedAt:Date.now()}],activeEventId:'e1'}));
});
// Every route, not four. A focus ring that exists on the seating screen and
// not on the guest form is not a keyboard path — it is a coincidence.
const ROUTES = [
  '/', '/pricing', '/login', '/signup', '/help', '/account', '/app',
  '/events/e1/setup', '/events/e1/tables', '/events/e1/guests',
  '/events/e1/constraints', '/events/e1/seating', '/events/e1/rsvps',
  '/events/e1/collab', '/events/e1/site', '/events/e1/costs',
  '/events/e1/tasks', '/events/e1/announce', '/events/e1/vendors',
  '/events/e1/messages', '/events/e1/nametags', '/events/e1/checkin',
  '/rsvp/r1', '/invite/i1', '/gift/gi1', '/card/i1',
];
for (const route of ROUTES) {
  await p.goto('http://127.0.0.1:5188'+route,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1200);
  const r = await p.evaluate(async () => {
    const out={total:0,browserDefault:0,ours:0,none:0};
    const els=[...document.querySelectorAll('button,a[href],[role=button],summary')]
      .filter(e=>e.offsetParent!==null && !e.disabled);
    for (const el of els.slice(0,40)) {
      el.focus();
      await new Promise(r=>setTimeout(r,20));
      const cs=getComputedStyle(el);
      const o=cs.outlineStyle+' '+cs.outlineWidth+' '+cs.outlineColor;
      out.total++;
      if (cs.outlineStyle==='none' && !cs.boxShadow.includes('rgb')) out.none++;
      else if (cs.outlineStyle==='auto') out.browserDefault++;
      else out.ours++;
    }
    return out;
  });
  console.log(`  ${route.padEnd(24)} focusable=${r.total}  ours=${r.ours}  browser-default=${r.browserDefault}  none=${r.none}`);
}
await b.close();
