// Driver for qa/edgeFunctionsRun.mjs — runs ONE Supabase function's handler in
// Deno with every outbound request (Supabase, Anthropic, Stripe) answered by a
// stub, and prints one JSON line per scenario. Not run on its own.
//
//   deno run -A edgeFunctionsRun.deno.js <function-name>   (from the rewritten copy)

const fnName = Deno.args[0];
const ENV = {
  SUPABASE_URL: "http://supabase.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
  APP_ORIGINS: "https://plan.unica-events.co.il", ANTHROPIC_API_KEY: "sk-test",
  STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_PRO_PRICE_ID: "price_pro",
};
const setEnv = (over = {}) => {
  for (const [k, v] of Object.entries({ ...ENV, ...over })) v === null ? Deno.env.delete(k) : Deno.env.set(k, v);
};
setEnv();

const SECRET = "SECRET-DETAIL-7f3a";          // must never reach a caller
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let calls = [];
let route = () => null;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(url);
  const key = `${(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase()} ${u.host}${u.pathname}`;
  calls.push(key);
  const r = await route(key, init);
  if (r instanceof Error) throw r;
  if (r) return r;
  if (key.includes("/auth/v1/user")) return json({ id: "11111111-1111-4111-8111-111111111111", email: "host@x.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
  if (key.includes("/rpc/claim_ai_call")) return json(29);
  return json({});
};

let handler;
Deno.serve = (h) => { handler = typeof h === "function" ? h : h.handler; return { finished: Promise.resolve(), shutdown() {}, ref() {}, unref() {}, addr: {} }; };
await import(`./${fnName}/index.ts`);

const ORIGIN = "https://plan.unica-events.co.il";
async function scenario(name, { method = "POST", body = "{}", origin = ORIGIN, headers = {}, env = {}, routes = () => null } = {}) {
  setEnv(env);
  calls = [];
  route = routes;
  const h = new Headers({ "content-type": "application/json", Authorization: "Bearer jwt", ...headers });
  if (origin) h.set("Origin", origin);
  let res;
  try {
    res = await handler(new Request("http://fn.test/", { method, headers: h, body: method === "OPTIONS" ? undefined : body }));
  } catch (e) {
    console.log(JSON.stringify({ name, threw: String(e) }));
    return;
  }
  const text = await res.text();
  console.log(JSON.stringify({
    name, status: res.status, body: text, acao: res.headers.get("access-control-allow-origin"),
    vary: res.headers.get("vary"), calls, leaked: text.includes(SECRET),
  }));
}

const img = JSON.stringify({ imageBase64: "aGVsbG8=", mimeType: "image/jpeg" });
const anthropicOk = (text) => json({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
const stripeErr = () => json({ error: { type: "invalid_request_error", message: `No such customer: ${SECRET}` } }, 400);

if (fnName === "detect-floor-plan") {
  await scenario("no-key", { body: img, env: { ANTHROPIC_API_KEY: null } });
  await scenario("bad-json", { body: "{not json" });
  await scenario("no-fields", { body: "{}" });
  await scenario("too-large", { body: JSON.stringify({ imageBase64: "A".repeat(8_000_001), mimeType: "image/jpeg" }) });
  await scenario("bad-mime", { body: JSON.stringify({ imageBase64: "aGVsbG8=", mimeType: "text/html" }) });
  await scenario("ok", { body: img, routes: (k) => k.includes("anthropic") ? anthropicOk('{"tables":[{"index":1,"seats":10,"x":10,"y":10}]}') : null });
  await scenario("user-limit", { body: img, routes: (k) => k.includes("claim_ai_call") ? json({ code: "53400", message: "rate limit reached" }, 400) : null });
  await scenario("global-limit", { body: img, routes: (k) => k.includes("claim_ai_call") ? json({ code: "53400", message: "global ai limit reached" }, 400) : null });
  await scenario("model-garbage", { body: img, routes: (k) => k.includes("anthropic") ? anthropicOk(`not json ${SECRET}`) : null });
  await scenario("model-down", { body: img, routes: (k) => k.includes("anthropic") ? json({ error: { message: SECRET } }, 401) : null });
  await scenario("throws", { body: img, routes: (k) => k.includes("anthropic") ? new Error(SECRET) : null });
  await scenario("options-app", { method: "OPTIONS" });
  await scenario("options-evil", { method: "OPTIONS", origin: "https://evil.example" });
  await scenario("post-evil", { body: img, origin: "https://evil.example", routes: (k) => k.includes("anthropic") ? anthropicOk('{"tables":[]}') : null });
}

if (fnName === "create-checkout-session") {
  const body = JSON.stringify({ plan: "pro", returnUrl: `${ORIGIN}/events/x`, eventId: "22222222-2222-4222-8222-222222222222" });
  const db = (k) => k.includes("/rest/v1/events") ? json({ id: "22222222-2222-4222-8222-222222222222", name: "e" })
    : k.includes("/rest/v1/subscriptions") ? json([])
    : k.includes("/rest/v1/profiles") ? json({ stripe_customer_id: "cus_1", email: "host@x.test" }) : null;
  await scenario("stripe-error", { body, routes: (k) => db(k) ?? (k.includes("stripe.com") ? stripeErr() : null) });
  await scenario("stripe-throws", { body, routes: (k) => db(k) ?? (k.includes("stripe.com") ? new Error(SECRET) : null) });
  // Configuration and input errors (audit 3.10, leftovers): the plan value is
  // the caller's own, and a secret's NAME is the deployment's business.
  await scenario("bad-plan", { body: JSON.stringify({ plan: SECRET, returnUrl: `${ORIGIN}/events/x`, eventId: "22222222-2222-4222-8222-222222222222" }) });
  await scenario("no-origins", { body, env: { APP_ORIGINS: null } });
  await scenario("no-price", { body, env: { STRIPE_PRO_PRICE_ID: null } });
  await scenario("recurring-price", { body, routes: (k) => db(k) ?? (k.includes("stripe.com/v1/prices") ? json({ id: "price_pro", object: "price", recurring: { interval: "month" } }) : null) });
  setEnv();
  await scenario("options-app", { method: "OPTIONS" });
  await scenario("options-evil", { method: "OPTIONS", origin: "https://evil.example" });
}

if (fnName === "purge-event-photos") {
  const PURGE = "purge-secret-0123456789";
  const ev = "33333333-3333-4333-8333-333333333333";
  const due = (k) => k.includes("/rpc/photo_purge_due")
    ? json([{ event_id: ev, urls: [`http://supabase.test/storage/v1/object/public/event-site/${ev}/a.jpg`] }]) : null;
  const opt = { headers: { "x-purge-secret": PURGE }, env: { PURGE_SECRET: PURGE }, origin: null };
  await scenario("due-fails", { ...opt, routes: (k) => k.includes("/rpc/photo_purge_due") ? json({ code: "XX000", message: SECRET }, 500) : null });
  await scenario("remove-fails", { ...opt, routes: (k) => due(k) ?? (k.includes("/storage/v1/object") ? json({ statusCode: "500", error: SECRET, message: SECRET }, 500) : null) });
  await scenario("finalize-fails", { ...opt, routes: (k) => due(k) ?? (k.includes("/storage/v1/object") ? json([]) : k.includes("/rpc/photo_purge_finalize") ? json({ code: "XX000", message: SECRET }, 500) : null) });
  await scenario("purge-ok", { ...opt, routes: (k) => due(k) ?? (k.includes("/storage/v1/object") ? json([]) : null) });
}

if (fnName === "create-billing-portal") {
  const body = JSON.stringify({ returnUrl: `${ORIGIN}/account` });
  const db = (k) => k.includes("/rest/v1/profiles") ? json({ stripe_customer_id: "cus_1" }) : null;
  await scenario("stripe-error", { body, routes: (k) => db(k) ?? (k.includes("stripe.com") ? stripeErr() : null) });
  await scenario("options-app", { method: "OPTIONS" });
  await scenario("options-evil", { method: "OPTIONS", origin: "https://evil.example" });
}

if (fnName === "stripe-webhook") {
  await scenario("bad-signature", { body: '{"id":"evt_1"}', origin: null, headers: { "stripe-signature": `t=1,v1=${SECRET}` } });
}
