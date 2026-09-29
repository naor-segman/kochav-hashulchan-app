// Number ranges on the marketing pages (29.9 second review, סב27).
// "3–6 חודשים לפני" painted 6–3 and "ציון 0–100" painted 100–0. Whether that
// is wrong depends on a convention this codebase holds two ways (CLAUDE.md
// bug class 7: the first number on the RIGHT; messageSequence.js and the admin
// panel: numbers left-to-right) — the owner's call. So ranges here are written
// "3 עד 6": a Hebrew word anchors the order under either convention.
//
// Two checks, measured with Range rects:
//   - no bare "<digits><dash><digits>" is left on these pages;
//   - every "X עד Y" paints X to the RIGHT of Y — read first, in an RTL line.
//   node qa/rangeOrder.mjs
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startPreview } from './lib/preview.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { chromium } = createRequire(ROOT + '/')('playwright');
const OUT = mkdtempSync(join(tmpdir(), 'rangeorder-'));
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};
execFileSync('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
});
const server = await startPreview(4806, ROOT, ['--outDir', OUT]);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-proxy-server'] });
try {
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const path of ['/services/rsvp', '/pricing', '/help', '/services/gifts', '/']) {
    await p.goto(server.base + path);
    await p.waitForTimeout(700);
    // Open every <details> so collapsed answers are measured too.
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    const pairs = await p.evaluate(() => {
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());) {
        for (const m of n.data.matchAll(/(\d+)%?\s?([-–]|עד)\s?(\d+)(?![\d/])/g)) {
          if (!n.parentElement?.getClientRects().length) continue;
          const r = document.createRange();
          const a = m.index, b = m.index + m[0].length - m[3].length;
          r.setStart(n, a); r.setEnd(n, a + m[1].length); const ra = r.getBoundingClientRect();
          r.setStart(n, b); r.setEnd(n, b + m[3].length); const rb = r.getBoundingClientRect();
          if (!ra.width || !rb.width || Math.abs(ra.top - rb.top) > 4) continue;   // hidden, or wrapped
          out.push({ text: m[0], bare: m[2] !== 'עד', firstRight: ra.left > rb.left });
        }
      }
      return out;
    });
    const bare = pairs.filter(x => x.bare).map(x => x.text);
    ok(bare.length === 0, `${path}: no bare dash between two numbers`, bare.join(', '));
    const bad = pairs.filter(x => !x.bare && !x.firstRight).map(x => x.text);
    ok(bad.length === 0, `${path}: ${pairs.length - bare.length} "X עד Y" ranges, X read first`, bad.join(', '));
  }
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
