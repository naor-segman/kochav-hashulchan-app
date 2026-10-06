// Regenerates public/og-image.png — the picture WhatsApp and Facebook show for
// every shared link to the site (1200×630).
//
// It said "כוכב השולחן" in teal, a name from before רוויה, until 3.10 (WORKPLAN
// 128). A picture nobody re-renders drifts from the brand silently, so it is
// generated from here: the logo from logoGeometry.js (owner's pick, 6.10), the
// line from company.js, the colours from tokens.css, the self-hosted Open Sans
// so the render does not depend on Google. A light ground — the owner does not
// want all-black backgrounds (5.10).
//   node qa/ogImage.mjs
import { createRequire } from 'module';
import { writeFileSync, mkdtempSync, rmSync, copyFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DESCRIPTOR } from '../src/data/company.js';
import { stackedLogo, toSvgString } from '../src/components/brand/logoGeometry.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const DIR = mkdtempSync(join(tmpdir(), 'og-'));
for (const w of ['600', '700']) copyFileSync(join(ROOT, 'public/fonts', `os-hebrew-${w}.woff2`), join(DIR, `os-${w}.woff2`));
const tokens = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const tok = name => tokens.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))[1];
const C = { ink: tok('text'), detail: tok('text'), paper: tok('surface'), white: tok('surface'), accent: tok('accent'),
  chair1: tok('accent'), chair2: tok('logo-teal'), chair3: tok('logo-yellow'), chair4: tok('logo-orange') };
const logo = toSvgString(stackedLogo(), C, { height: 330 });

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:F;src:url(os-600.woff2);font-weight:600}
@font-face{font-family:F;src:url(os-700.woff2);font-weight:700}
html,body{margin:0;width:1200px;height:630px}
body{background:${C.paper};display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:F;color:${C.ink};
 border-bottom:14px solid ${C.accent};box-sizing:border-box}
p{margin:34px 0 0;font-size:40px;font-weight:700}
</style></head><body>
${logo}
<p>${DESCRIPTOR}</p>
</body></html>`;
writeFileSync(join(DIR, 'og.html'), html);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
try {
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('file://' + join(DIR, 'og.html'));
  await p.evaluate(() => document.fonts.ready);
  const loaded = await p.evaluate(() => document.fonts.check('700 40px F'));
  if (!loaded) throw new Error('Open Sans did not load — the image would fall back to a system font');
  await p.screenshot({ path: join(ROOT, 'public/og-image.png') });
  console.log('public/og-image.png written');
} finally {
  await b.close();
  rmSync(DIR, { recursive: true, force: true });
}
