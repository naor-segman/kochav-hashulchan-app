// What every visitor downloads first — the entry chunk (audit 3.10, H6).
//
// Builds THIS checkout with a stub Supabase env (so the signed-in code paths
// are compiled in, as in production) into a temp dir, finds the entry script
// from index.html, and checks that the host's screens did not slide back into
// it: a guest opening an RSVP link should not download the dashboard, the
// account screen or the guided tour's copy. Measured 3.10: 772.9 KB / 228.2 KB
// gzip before the host screens went lazy, 605.5 / 181.1 after.
//   node qa/entryChunk.mjs              build and measure
//   DIST=<dir> node qa/entryChunk.mjs   measure an existing build
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { gzipSync } from 'zlib';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const BUDGET_KB = 650;   // raw; 605.5 measured — a screen's worth of headroom, not a screen
let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

let dist = process.env.DIST, tmp = null;
if (!dist) {
  tmp = mkdtempSync(join(tmpdir(), 'entry-'));
  dist = tmp;
  execFileSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: ROOT, stdio: 'inherit',
    env: { ...process.env, VITE_SUPABASE_URL: 'https://stub.supabase.co', VITE_SUPABASE_ANON_KEY: 'stub' },
  });
}
try {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const entry = html.match(/<script type="module"[^>]*src="\/?(assets\/index-[^"]+\.js)"/)?.[1];
  ok(!!entry, 'found the entry script in index.html', entry || 'none');
  const code = readFileSync(join(dist, entry));
  const kb = (n) => Math.round(n / 100) / 10;   // kB = 1000 bytes, as vite prints it
  const raw = kb(code.length), gz = kb(gzipSync(code).length);
  ok(raw <= BUDGET_KB, `entry ≤ ${BUDGET_KB} KB`, `${raw} KB raw, ${gz} KB gzip`);

  const text = code.toString('utf8');
  // Strings that exist only in the host's screens / the tour copy.
  for (const [what, needle] of [
    ['the guided tour copy (data/tours.js)', 'יש לכם תוכנית של האולם'],
    ['the account screen', 'מחיקת נתונים מקומיים מהמכשיר'],
    ['the dashboard', 'שכפלו אירוע'],
  ]) ok(!text.includes(needle), `not in the entry: ${what}`);

  const chunks = readdirSync(join(dist, 'assets')).filter(f => /^(Shell|DashboardScreen|AccountScreen|LoginScreen)-.*\.js$/.test(f));
  ok(chunks.length === 4, 'Shell, dashboard, account and login are chunks of their own', chunks.join(', '));
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
