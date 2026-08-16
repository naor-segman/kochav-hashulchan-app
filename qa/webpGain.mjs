// How much smaller is WebP than JPEG, through THIS app's compressor?
//
// The question is money and it is page weight: every gallery photo a guest
// loads is billed egress and is a second on their mobile data. "WebP is about
// 30% smaller" is a claim from an encoder benchmark, not from this pipeline —
// and this pipeline downscales first and encodes at q≈0.7, which is exactly
// the regime where the two formats are closest OR furthest apart depending on
// the image. So it gets measured on real photographs, at the real settings,
// in the real browser, and the number that comes out is the number used.
//
// Runs the identical canvas path the app uses — same maxPx, same quality, same
// toBlob — changing only the mime type.
import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

// SPLIT ON PURPOSE, and the split is the finding.
//
// The first run of this harness averaged all five files together and reported
// "35% smaller". That number is wrong for the decision it was going to be used
// for, because three of the five are UI SCREENSHOTS — flat fills, hard edges,
// rendered text — and WebP beats JPEG by 50–64% on those. Guests upload
// PHOTOGRAPHS. On the two actual photographs the win is 27–29%, and that is the
// only figure that describes what a real gallery costs.
//
// The screenshots stay in the run rather than being quietly dropped: they are
// what the landing page serves, so their number is separately useful, and
// keeping both visible is what stops the average from being restated as the
// headline again.
const PHOTOGRAPHS = ['public/hero/hero.jpg', 'public/hero/hero-portrait.jpg'];
const SCREENSHOTS = ['public/shots/guests.jpg', 'public/shots/seating.jpg', 'public/shots/checkin.jpg'];
const PHOTOS = [...PHOTOGRAPHS, ...SCREENSHOTS];

// The three call sites, with the arguments the app actually passes.
const SETTINGS = [
  { label: 'gallery',    maxPx: 1000, quality: 0.70 },
  { label: 'cover',      maxPx: 1200, quality: 0.72 },
  { label: 'invitation', maxPx: 1400, quality: 0.82 },
];

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server'],
});
const p = await b.newPage();
await p.goto('about:blank');

// Does this browser even encode WebP from a canvas? toBlob silently falls back
// to PNG when the mime type is unsupported, which would look like a catastrophic
// size REGRESSION rather than an unsupported feature — so it is checked first
// and named, not inferred from the numbers.
const webpSupported = await p.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.7));
  return blob?.type === 'image/webp';
});
console.log(`canvas WebP encoding supported: ${webpSupported}\n`);

const rows = [];
for (const file of PHOTOS) {
  const b64 = readFileSync(file).toString('base64');
  const out = await p.evaluate(async ({ b64, SETTINGS }) => {
    const res = await fetch('data:image/jpeg;base64,' + b64);
    const src = await res.blob();
    const img = new Image();
    const url = URL.createObjectURL(src);
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });

    const encode = (maxPx, quality, mime) => {
      let { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return new Promise(r => c.toBlob(b => r({ size: b?.size ?? 0, type: b?.type }), mime, quality));
    };

    const per = [];
    for (const s of SETTINGS) {
      const jpg  = await encode(s.maxPx, s.quality, 'image/jpeg');
      const webp = await encode(s.maxPx, s.quality, 'image/webp');
      per.push({ label: s.label, jpg: jpg.size, webp: webp.size, webpType: webp.type });
    }
    URL.revokeObjectURL(url);
    return { natural: [img.naturalWidth, img.naturalHeight], per };
  }, { b64, SETTINGS });

  const kind = PHOTOGRAPHS.includes(file) ? 'photo' : 'screenshot';
  console.log(`${file}  (${out.natural[0]}×${out.natural[1]})  [${kind}]`);
  for (const r of out.per) {
    r.kind = kind;
    const pct = ((1 - r.webp / r.jpg) * 100);
    console.log(
      `  ${r.label.padEnd(11)} jpeg ${String(Math.round(r.jpg / 1024)).padStart(4)}KB   ` +
      `webp ${String(Math.round(r.webp / 1024)).padStart(4)}KB   ` +
      `${pct >= 0 ? '−' : '+'}${Math.abs(pct).toFixed(0)}%   [${r.webpType}]`
    );
    rows.push(r);
  }
  console.log('');
}

const saving = (rs) => {
  const jpg = rs.reduce((a, r) => a + r.jpg, 0);
  const webp = rs.reduce((a, r) => a + r.webp, 0);
  return jpg ? (1 - webp / jpg) * 100 : 0;
};

for (const kind of ['photo', 'screenshot']) {
  const of = rows.filter(r => r.kind === kind);
  console.log(`── ${kind === 'photo' ? 'PHOTOGRAPHS — what guests upload' : 'screenshots — the landing page only'}`);
  for (const label of ['gallery', 'cover', 'invitation']) {
    const rs = of.filter(r => r.label === label);
    console.log(`  ${label.padEnd(11)} ${saving(rs).toFixed(1)}% smaller`);
  }
  console.log(`  ${'all'.padEnd(11)} ${saving(of).toFixed(1)}% smaller\n`);
}

// Deliberately NOT printed as a single blended number. Averaging photographs
// with screenshots produced "35%", which is true of this file list and true of
// nothing a host will ever upload.
console.log(
  `HEADLINE for gallery sizing: ${saving(rows.filter(r => r.kind === 'photo' && r.label === 'gallery')).toFixed(0)}% ` +
  `off every photograph a guest downloads.`
);

await b.close();
