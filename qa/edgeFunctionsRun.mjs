/* The Supabase functions RUN, not only type-checked (audit 3.10, S4/S5/S6).
 *
 *   node qa/edgeFunctionsRun.mjs        (needs the Deno that qa/edgeBundle.mjs installs)
 *
 * qa/edgeBundle.mjs type-checks the functions; nothing ran them. This runs each
 * handler in a real Deno — on a copy with the esm.sh imports rewritten to the
 * same packages from npm, as edgeBundle does — with every outbound request
 * (Supabase auth and REST, Anthropic, Stripe) answered by a stub inside the
 * process (qa/edgeFunctionsRun.deno.js). No port is opened and nothing leaves
 * the machine. What it proves:
 *
 *   S4  detect-floor-plan validates the key and the body BEFORE it claims one
 *       of the host's AI calls, and says which ceiling was hit.
 *   S5  an exception, a Stripe error, the model's raw output and a signature
 *       failure stay in the log; the caller gets a fixed message.
 *   S6  CORS answers only the app's own origin (APP_ORIGINS).
 */
import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { join } from 'path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const CACHE = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
  'revaya-edge-bundler', '@netlify+edge-bundler@16.1.1_deno@2.9.6');
const DENO = join(CACHE, 'node_modules/.bin/deno');
if (!existsSync(DENO)) { console.error(`no Deno at ${DENO} — run node qa/edgeBundle.mjs once to install it`); process.exit(2); }

const OUT = mkdtempSync(join(tmpdir(), 'edgerun-'));
let fails = 0;
const ok = (c, what, detail = '') => { if (!c) fails++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`); };

function run(fn) {
  const r = spawnSync(DENO, ['run', '-A', '--no-config', join(OUT, 'edgeFunctionsRun.deno.js'), fn], {
    cwd: OUT, encoding: 'utf8', maxBuffer: 1 << 26,
    env: { ...process.env, DENO_DIR: join(CACHE, 'deno-dir'), NO_COLOR: '1',
           ...(existsSync('/root/.ccr/ca-bundle.crt') ? { DENO_CERT: '/root/.ccr/ca-bundle.crt' } : {}) },
  });
  const res = {};
  for (const l of r.stdout.split('\n')) { try { const o = JSON.parse(l); if (o.name) res[o.name] = o; } catch { /* a log line */ } }
  if (!Object.keys(res).length) console.log((r.stdout + r.stderr).split('\n').slice(-15).join('\n'));
  return { res, log: r.stderr };
}
const claimed = (s) => (s?.calls ?? []).some(c => c.includes('claim_ai_call'));
const note = (s) => { try { return JSON.parse(s.body).note ?? ''; } catch { return ''; } };

try {
  cpSync(join(ROOT, 'supabase/functions'), OUT, { recursive: true });
  for (const f of readdirSync(OUT, { recursive: true }).filter(f => /\.(ts|js)$/.test(f))) {
    const p = join(OUT, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/"https:\/\/esm\.sh\/((?:@[^/"]+\/)?[^@/"]+@[^/"]+)"/g, '"npm:$1"'));
  }
  cpSync(join(ROOT, 'qa/edgeFunctionsRun.deno.js'), join(OUT, 'edgeFunctionsRun.deno.js'));

  console.log('── detect-floor-plan');
  const { res: d } = run('detect-floor-plan');
  ok(d['no-key']?.status === 503 && !claimed(d['no-key']), 'no API key: 503 and no AI call claimed', JSON.stringify(d['no-key']?.calls));
  for (const [n, st] of [['bad-json', 400], ['no-fields', 400], ['too-large', 413], ['bad-mime', 400]]) {
    ok(d[n]?.status === st && !claimed(d[n]), `${n}: ${st} and no AI call claimed`, `${d[n]?.status} ${JSON.stringify(d[n]?.calls)}`);
  }
  ok(d.ok?.status === 200 && claimed(d.ok) && d.ok.calls.indexOf(d.ok.calls.find(c => c.includes('claim'))) < d.ok.calls.findIndex(c => c.includes('anthropic')),
     'a valid request claims, then calls the model', JSON.stringify(d.ok?.calls));
  ok(d['user-limit']?.status === 429 && /בעוד שעה/.test(note(d['user-limit'])), 'the host\'s own limit: 429 "נסו שוב בעוד שעה"', note(d['user-limit']));
  ok(d['global-limit']?.status === 429 && /עמוס היום/.test(note(d['global-limit'])), 'the global daily limit: 429 "עמוס היום"', note(d['global-limit']));
  // S5 — the stub plants SECRET-DETAIL-… in every upstream answer and error.
  for (const [n, st] of [['model-garbage', 502], ['model-down', 502], ['throws', 500]]) {
    ok(d[n]?.status === st && !d[n].leaked && /[֐-׿]/.test(note(d[n])),
       `${n}: ${st}, a Hebrew note, and nothing of the upstream answer`, d[n]?.body?.slice(0, 120));
  }

  // S6 — CORS answers the app's origin only.
  const APP = 'https://plan.unica-events.co.il';
  const corsOk = (res, fn) => {
    ok(res['options-app']?.status < 300 && res['options-app'].acao === APP && res['options-app'].vary === 'Origin',
       `${fn}: the preflight from the app gets its own origin back`, `${res['options-app']?.status} ${res['options-app']?.acao}`);
    ok(res['options-evil'] && res['options-evil'].acao === null, `${fn}: another site's preflight gets no Allow-Origin`, String(res['options-evil']?.acao));
  };
  corsOk(d, 'detect-floor-plan');
  ok(d['post-evil']?.acao === null && d.ok?.acao === APP, 'detect-floor-plan: a POST from another site carries no Allow-Origin; the app\'s does',
     `${d['post-evil']?.acao} / ${d.ok?.acao}`);

  console.log('\n── create-checkout-session');
  const { res: c } = run('create-checkout-session');
  corsOk(c, 'create-checkout-session');
  for (const n of ['stripe-error', 'stripe-throws']) {
    ok(c[n]?.status === 500 && !c[n].leaked, `${n}: 500 without Stripe's words`, c[n]?.body?.slice(0, 120));
  }
  ok(c['stripe-error']?.calls?.some(k => k.includes('stripe.com')), '(the Stripe call really was made and failed)', JSON.stringify(c['stripe-error']?.calls?.slice(-1)));

  console.log('\n── create-billing-portal');
  const { res: p } = run('create-billing-portal');
  corsOk(p, 'create-billing-portal');
  ok(p['stripe-error']?.status === 500 && !p['stripe-error'].leaked, 'stripe-error: 500 without Stripe\'s words', p['stripe-error']?.body?.slice(0, 120));
  ok(p['stripe-error']?.calls?.some(k => k.includes('stripe.com')), '(the Stripe call really was made and failed)');

  console.log('\n── stripe-webhook');
  const { res: w } = run('stripe-webhook');
  ok(w['bad-signature']?.status === 400 && w['bad-signature'].body === 'Webhook signature verification failed',
     'a forged signature: 400 and a fixed sentence, not Stripe\'s reason', w['bad-signature']?.body?.slice(0, 120));
} finally {
  rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
