import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});
const seed={id:'ev1',name:'חתונת נועה וטל',type:'חתונה',date:'2026-09-01',coupleType:'bride-groom',
  guests:[{id:'g1',name:'משפחת כהן היקרים',side:'bride',group:'משפחה קרובה',count:4,rsvp:'confirmed',meal:'regular',giftAmount:1000,estGift:2000,companions:['דוד','רותי']},{id:'g2',name:'משפחת לוי',side:'groom',group:'חברים',count:2,rsvp:'confirmed',meal:'kosher-mehadrin',estGift:800},{id:'g3',name:'יוסי',side:'bride',group:'עבודה',count:1,rsvp:'declined'}],
  tables:[{id:'t1',name:'שולחן 1',capacity:12,type:'round'}],seating:{g1:'t1'},constraints:[],tokens:{rsvp:'tok',collab:'tok',invite:'tok'},costs:{categories:[{id:'venue',name:'אולם',budget:'25000',actual:'24000'}]}};
await ctx.addInitScript((ev)=>{localStorage.setItem('kochav_hashulchan_v1',JSON.stringify({events:[ev],activeId:'ev1'}));localStorage.setItem('sb-qamockref-auth-token',JSON.stringify({access_token:'x',token_type:'bearer',refresh_token:'x',expires_at:9999999999,user:{id:'u1',email:'n@e.com',aud:'authenticated',role:'authenticated'}}));},seed);
await ctx.route(/qamockref\.supabase\.co/,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'}));
const p=await ctx.newPage();
const routes=['events/ev1/setup','events/ev1/tables','events/ev1/guests','events/ev1/constraints','events/ev1/seating','events/ev1/costs','events/ev1/rsvps','events/ev1/collab','events/ev1/site','events/ev1/checkin','app'];
const bad=[];
for(const r of routes){
  try{ await p.goto('http://localhost:4183/'+r,{waitUntil:'commit',timeout:8000}); }catch(e){}
  await p.waitForSelector('h1,h2',{timeout:8000}).catch(()=>{});
  await p.waitForTimeout(500);
  const info=await p.evaluate(()=>{const de=document.documentElement;const over=de.scrollWidth-de.clientWidth;let w=null;if(over>0){const vw=de.clientWidth;for(const el of document.querySelectorAll('*')){const rc=el.getBoundingClientRect();if(rc.right>vw+1&&rc.width>0){const cls=el.className&&el.className.baseVal!==undefined?el.className.baseVal:String(el.className);if(!w||rc.width>w.w)w={cls:cls.slice(0,30),w:Math.round(rc.width),txt:(el.textContent||'').replace(/\s+/g,'').slice(0,24)};}}}return{over,w};});
  console.log(r, info.over>0?('OVERFLOW '+JSON.stringify(info.w)):'ok');
  if(info.over>0) bad.push({r,...info});
}
import('fs').then(fs=>fs.writeFileSync('/tmp/claude-0/-home-user-kochav-hashulchan-app/b9163c96-99ea-5b5f-ad62-05c8598215b8/scratchpad/audit-res.txt', bad.length===0?'ALL CLEAN':JSON.stringify(bad)));
await b.close();
