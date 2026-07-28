import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');
const phase = process.argv[2] || 'before';
// Writes inside the repo (gitignored) rather than a session scratchpad. The
// old path was a /tmp directory belonging to the session that wrote this
// script; every session since has been silently screenshotting into a folder
// that no longer exists on disk and that nobody could open.
const DIR = new URL('./shots/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });
const routes = [['home','/'],['pricing','/pricing'],['login','/login'],['signup','/signup'],['help','/help'],['terms','/terms'],['privacy','/privacy'],['accessibility','/accessibility']];
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-proxy-server'] });
const results = [];
for (const [w,h] of [[1280,900],[390,844]]) {
  const ctx = await browser.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:1 });
  const page = await ctx.newPage();
  for (const [name, path] of routes) {
    await page.goto('http://127.0.0.1:5188'+path, { waitUntil:'networkidle', timeout:30000 }).catch(e=>console.log('ERR',path,e.message));
    await page.waitForTimeout(700);
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(()=>{ window.scrollTo(9999,0); const x=window.scrollX; window.scrollTo(0,0); return x; });
    results.push({phase,w,name,overflowX:overflow});
    await page.screenshot({ path:`${DIR}/${phase}-${name}-${w}.png`, fullPage:true });
  }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(results,null,0).replace(/},/g,'},\n'));
