// The Stripe webhook's refund branch, RUN — in the pinned Deno, against a
// stub of Supabase's REST API, with a correctly signed event (29.9 second
// review, סב17). Until this, the webhook had only ever been type-checked.
//
// The defect: when the lookup of the purchase row FAILED, the handler read it
// as "no purchase row", answered 200, and Stripe never retried — a refunded
// customer kept the paid plan for good.
//
// Needs qa/edgeBundle.mjs to have run once (it installs Deno and caches the
// npm packages this uses).
//   node qa/stripeWebhookRefund.mjs
import { spawn } from 'child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { join } from 'path';
import http from 'http';
import crypto from 'crypto';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const CACHE = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
  'revaya-edge-bundler', '@netlify+edge-bundler@16.1.1_deno@2.9.6');
const DENO = join(CACHE, 'node_modules/.bin/deno');
if (!existsSync(DENO)) { console.log('run node qa/edgeBundle.mjs first — it installs the pinned Deno'); process.exit(2); }

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

// ── Supabase REST stub: one knob, what the purchase lookup answers ──────────
const db = { lookup: 'row', calls: [] };
const supa = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    db.calls.push(`${req.method} ${decodeURIComponent(req.url)}`);
    if (req.method === 'GET' && req.url.startsWith('/rest/v1/subscriptions')) {
      if (db.lookup === 'error') { res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"message":"db down"}'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(db.lookup === 'row' ? { is_manually_managed: false } : null));
    }
    if (req.method === 'PATCH' && req.url.startsWith('/rest/v1/subscriptions')) { res.writeHead(204); return res.end(); }
    res.writeHead(404); res.end('{}');
  });
});
await new Promise(r => supa.listen(4801, '127.0.0.1', r));

// ── The function, on a copy with esm.sh → npm: (as qa/edgeBundle.mjs does) ──
const DIR = mkdtempSync(join(tmpdir(), 'webhook-'));
cpSync(join(ROOT, 'supabase/functions'), DIR, { recursive: true });
for (const f of readdirSync(DIR, { recursive: true }).filter(f => /\.(ts|js)$/.test(f))) {
  const p = join(DIR, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/"https:\/\/esm\.sh\/((?:@[^/"]+\/)?[^@/"]+@[^/"]+)"/g, '"npm:$1"'));
}
const SECRET = 'whsec_qa_only';
const fn = spawn(DENO, ['run', '--allow-net', '--allow-env', '--allow-read', '--no-config', join(DIR, 'stripe-webhook/index.ts')], {
  env: { ...process.env, DENO_DIR: join(CACHE, 'deno-dir'), DENO_SERVE_ADDRESS: 'tcp:127.0.0.1:4802',
         STRIPE_SECRET_KEY: 'sk_test_qa', STRIPE_WEBHOOK_SECRET: SECRET,
         SUPABASE_URL: 'http://127.0.0.1:4801', SUPABASE_SERVICE_ROLE_KEY: 'qa',
         ...(existsSync('/root/.ccr/ca-bundle.crt') ? { DENO_CERT: '/root/.ccr/ca-bundle.crt' } : {}) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
fn.stdout.on('data', d => { log += d; });
fn.stderr.on('data', d => { log += d; });
const FN = 'http://127.0.0.1:4802';
for (let i = 0; i < 60; i++) {
  try { await fetch(FN, { method: 'POST' }); break; } catch { await new Promise(r => setTimeout(r, 500)); }
}

const send = async (event) => {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex');
  const r = await fetch(FN, { method: 'POST', body: payload, headers: { 'stripe-signature': `t=${t},v1=${v1}`, 'content-type': 'application/json' } });
  return r.status;
};
const refund = { id: 'evt_qa', object: 'event', type: 'charge.refunded',
  data: { object: { id: 'ch_qa', object: 'charge', payment_intent: 'pi_qa', amount: 69000, amount_refunded: 69000 } } };

try {
  console.log('── a full refund, purchase row found');
  db.lookup = 'row'; db.calls = [];
  let s = await send(refund);
  ok(s === 200, 'answered 200', `status ${s}`);
  ok(db.calls.some(c => c.startsWith('PATCH /rest/v1/subscriptions') && c.includes('pi_qa')), 'the purchase was revoked', db.calls.join(' · '));

  console.log('\n── a full refund while the database read fails');
  db.lookup = 'error'; db.calls = [];
  s = await send(refund);
  ok(s === 500, 'answered 500, so Stripe retries', `status ${s}`);
  ok(!db.calls.some(c => c.startsWith('PATCH')), 'nothing was written');

  console.log('\n── a forged signature');
  const r = await fetch(FN, { method: 'POST', body: JSON.stringify(refund), headers: { 'stripe-signature': 't=1,v1=00' } });
  ok(r.status === 400, 'refused', `status ${r.status}`);
} finally {
  fn.kill();
  supa.close();
  rmSync(DIR, { recursive: true, force: true });
}
if (fails) console.log('\n--- function log ---\n' + log.slice(-2000));
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
