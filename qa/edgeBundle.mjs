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
// AND THE SUPABASE FUNCTIONS — the billing path. With a real Deno here they
// can be TYPE-CHECKED for the first time: `deno check` against the exact
// package versions they pin, with each `https://esm.sh/<pkg>@<v>` import mapped
// to `npm:<pkg>@<v>` (esm.sh is refused; the registry is not, and esm.sh
// serves that same npm package's types). A Stripe field that does not exist,
// or a `mode` Stripe does not accept, fails here instead of at deploy. Observed
// failing on `mode: "paymnt"` in create-checkout-session and on a misspelled
// field of the webhook's session object.
//
// WHAT IT DOES NOT COVER. The bundler also loads each function's in-source
// `config` export, and that step fetches https://edge.netlify.com, which the
// proxy refuses — so it logs "Could not load configuration" here and carries
// on. A mistake in a `config` export (none of ours has one; routes are in
// netlify.toml) is not caught. The Supabase functions are checked, not run:
// that is types, not Stripe's behaviour.
//
//   node qa/edgeBundle.mjs
import { execFileSync, spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
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

  // ── Supabase functions: deno check against the pinned packages ────────────
  // On a COPY whose esm.sh import strings are rewritten to npm: — nothing else
  // changes. Not an import map: through one, Stripe's types (an ambient
  // `declare module 'stripe'`) do not attach and the whole client is `any`,
  // which is how the first version of this check passed a misspelled field.
  const FN  = join(ROOT, 'supabase/functions');
  const CPY = join(OUT, 'functions');
  cpSync(FN, CPY, { recursive: true });
  const pkgs = new Set();
  for (const f of readdirSync(CPY, { recursive: true }).filter(f => /\.(ts|js)$/.test(f))) {
    const path = join(CPY, f);
    writeFileSync(path, readFileSync(path, 'utf8')
      .replace(/"https:\/\/esm\.sh\/((?:@[^/"]+\/)?[^@/"]+@[^/"]+)"/g, (_, spec) => { pkgs.add('npm:' + spec); return `"npm:${spec}"`; })
      // The code asks Stripe for API version 2024-06-20; stripe@14's types only
      // know 2023-10-16. That VALUE is cast on the copy — and only it. Until
      // 29.9 the resulting diagnostic was accepted by name instead, and
      // TypeScript stops at the first bad property, so a typo elsewhere in the
      // same config (maxNetworkRetriez) passed unseen (review 29.9).
      .replace(/apiVersion:\s*"2024-06-20"/g, 'apiVersion: "2024-06-20" as any'));
  }
  const entries = readdirSync(CPY, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(CPY, d.name, 'index.ts')))
    .map(d => join(CPY, d.name, 'index.ts'));
  const r = spawnSync('deno', ['check', '--quiet', '--no-config', ...entries], {
    cwd: CPY, encoding: 'utf8',
    env: { ...process.env, DENO_DIR: join(CACHE, 'deno-dir'),
           ...(existsSync('/root/.ccr/ca-bundle.crt') ? { DENO_CERT: '/root/.ccr/ca-bundle.crt' } : {}) },
  });
  const out = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '');
  const diags = [...out.matchAll(/(TS\d+) \[ERROR\]: ([^\n]*)[\s\S]*?at file:\/\/[^\n]*?\/functions\/([^\n]+)/g)]
    .map(m => ({ code: m[1], msg: m[2].trim(), at: m[3].trim() }));
  const real = diags;
  const broken = r.status !== 0 && diags.length === 0;   // failed without a type error: could not run at all
  ok(entries.length > 0, 'the Supabase functions were found', `${entries.length}`);
  ok(!broken && real.length === 0,
     `the ${entries.length} Supabase functions type-check against ${[...pkgs].join(', ')}`,
     broken ? out.split('\n').filter(l => /error/i.test(l)).slice(0, 3).join(' | ').slice(0, 300)
            : real.map(d => `${d.code} ${d.msg} @ ${d.at}`).join(' | ').slice(0, 500));


  // ── The OG function RUN in Deno against the built shell ──────────────────
  if (existsSync(join(ROOT, 'dist/index.html'))) {
    const og = spawnSync('deno', ['run', '--allow-read', join(ROOT, 'qa/inviteOg.deno.js')], { encoding: 'utf8' });
    const lines = (og.stdout + og.stderr).replace(/\x1b\[[0-9;]*m/g, '').split('\n');
    ok(og.status === 0, 'invite-og runs in Deno against dist/index.html (qa/inviteOg.deno.js)',
      lines.filter(l => /^\s*FAIL|^error/.test(l)).slice(0, 3).join(' | '));
  } else {
    ok(false, 'invite-og in Deno needs a build — run `npm run build` first');
  }
} finally {
  rmSync(OUT, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
