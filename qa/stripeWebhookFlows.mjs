// The whole Stripe webhook, RUN — every branch that decides whether a host who
// paid gets the product and whether a host who was refunded loses it (third
// review, 29.9).
//
// qa/stripeWebhookRefund.mjs was the first time this function ever executed,
// and it covered one path: the refund lookup. Of twelve destructive edits a
// mutation run made to this file, it catches one ("the refund cancels every
// purchase in the table"); ELEVEN went unnoticed by everything in the repo —
// among them "trust session.metadata.plan whatever it says", "grant the event
// even when it belongs to someone else" and "a ₪100 partial refund revokes the
// ₪690 package". This harness kills all of them but one, whose only effect is
// the wording of a 400 (a missing signature header is refused by Stripe's own
// verification a line later). Eight more edits to branches no run had touched
// — the async event, a 100% promotion code, an unpaid session, a cancelled row
// re-delivered, both write errors — are killed too.
//
// HOW IT RUNS. The real index.ts, in the pinned Deno, on a copy with two
// rewrites and nothing else:
//   1. esm.sh → npm: at the same version (as qa/edgeBundle.mjs does);
//   2. the Stripe client is pointed at a local stub (host/port/protocol are
//      ordinary Stripe config keys). The rewrite must match EXACTLY once — if
//      the constructor changes shape, this refuses to run rather than letting
//      the function talk to api.stripe.com (blocked here anyway) or to nothing.
// Supabase is a stub of PostgREST with a real in-memory table: filters are
// evaluated, an upsert merges on the conflict column, a PATCH touches only the
// rows its filter matches. That last one matters — a stub that answers 204 to
// any PATCH cannot tell "cancel this purchase" from "cancel every purchase".
// Every event is signed with the webhook secret exactly as Stripe signs it, so
// the function's own signature check runs on every case.
//
// Needs qa/edgeBundle.mjs to have run once (it installs Deno and caches the npm
// packages this uses).
//   node qa/stripeWebhookFlows.mjs
// Ports: QA_PORT_BASE (default 7430) .. +2.
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

const BASE = Number(process.env.QA_PORT_BASE || 7430);
const SUPA_PORT = BASE, STRIPE_PORT = BASE + 1, FN_PORT = BASE + 2;
const PRICE_PRO = 'price_qa_pro', PRICE_ENT = 'price_qa_ent';

