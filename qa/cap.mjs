import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');
const BASE='http://127.0.0.1:5188';
const SEED = () => {
  const g=(id,n,side,grp,c,r='confirmed')=>({id,name:n,side,group:grp,count:c,rsvp:r,phone:'050'+Math.floor(1e7*Math.random())});
  const ev = { id:'e1', name:'החתונה של דנה ויוסי', type:'חתונה', date:'2027-06-12',
    brideName:'דנה', groomName:'יוסי', venue:'אולמי הגן, רחובות',
    guests:[g('g1','משפחת שוורץ','bride','משפחה',4),g('g2','רון ואורלי לוי','groom','חברים',2),
            g('g3','מיכל אבני','bride','עבודה',1),g('g4','דני מזרחי','groom','חברים',2),
            g('g5','סבתא רחל','bride','משפחה',1),g('g6','משפחת כהן','groom','משפחה',5),
            g('g7','נועה ברק','bride','חברים',2),g('g8','איתי שלו','groom','עבודה',1),
            g('g9','טל ורד','bride','חברים',2),g('g10','משפחת פרץ','groom','משפחה',3)],
    tables:[{id:'t1',name:'שולחן 1',capacity:10,type:'regular',shape:'round'},
            {id:'t2',name:'שולחן 2',capacity:10,type:'regular',shape:'round'},
            {id:'t3',name:'שולחן VIP',capacity:8,type:'vip',shape:'round'},
            {id:'t4',name:'שולחן 4',capacity:10,type:'regular',shape:'round'}],
    seating:{g1:'t1',g5:'t1',g3:'t1',g2:'t2',g4:'t2',g9:'t2',g6:'t3',g10:'t3',g7:'t4',g8:'t4'},
    constraints:[{id:'c1',type:'together',guestA:'g1',guestB:'g5'}],
    tasks:[], vendors:[],
    tokens:{rsvp:'r1',invite:'i1',gift:'gi1',hostess:'h1',collab:'c1',album:'al1'},
    createdAt:Date.now(), updatedAt:Date.now() };
  localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({events:[ev],activeEventId:'e1'}));
};
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-proxy-server'] });
const p = await b.newPage({ viewport:{width:1340,height:900}, deviceScaleFactor:2 });
await p.goto(BASE+'/app',{waitUntil:'domcontentloaded'}); await p.evaluate(SEED);
require('fs').mkdirSync('caps',{recursive:true});
for (const [route,name,clip] of [
  ['/events/e1/seating','seating',   {x:170,y:110,width:1000,height:600}],
  ['/events/e1/guests','guests',     {x:170,y:110,width:1000,height:600}],
  ['/app','dashboard',               {x:10,y:70,width:1180,height:560}],
  ['/events/e1/checkin','checkin',   {x:0,y:0,width:1340,height:620}],
]) {
  await p.goto(BASE+route,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(1600);
  await p.screenshot({ path:`caps/${name}.png`, clip });
  console.log('captured', name);
}
await b.close();
