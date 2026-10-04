// Regenerates public/og-image.png — the picture WhatsApp and Facebook show for
// every shared link to the site (1200×630).
//
// It said "כוכב השולחן" in teal, a name from before רוויה, until 3.10 (WORKPLAN
// 128). A picture nobody re-renders drifts from the brand silently, so it is
// generated from here: the name from company.js, the colours from tokens.css
// (--text as the ground, --accent for the mark, --accent-on-dark for the line),
// the self-hosted Frank Ruhl Libre so the render does not depend on Google.
//   node qa/ogImage.mjs
import { createRequire } from 'module';
import { writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { COMPANY, DESCRIPTOR } from '../src/data/company.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const DIR = mkdtempSync(join(tmpdir(), 'og-'));
for (const w of ['500', '900']) copyFileSync(join(ROOT, 'public/fonts', `frl-${w}.woff2`), join(DIR, `frl-${w}.woff2`));

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:F;src:url(frl-500.woff2);font-weight:500}
@font-face{font-family:F;src:url(frl-900.woff2);font-weight:900}
html,body{margin:0;width:1200px;height:630px}
body{background:radial-gradient(ellipse 60% 70% at 50% 38%, rgba(232,67,123,.22), rgba(232,67,123,0) 70%), #14161A;
 display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:F;color:#fff}
.mark{font-size:84px;color:#E8437B;line-height:1;margin-bottom:26px;text-shadow:0 0 40px rgba(232,67,123,.55)}
h1{margin:0;font-weight:900;font-size:112px;letter-spacing:.5px;line-height:1.05;direction:ltr}
p{margin:22px 0 0;font-size:38px;font-weight:500;color:#D9DBE0}
.pill{margin-top:40px;padding:12px 30px;border:1.5px solid rgba(250,159,192,.45);border-radius:999px;font-size:27px;color:#FA9FC0;font-weight:500}
</style></head><body>
<div class="mark">✦</div>
<h1>${COMPANY.name}</h1>
<p>${DESCRIPTOR}</p>
<div class="pill">אורחים · הושבה אוטומטית · אישורי הגעה · אתר לאירוע</div>
</body></html>`;
writeFileSync(join(DIR, 'og.html'), html);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
try {
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('file://' + join(DIR, 'og.html'));
  await p.evaluate(() => document.fonts.ready);
  const loaded = await p.evaluate(() => document.fonts.check('900 112px F') && document.fonts.check('500 38px F'));
  if (!loaded) throw new Error('Frank Ruhl Libre did not load — the image would fall back to a system font');
  await p.screenshot({ path: join(ROOT, 'public/og-image.png') });
  console.log('public/og-image.png written');
} finally {
  await b.close();
  rmSync(DIR, { recursive: true, force: true });
}