let fails = 0;
const ok = (c, what, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${what}${detail ? '  — ' + detail : ''}`);
};

// ── PostgREST stub with real rows ───────────────────────────────────────────
// `fail` names a request that answers with a database error instead:
//   'events:GET', 'subscriptions:GET', 'subscriptions:POST', 'subscriptions:PATCH'
let db;
const reset = (over = {}) => {
  db = { events: [], subscriptions: [], fail: new Set(), calls: [], ...over };
};
reset();
const parseVal = (op, raw) => {
  if (op === 'in') return raw.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, ''));
  if (raw === 'null') return null;
  return raw;
};
const matches = (row, filters) => filters.every(([col, op, val]) => {
  const v = row[col] == null ? null : String(row[col]);
  if (op === 'eq') return v === val;
  if (op === 'neq') return v !== val;
  if (op === 'in') return val.includes(v);
  if (op === 'is') return val === null ? v === null : v === val;
  throw new Error(`stub: unsupported operator ${op}`);
});
const supa = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const table = url.pathname.replace('/rest/v1/', '');
    db.calls.push(`${req.method} ${table} ${decodeURIComponent(url.search)}`);
    const json = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    if (!(table in db)) return json(404, { message: `no table ${table}` });
    if (db.fail.has(`${table}:${req.method}`)) return json(500, { code: 'XX000', message: 'db down (stub)' });
    const filters = [];
    for (const [k, raw] of url.searchParams) {
      if (['select', 'on_conflict', 'columns', 'order', 'limit'].includes(k)) continue;
      const dot = raw.indexOf('.');
      const op = raw.slice(0, dot);
      filters.push([k, op, parseVal(op, raw.slice(dot + 1))]);
    }
    const rows = db[table];
    if (req.method === 'GET') return json(200, rows.filter(r => matches(r, filters)).map(r => ({ ...r })));
    if (req.method === 'PATCH') {
      const patch = JSON.parse(body || '{}');
      for (const r of rows) if (matches(r, filters)) Object.assign(r, patch);
      return json(204);
    }
    if (req.method === 'POST') {
      const key = url.searchParams.get('on_conflict');
      for (const incoming of [].concat(JSON.parse(body || '[]'))) {
        const hit = key && rows.find(r => r[key] != null && r[key] === incoming[key]);
        if (hit) Object.assign(hit, incoming); else rows.push({ ...incoming });
      }
      return json(201);
    }
    return json(405, { message: 'stub: method' });
  });
});

// ── Stripe API stub: the two calls the webhook makes ────────────────────────
// lineItems[sessionId] = price id (or 'error'); intents[piId] = { amount, amount_refunded } (or 'error')
const stripeState = { lineItems: {}, intents: {} };
const stripeApi = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const err = () => json(400, { error: { type: 'invalid_request_error', message: 'stub: told to fail' } });
  let m = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)\/line_items$/);
  if (m) {
    const price = stripeState.lineItems[m[1]];
    if (price === 'error') return err();
    return json(200, { object: 'list', has_more: false, url: url.pathname,
      data: price ? [{ id: 'li_qa', object: 'item', price: { id: price, object: 'price' } }] : [] });
  }
  m = url.pathname.match(/^\/v1\/payment_intents\/([^/]+)$/);
  if (m) {
    const ch = stripeState.intents[m[1]];
    if (ch === 'error') return err();
    return json(200, { id: m[1], object: 'payment_intent',
      latest_charge: ch ? { id: 'ch_' + m[1], object: 'charge', ...ch } : null });
  }
  json(404, { error: { type: 'invalid_request_error', message: `stub: no route ${url.pathname}` } });
});

await new Promise(r => supa.listen(SUPA_PORT, '127.0.0.1', r));
await new Promise(r => stripeApi.listen(STRIPE_PORT, '127.0.0.1', r));

// ── The function, on a copy ─────────────────────────────────────────────────
const DIR = mkdtempSync(join(tmpdir(), 'webhook-flows-'));
cpSync(join(ROOT, 'supabase/functions'), DIR, { recursive: true });
for (const f of readdirSync(DIR, { recursive: true }).filter(f => /\.(ts|js)$/.test(f))) {
  const p = join(DIR, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/"https:\/\/esm\.sh\/((?:@[^/"]+\/)?[^@/"]+@[^/"]+)"/g, '"npm:$1"'));
}
const FILE = join(DIR, 'stripe-webhook/index.ts');
const src = readFileSync(FILE, 'utf8');
const ANCHOR = 'apiVersion: "2024-06-20",';
if (src.split(ANCHOR).length !== 2) {
  console.log(`FAIL the Stripe constructor no longer contains exactly one ${ANCHOR} — update this harness's rewrite`);
  process.exit(1);
}
writeFileSync(FILE, src.replace(ANCHOR, () => `${ANCHOR} host: "127.0.0.1", port: ${STRIPE_PORT}, protocol: "http", maxNetworkRetries: 0,`));

