/* Hero contrast over the REAL footage.
 *
 * The scrim was tuned against a bright placeholder. Now there is actual video
 * behind it — a sunset beach, which is the brightest thing a hero can carry:
 * a pale sky, white drapery, white chairs. So every text colour is measured
 * against the pixels actually behind each line, sampled from several frames,
 * and the worst frame is the one that counts.
 *
 * Sampling is done on the composited page (video + scrim), not on the video
 * file, because the scrim is the whole point.
 */
import { createRequire } from 'module';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { outDir } from './lib/outDir.mjs';
const require = createRequire('/home/user/kochav-hashulchan-app/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5188';
const WIDTHS = [[1280, 'desktop'], [390, 'mobile']];

const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const parse = (css) => css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server', '--autoplay-policy=no-user-gesture-required'],
});

// Frames pulled from the encoded file with ffmpeg — see the loop below.
// HERO_FRAMES_DIR points at frames already extracted; otherwise they are
// extracted here, which needs ffmpeg (Playwright's Chromium cannot decode the
// mp4 — see below). The folder used to be one session's scratchpad, hardcoded,
// so every other session found it missing (audit 3.10, H3).
const VIDEO = new URL('../public/hero/hero.mp4', import.meta.url).pathname;
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
let FRAME_DIR = process.env.HERO_FRAMES_DIR;
if (!FRAME_DIR && hasFfmpeg) {
  FRAME_DIR = outDir('heroFrames');
  const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', VIDEO],
    { encoding: 'utf8' }).stdout) || 10;
  // Six moments across the clip, the last one near the end where it is brightest.
  for (const t of [0, 0.2, 0.4, 0.6, 0.8, 0.95].map(f => Math.floor(f * dur))) {
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', VIDEO, '-frames:v', '1', join(FRAME_DIR, `hf${t}.jpg`)]);
  }
}
if (!FRAME_DIR || !existsSync(FRAME_DIR)) {
  console.error(
    `heroContrast needs frames of ${VIDEO} and has none: ffmpeg is ${hasFfmpeg ? 'installed' : 'NOT installed'}` +
    `${FRAME_DIR ? ` and ${FRAME_DIR} does not exist` : ''}.\n` +
    'Install ffmpeg, or extract them elsewhere and point HERO_FRAMES_DIR at the folder:\n' +
    '  ffmpeg -ss <seconds> -i public/hero/hero.mp4 -frames:v 1 <dir>/hf<seconds>.jpg   (several moments)\n' +
    'No frames means no measurement — this exits 1 rather than print a pass.');
  await b.close();
  process.exit(1);
}
const FRAMES = readdirSync(FRAME_DIR)
  .filter(f => /^hf\d+\.jpg$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  .map(f => [Number(f.match(/\d+/)[0]),
             'data:image/jpeg;base64,' + readFileSync(`${FRAME_DIR}/${f}`).toString('base64')]);

// The scratchpad is not permanent. When the frames are gone the frame loop
// simply never runs, nothing is logged, and `worst` prints its starting value
// as if every frame had passed — a silent pass with zero measurements, which is
// the third time this file has produced one. Refuse to run instead.
if (FRAMES.length === 0) {
  console.error(process.env.HERO_FRAMES_DIR
    ? `HERO_FRAMES_DIR=${FRAME_DIR} has no hf<seconds>.jpg files — extract them with ffmpeg (command above in this file).`
    : `ffmpeg ran but wrote no frames of ${VIDEO} into ${FRAME_DIR} — run the extraction by hand to see why.`);
  await b.close();
  process.exit(1);
}

let worst = 99;
for (const [w, label] of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);

  // Which elements to check, and the colour each one paints its text in.
  const targets = await p.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return null;
      return { sel, color: getComputedStyle(el).color, box: { x: r.x, y: r.y, w: r.width, h: r.height } };
    };
    return ['[class*=heroHeadline]', '[class*=heroGold]', '[class*=heroSub]',
            '[class*=heroBadge]', '[class*=heroNote]', '[class*=heroQuietLink]']
      .map(pick).filter(Boolean);
  });

  // Several moments, because the footage brightens toward the end.
  //
  // The frames are swapped in as images rather than seeking the <video>.
  // Playwright's Chromium is built without proprietary codecs, so hero.mp4
  // reports MEDIA_ERR_SRC_NOT_SUPPORTED here and every "frame" would have been
  // the poster — five identical readings that look like a pass. Real browsers
  // play it; this harness cannot, so it composites the frames itself and the
  // scrim still does its work for real.
  for (const [t, frame] of FRAMES) {
    await p.evaluate((dataUrl) => {
      const media = document.querySelector('[class*=heroMedia]');
      if (!media) return;
      const old = media.querySelector('video, img');
      const img = document.createElement('img');
      img.className = old ? old.className : '';
      img.src = dataUrl;
      if (old) old.replaceWith(img); else media.prepend(img);
    }, frame);
    await p.waitForTimeout(500);

    // Hide the hero copy before capturing. Sampling the composited page with
    // the text still on it finds the GLYPHS as the lightest pixels and reports
    // white-on-white, 1.00:1 — which is the measurement being wrong, not the
    // design. The ground is what is behind the text, so the text comes off.
    await p.evaluate(() => {
      document.querySelectorAll('[class*=heroInner] *, [class*=heroInner]')
        .forEach(el => { el.style.visibility = 'hidden'; });
    });
    await p.waitForTimeout(120);
    const shot = await p.screenshot({ type: 'png' });
    await p.evaluate(() => {
      document.querySelectorAll('[class*=heroInner] *, [class*=heroInner]')
        .forEach(el => { el.style.visibility = ''; });
    });

    const res = await p.evaluate(async ({ targets, dataUrl }) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = dataUrl; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      const ctx2 = c.getContext('2d');
      return targets.map(({ sel, color, box }) => {
        // Sample a grid inside the text box and keep the LIGHTEST pixel — the
        // hardest ground the text has to sit on.
        let best = null, bestL = -1;
        for (let i = 1; i <= 6; i++) {
          for (let j = 1; j <= 3; j++) {
            const x = Math.round(box.x + (box.w * i) / 7);
            const y = Math.round(box.y + (box.h * j) / 4);
            if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
            const d = ctx2.getImageData(x, y, 1, 1).data;
            const L = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
            if (L > bestL) { bestL = L; best = [d[0], d[1], d[2]]; }
          }
        }
        return { sel, color, ground: best };
      });
    }, { targets, dataUrl: 'data:image/png;base64,' + shot.toString('base64') });

    for (const r of res) {
      if (!r.ground) continue;
      const cr = ratio(parse(r.color), r.ground);
      worst = Math.min(worst, cr);
      const flag = cr < 4.5 ? (cr < 3 ? '✗✗' : '✗ ') : '✓ ';
      console.log(`${flag} ${label} t=${t}s  ${r.sel.padEnd(26)} ${cr.toFixed(2)}:1  (ground rgb ${r.ground.join(',')})`);
    }
  }
  await ctx.close();
}
console.log(`\nהערך הגרוע ביותר בכל הפריימים ובשתי הרזולוציות: ${worst.toFixed(2)}:1`);
await b.close();
