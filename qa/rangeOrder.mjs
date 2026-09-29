// A number range reads as written: "3-6" paints 3 on the LEFT of 6 (29.9
// second review, סב27). With an en-dash the pair is split by a neutral and,
// in an RTL line, painted "6–3" — measured on /services/rsvp ("3–6 חודשים
// לפני") and /pricing ("ציון 0–100" → 100–0). messageSequence.js explains
// the bidi rule and fixed the app; the marketing pages had kept the en-dash.
//
// Every "<digits><dash><digits>" in the page's text, measured with Range rects.
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
        for (const m of n.data.matchAll(/(\d+)\s?[-–]\s?(\d+)(?![\d/])/g)) {
          if (!n.parentElement?.getClientRects().length) continue;
          const r = document.createRange();
          const a = m.index, b = m.index + m[0].length - m[2].length;
          r.setStart(n, a); r.setEnd(n, a + m[1].length); const ra = r.getBoundingClientRect();
          r.setStart(n, b); r.setEnd(n, b + m[2].length); const rb = r.getBoundingClientRect();
          if (!ra.width || !rb.width || Math.abs(ra.top - rb.top) > 4) continue;   // hidden, or wrapped
          out.push({ text: m[0], firstLeft: ra.left < rb.left });
        }
      }
      return out;
    });
    const bad = pairs.filter(x => !x.firstLeft).map(x => x.text);
    ok(bad.length === 0, `${path}: ${pairs.length} ranges, each paints in the order written`, bad.join(', '));
  }
} finally {
  await browser.close();
  await server.stop();
  rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