const SECRET = 'whsec_qa_flows';
const fn = spawn(DENO, ['run', '--allow-net', '--allow-env', '--allow-read', '--no-config', FILE], {
  env: { ...process.env, DENO_DIR: join(CACHE, 'deno-dir'), DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FN_PORT}`,
         NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
         STRIPE_SECRET_KEY: 'sk_test_qa', STRIPE_WEBHOOK_SECRET: SECRET,
         STRIPE_PRO_PRICE_ID: PRICE_PRO, STRIPE_ENTERPRISE_PRICE_ID: PRICE_ENT,
         SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`, SUPABASE_SERVICE_ROLE_KEY: 'qa',
         ...(existsSync('/root/.ccr/ca-bundle.crt') ? { DENO_CERT: '/root/.ccr/ca-bundle.crt' } : {}) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
fn.stdout.on('data', d => { log += d; });
fn.stderr.on('data', d => { log += d; });
const FN = `http://127.0.0.1:${FN_PORT}`;
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  try { await fetch(FN, { method: 'POST' }); up = true; } catch { await new Promise(r => setTimeout(r, 500)); }
}

const sign = (payload, secret = SECRET) => {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
};
const send = async (event, { secret, header } = {}) => {
  const payload = JSON.stringify(event);
  const headers = { 'content-type': 'application/json' };
  if (header !== null) headers['stripe-signature'] = header ?? sign(payload, secret);
  const r = await fetch(FN, { method: 'POST', body: payload, headers });
  return { status: r.status, text: await r.text() };
};

// ── Fixtures ────────────────────────────────────────────────────────────────
const USER = 'user-a', OTHER = 'user-b', EVENT = 'event-1';
let seq = 0;
const checkout = ({ type = 'checkout.session.completed', session = 'cs_1', pi = 'pi_1', paid = 'paid', meta = {} } = {}) => ({
  id: `evt_${++seq}`, object: 'event', type,
  data: { object: { id: session, object: 'checkout.session', customer: 'cus_qa', payment_status: paid,
    payment_intent: pi, metadata: { user_id: USER, event_id: EVENT, plan: 'pro', ...meta } } },
});
const refund = ({ pi = 'pi_1', amount = 69000, refunded = 69000 } = {}) => ({
  id: `evt_${++seq}`, object: 'event', type: 'charge.refunded',
  data: { object: { id: 'ch_' + pi, object: 'charge', payment_intent: pi, amount, amount_refunded: refunded } },
});
const liveRow = (over = {}) => ({ user_id: USER, event_id: EVENT, plan: 'pro', status: 'active',
  stripe_checkout_session_id: 'cs_1', stripe_payment_intent_id: 'pi_1', is_manually_managed: false, expires_at: null, ...over });
// A clean world: the host owns event-1, the session bought Pro, the charge is not refunded.
const world = () => {
  reset({ events: [{ id: EVENT, user_id: USER }] });
  stripeState.lineItems = { cs_1: PRICE_PRO, cs_2: PRICE_PRO };
  stripeState.intents = { pi_1: { amount: 69000, amount_refunded: 0 }, pi_2: { amount: 69000, amount_refunded: 0 } };
};
const writes = () => db.calls.filter(c => /^(POST|PATCH) subscriptions/.test(c));
const row = (session = 'cs_1') => db.subscriptions.find(r => r.stripe_checkout_session_id === session);

try {
  ok(up, 'the function started in Deno', up ? '' : log.slice(-800));

  // ── signature ─────────────────────────────────────────────────────────────
  console.log('── signature');
  world();
  let r = await send(checkout(), { secret: 'whsec_someone_else' });
  ok(r.status === 400, 'an event signed with another secret is refused', `status ${r.status}`);
  r = await send(checkout(), { header: null });
  ok(r.status === 400, 'an event with no stripe-signature header is refused', `status ${r.status}`);
  ok(writes().length === 0 && db.subscriptions.length === 0, 'neither wrote anything', writes().join(' · '));

  // ── checkout.session.completed: the grant ─────────────────────────────────
  console.log('\n── checkout.session.completed, paid, Pro price, the host\'s own event');
  world();
  r = await send(checkout());
  ok(r.status === 200, 'answered 200', `status ${r.status}`);
  ok(row()?.status === 'active' && row()?.plan === 'pro' && row()?.event_id === EVENT && row()?.expires_at === null,
    'an active Pro row for that event, no expiry', JSON.stringify(row()));
  ok(row()?.stripe_price_id === PRICE_PRO && row()?.stripe_payment_intent_id === 'pi_1', 'price and payment intent recorded');

  console.log('\n── the same delivery replayed');
  r = await send(checkout());
  ok(r.status === 200, 'answered 200 again', `status ${r.status}`);
  ok(db.subscriptions.length === 1 && row()?.status === 'active', 'still exactly one active row', `${db.subscriptions.length} rows`);

  console.log('\n── payment_status "unpaid" (a delayed method, money still in flight)');
  world();
  r = await send(checkout({ paid: 'unpaid' }));
  ok(r.status === 200 && db.subscriptions.length === 0, 'answered 200 and granted nothing', `status ${r.status}, ${db.subscriptions.length} rows`);

  console.log('\n── …then checkout.session.async_payment_succeeded');
  r = await send(checkout({ type: 'checkout.session.async_payment_succeeded' }));
  ok(r.status === 200 && row()?.status === 'active', 'the late money grants the plan', `status ${r.status} ${JSON.stringify(row())}`);

  console.log('\n── payment_status "no_payment_required" (a 100% promotion code)');
  world();
  r = await send(checkout({ paid: 'no_payment_required' }));
  ok(r.status === 200 && row()?.status === 'active', 'granted', JSON.stringify(row()));

  // ── which plan ────────────────────────────────────────────────────────────
  console.log('\n── the price decides the plan, not the metadata');
  world();
  stripeState.lineItems.cs_1 = PRICE_ENT;
  r = await send(checkout({ meta: { plan: 'pro' } }));
  ok(r.status === 200 && row()?.plan === 'enterprise', 'Enterprise price + metadata "pro" → enterprise', JSON.stringify(row()));

  console.log('\n── an unknown price falls back to a metadata plan we recognise');
  world();
  stripeState.lineItems.cs_1 = 'price_not_ours';
  r = await send(checkout({ meta: { plan: 'enterprise' } }));
  ok(r.status === 200 && row()?.plan === 'enterprise', 'metadata "enterprise" → enterprise', JSON.stringify(row()));

  console.log('\n── an unknown price and a metadata plan we do NOT recognise');
  world();
  stripeState.lineItems.cs_1 = 'price_not_ours';
  r = await send(checkout({ meta: { plan: 'platinum' } }));
  ok(r.status === 200, 'answered 200', `status ${r.status}`);
  ok(db.subscriptions.length === 0, 'no row — "platinum" is not a plan', JSON.stringify(db.subscriptions));

  console.log('\n── no price at all (line items unreadable) and no metadata plan');
  world();
  stripeState.lineItems.cs_1 = 'error';
  r = await send(checkout({ meta: { plan: undefined } }));
  // Was 200 and nothing written — a paid purchase lost, since Stripe does not
  // retry a 200 (סב52). Not knowing the price is not an unknown price.
  ok(r.status === 500 && db.subscriptions.length === 0, 'answered 500 so Stripe asks again; nothing written yet', `status ${r.status}, ${JSON.stringify(db.subscriptions)}`);
  stripeState.lineItems.cs_1 = PRICE_PRO;
  r = await send(checkout({ meta: { plan: undefined } }));
  ok(r.status === 200 && row()?.plan === 'pro', 'and the retry, with Stripe answering, records the purchase', JSON.stringify(row()));

  // ── which event ───────────────────────────────────────────────────────────
  console.log('\n── event_id belongs to someone else (or was deleted)');
  world();
  db.events = [{ id: EVENT, user_id: OTHER }];
  r = await send(checkout());
  ok(r.status === 200, 'answered 200 — money moved, the row is the record', `status ${r.status}`);
  ok(row() && row().event_id === null, 'recorded with event_id NULL, so it unlocks nothing', JSON.stringify(row()));

  console.log('\n── the ownership query fails');
  world();
  db.fail.add('events:GET');
  r = await send(checkout());
  ok(r.status === 500, 'answered 500 so Stripe retries — an error is not "not yours"', `status ${r.status}`);
  ok(writes().length === 0, 'nothing written', writes().join(' · '));

  // ── rows a person or a refund already decided ─────────────────────────────
  console.log('\n── the existing-row read fails');
  world();
  db.fail.add('subscriptions:GET');
  r = await send(checkout());
  ok(r.status === 500 && writes().length === 0, 'answered 500 and wrote nothing', `status ${r.status} ${writes().join(' · ')}`);

  console.log('\n── a manually managed row for this session');
  world();
  db.subscriptions = [liveRow({ is_manually_managed: true, plan: 'enterprise' })];
  r = await send(checkout());
  ok(r.status === 200 && writes().length === 0 && row().plan === 'enterprise', 'left alone', JSON.stringify(row()));

  console.log('\n── a cancelled row for this session (refunded, then the event re-delivered)');
  world();
  db.subscriptions = [liveRow({ status: 'cancelled', expires_at: '2026-09-01T00:00:00.000Z' })];
  r = await send(checkout());
  ok(r.status === 200 && writes().length === 0 && row().status === 'cancelled', 'not brought back to life', JSON.stringify(row()));

  console.log('\n── the charge was already fully refunded when the event arrived');
  world();
  stripeState.intents.pi_1 = { amount: 69000, amount_refunded: 69000 };
  r = await send(checkout());
  ok(r.status === 200 && row()?.status === 'cancelled', 'the row is written cancelled', JSON.stringify(row()));
  ok(row()?.expires_at && Date.parse(row().expires_at) <= Date.now(), 'and already expired', `expires_at ${row()?.expires_at}`);

  console.log('\n── the payment intent cannot be read');
  world();
  stripeState.intents.pi_1 = 'error';
  r = await send(checkout());
  ok(r.status === 500 && writes().length === 0, 'answered 500 and wrote nothing — not knowing is not "not refunded"', `status ${r.status} ${writes().join(' · ')}`);

  console.log('\n── the upsert fails');
  world();
  db.fail.add('subscriptions:POST');
  r = await send(checkout());
  ok(r.status === 500, 'answered 500 so Stripe retries', `status ${r.status}`);

  // ── charge.refunded ───────────────────────────────────────────────────────
  const two = () => { world(); db.subscriptions = [liveRow(), liveRow({ stripe_checkout_session_id: 'cs_2', stripe_payment_intent_id: 'pi_2', event_id: 'event-2' })]; };

  console.log('\n── a full refund');
  two();
  r = await send(refund());
  ok(r.status === 200, 'answered 200', `status ${r.status}`);
  ok(row('cs_1').status === 'cancelled' && row('cs_1').expires_at, 'that purchase is cancelled and expired', JSON.stringify(row('cs_1')));
  ok(row('cs_2').status === 'active' && row('cs_2').expires_at === null, 'the OTHER purchase is untouched', JSON.stringify(row('cs_2')));

  console.log('\n── a partial refund (goodwill credit)');
  two();
  r = await send(refund({ refunded: 10000 }));
  ok(r.status === 200 && writes().length === 0 && row('cs_1').status === 'active', 'access kept, nothing written', JSON.stringify(row('cs_1')));

  console.log('\n── a full refund on a manually managed row');
  world();
  db.subscriptions = [liveRow({ is_manually_managed: true })];
  r = await send(refund());
  ok(r.status === 200 && writes().length === 0 && row().status === 'active', 'left alone', JSON.stringify(row()));

  console.log('\n── a full refund with no purchase row');
  world();
  r = await send(refund({ pi: 'pi_unknown' }));
  ok(r.status === 200 && writes().length === 0, 'answered 200, nothing to revoke', `status ${r.status}`);

  console.log('\n── a full refund while the lookup fails');
  two();
  db.fail.add('subscriptions:GET');
  r = await send(refund());
  ok(r.status === 500 && writes().length === 0, 'answered 500 and wrote nothing', `status ${r.status}`);

  console.log('\n── a full refund while the write fails');
  two();
  db.fail.add('subscriptions:PATCH');
  r = await send(refund());
  ok(r.status === 500, 'answered 500 so Stripe retries', `status ${r.status}`);

  console.log('\n── the refund replayed');
  two();
  await send(refund());
  r = await send(refund());
  ok(r.status === 200 && row('cs_1').status === 'cancelled' && row('cs_2').status === 'active', 'still exactly the one purchase cancelled', JSON.stringify(db.subscriptions.map(x => x.status)));

  console.log('\n── an event type the function does not handle');
  world();
  r = await send({ id: 'evt_other', object: 'event', type: 'customer.created', data: { object: { id: 'cus_qa', object: 'customer' } } });
  ok(r.status === 200 && db.calls.length === 0, 'answered 200, touched nothing', `status ${r.status}`);
} finally {
  fn.kill();
  supa.close();
  stripeApi.close();
  rmSync(DIR, { recursive: true, force: true });
}
if (fails) console.log('\n--- function log ---\n' + log.slice(-3000));
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
