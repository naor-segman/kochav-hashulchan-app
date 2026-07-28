import { createRequire } from 'module';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5188';

// Each option is just a set of token overrides injected at runtime, so these are
// REAL screens of the real app — not mockups.
const OPTIONS = {
  current: {},                                    // teal + coral, as shipped
  pink: {                                         // Isracard palette, as-is
    '--accent':'#EC5E8E', '--accent-bg':'#FCE7EE', '--accent-light':'#FEF3F6',
    '--accent-border':'#F7BBCF', '--accent-dark':'#B02E56', '--accent-rgb':'236,94,142',
    '--cta':'#EC5E8E', '--cta-dark':'#D14476', '--cta-bg':'#FCE7EE', '--cta-rgb':'236,94,142',
    '--bg':'#F2F2F2', '--surface':'#FFFFFF', '--border':'#E2E2E4', '--border2':'#C7C7CB',
    '--text':'#1A1F25', '--text2':'#3A4048', '--muted':'#6B7078', '--text-rgb':'26,31,37',
    '--nav-bg':'#1A1F25', '--nav-bg2':'#262C34', '--nav-text':'#F2F2F2', '--nav-muted':'#9AA0A8',
    '--on-accent':'#FFFFFF',
  },
  gold: {                                         // Option B — marigold, warm neutrals
    '--accent':'#B8801F', '--accent-bg':'#FBF3E2', '--accent-light':'#FDF9F0',
    '--accent-border':'#E6D3A8', '--accent-dark':'#8E6114', '--accent-rgb':'184,128,31',
    '--cta':'#C9550F', '--cta-dark':'#A8440B', '--cta-bg':'#FDEDE4', '--cta-rgb':'201,85,15',
    '--bg':'#F2F1EE', '--surface':'#FFFFFF', '--border':'#E3E0DA', '--border2':'#C6C2BA',
    '--text':'#14181D', '--text2':'#4A5158', '--muted':'#6B7178', '--text-rgb':'20,24,29',
    '--nav-bg':'#1B1A17', '--nav-bg2':'#282621', '--nav-text':'#F5F2EC', '--nav-muted':'#A39C90',
    '--bride':'#7A4A8C', '--groom':'#2F5FA8', '--on-accent':'#FFFFFF',
  },
  tealPlus: {                                     // Option C — same hue, real discipline
    '--accent':'#0B7C93', '--accent-bg':'#E4F2F5', '--accent-light':'#F1F8FA',
    '--accent-border':'#A9DBE6', '--accent-dark':'#075C6D', '--accent-rgb':'11,124,147',
    '--cta':'#D6491F', '--cta-dark':'#B23A16', '--cta-bg':'#FDEBE4', '--cta-rgb':'214,73,31',
    '--bg':'#FFFFFF', '--surface':'#FFFFFF', '--border':'#E4E6E8', '--border2':'#C4C8CC',
    '--text':'#14181D', '--text2':'#4A5158', '--muted':'#6B7178', '--text-rgb':'20,24,29',
    '--nav-bg':'#14181D', '--nav-bg2':'#22272E', '--nav-text':'#F2F4F5', '--nav-muted':'#98A0A8',
    '--on-accent':'#FFFFFF',
  },
};

const ROUTES = [
  ['/app', 'dashboard'],
  ['/events/e1/seating', 'seating'],
  ['/', 'landing'],
];

const SEED = () => {
  const ev = {
    id:'e1', name:'החתונה של דנה ויוסי', type:'חתונה', date:'2027-06-01',
    brideName:'דנה', groomName:'יוסי', venue:'אולמי הגן',
    guests:[
      {id:'g1',name:'טל שוורץ',side:'bride',group:'משפחה',count:2,rsvp:'confirmed'},
      {id:'g2',name:'רון לוי',side:'groom',group:'חברים',count:1,rsvp:'confirmed'},
      {id:'g3',name:'מיכל אבני',side:'bride',group:'משפחה',count:4,rsvp:'confirmed'},
      {id:'g4',name:'דני מזרחי',side:'groom',group:'עבודה',count:2,rsvp:'pending'},
    ],
    tables:[{id:'t1',name:'שולחן 1',capacity:10,type:'regular',shape:'round'},
            {id:'t2',name:'שולחן 2',capacity:8,type:'vip',shape:'round'}],
    seating:{g1:'t1',g3:'t1',g2:'t2'}, constraints:[], tasks:[], vendors:[],
    tokens:{rsvp:'r1',invite:'i1',gift:'gi1',hostess:'h1',collab:'c1',album:'al1'},
    createdAt:Date.now(), updatedAt:Date.now(),
  };
  localStorage.setItem('kochav_hashulchan_v1', JSON.stringify({events:[ev],activeEventId:'e1'}));
};

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-proxy-server'] });
const dir = '/tmp/claude-0/-home-user-kochav-hashulchan-app/b9163c96-99ea-5b5f-ad62-05c8598215b8/scratchpad/pal';
require('fs').mkdirSync(dir, { recursive: true });

for (const [name, vars] of Object.entries(OPTIONS)) {
  const ctx = await b.newContext({ viewport:{width:1180,height:820}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  if (Object.keys(vars).length) {
    await p.addInitScript(v => {
      const apply = () => { for (const [k,val] of Object.entries(v)) document.documentElement.style.setProperty(k,val); };
      document.addEventListener('DOMContentLoaded', apply);
      apply();
      new MutationObserver(apply).observe(document.documentElement, { attributes:true });
    }, vars);
  }
  await p.goto(BASE + '/app', { waitUntil:'domcontentloaded' });
  await p.evaluate(SEED);
  for (const [route, label] of ROUTES) {
    await p.goto(BASE + route, { waitUntil:'domcontentloaded' });
    await p.waitForTimeout(1300);
    await p.screenshot({ path: `${dir}/${label}-${name}.png` });
  }
  await ctx.close();
  console.log('rendered:', name);
}
await b.close();
