// Regenerates every static picture of the logo from ONE source,
// src/components/brand/logoGeometry.js (owner's pick, 6.10 — direction B2):
//   public/favicon.svg            the table, on a white tile (browser tab)
//   public/apple-touch-icon.png   180 — iPhone home screen
//   public/pwa-192x192.png        192 — Android / installed app
//   public/pwa-512x512.png        512
//   public/pwa-maskable-512.png   512, the table inside the 80% safe zone
// Colours are read from tokens.css, so a palette change is one re-run away.
//   node qa/brandAssets.mjs
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { markLogo, toSvgString } from '../src/components/brand/logoGeometry.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const tokens = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const tok = name => {
  const m = tokens.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`token --${name} not found in tokens.css`);
  return m[1];
};
const COLOURS = {
  ink: tok('text'), detail: tok('text'), paper: tok('surface'), white: tok('surface'),
  accent: tok('accent'), chair1: tok('accent'), chair2: tok('logo-teal'), chair3: tok('logo-yellow'), chair4: tok('logo-orange'),
};

// A tile: the mark scaled into `inner` (fraction of the side) on a white square.
function tile(inner, { rounded }) {
  const mark = toSvgString(markLogo(), COLOURS);
  const body = mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const s = 160 / inner; // the mark's viewBox is 160 wide
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-s / 2} ${-s / 2} ${s} ${s}">`
    + `<rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" ${rounded ? `rx="${s * 0.1875}"` : ''} fill="${COLOURS.paper}"/>`
    + body + '</svg>';
}

writeFileSync(join(ROOT, 'public/favicon.svg'), tile(0.92, { rounded: true }) + '\n');
console.log('public/favicon.svg written');

const { chromium } = createRequire(ROOT + '/')('playwright');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
try {
  const p = await b.newPage();
  for (const [file, size, inner] of [
    ['apple-touch-icon.png', 180, 0.84],      // iOS rounds the corners itself
    ['pwa-192x192.png', 192, 0.86],
    ['pwa-512x512.png', 512, 0.86],
    ['pwa-maskable-512.png', 512, 0.64],      // the mask may crop to a circle of 80%
  ]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0">${tile(inner, { rounded: false }).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: join(ROOT, 'public', file), clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`public/${file} written`);
  }
} finally {
  await b.close();
}
