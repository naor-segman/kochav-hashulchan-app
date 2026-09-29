// Netlify's own edge-function bundler, run locally. WORKPLAN מ.
//
// THE GAP. Netlify bundles every top-level file in netlify/edge-functions/ with
// Deno, and that stage never ran here: a test file dropped into that directory
// (`import ... from "vitest"`, a bare specifier Deno cannot resolve) killed
// every deploy of the branch for eleven days while `npm run build`, the whole
// test suite and eslint were green. netlify/tests/edgeFunctionsDir.test.js
// blocks that one SHAPE; a syntax error only Deno sees, or an import of a file
// that is not there, still went through.
//
// WHAT THIS RUNS. `bundle()` from @netlify/edge-bundler — the same package
// Netlify's build uses — over the same directory, with a real Deno. Both come
// from the npm registry (the only route out of this environment that works:
// dl.deno.land and github.com are refused by the proxy), pinned, and installed
// into a cache OUTSIDE the repo, so package.json and every Netlify deploy's
// install are untouched.
//
// Observed failing (on a copy of the directory) for each of:
//   • invite-og.test.js importing "vitest"            — the eleven-day shape
//   • a stray brace in invite-og.js                   — a parse error
//   • a function importing a file that does not exist
//
// WHAT IT DOES NOT COVER. The bundler also loads each function's in-source
// `config` export, and that step fetches https://edge.netlify.com, which the
// proxy refuses — so it logs "Could not load configuration" here and carries
// on. A mistake in a `config` export (none of ours has one; routes are in
// netlify.toml) is not caught. Supabase functions are not bundled either: they
// import from esm.sh, also refused. qa/edgeFunctions.mjs parses those.
//
//   node qa/edgeBundle.mjs
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DIR  = process.argv[2] || join(ROOT, 'netlify/edge-functions');

const PINS = { '@netlify/edge-bundler': '16.1.1', deno: '2.9.6' };
const CACHE = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
  'revaya-edge-bundler', Object.entries(PINS).map(([k, v]) => `${k.replace('/', '+')}@${v}`).join('_'));

if (!existsSync(join(CACHE, 'node_modules/@netlify/edge-bundler'))) {
  console.log(`installing ${Object.entries(PINS).map(([k, v]) => `${k}@${v}`).join(' ')} into ${CACHE}`);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(join(CACHE, 'package.json'), '{"private":true}');
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error',
    ...Object.entries(PINS).map(([k, v]) => `${k}@${v}`)], { cwd: CACHE, stdio: 'inherit' });
}

// The bundler uses the `deno` on PATH when it satisfies its range, and only
// downloads one (which would fail here) when it does not.
process.env.PATH = join(CACHE, 'node_modules/.bin') + ':' + process.env.PATH;
const { bundle } = await import(createRequire(join(CACHE, '/')).resolve('@netlify/edge-bundler'));

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

const OUT = mkdtempSync(join(tmpdir(), 'edgebundle-'));
try {
  const expected = readdirSync(DIR, { withFileTypes: true })
    .filter(d => d.isFile() && /\.(m?js|ts|tsx|jsx)$/.test(d.name))
    .map(d => d.name.replace(/\.[^.]+$/, '')).sort();

  let result, err;
  try {
    result = await bundle([DIR], OUT, [], { cacheDirectory: join(OUT, 'cache') });
  } catch (e) { err = e; }
  const reason = err && String(err.message || err).replace(/\x1b\[[0-9;]*m/g, '').split('\n')
    .find(l => /error|could not|unexpected/i.test(l)) || '';
  ok(!err, 'Netlify\'s bundler builds netlify/edge-functions', reason.slice(0, 300));

  if (result) {
    const got = result.functions.map(f => f.name).sort();
    ok(JSON.stringify(got) === JSON.stringify(expected), 'every top-level file became a function',
      `bundled ${got.join(', ')}`);
    ok(result.manifest.bundles.length > 0, 'a bundle was written', result.manifest.bundles.map(b => b.format).join(', '));

    // Every route netlify.toml declares points at a function that bundled.
    const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
    const declared = [...toml.matchAll(/\[\[edge_functions\]\][^[]*?function\s*=\s*"([^"]+)"/g)].map(m => m[1]);
    const missing = [...new Set(declared)].filter(n => !got.includes(n));
    ok(declared.length > 0 && missing.length === 0, 'every netlify.toml route has its function',
      missing.length ? `missing: ${missing.join(', ')}` : `${declared.length} routes`);
  }
} finally {
  rmSync(OUT, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
