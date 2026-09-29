/* global Deno */
// The invitation's OG function RUN in real Deno, against the real built shell
// (dist/index.html) — not imported into Node with stubs, which is what
// netlify/tests/invite-og.test.js does. WORKPLAN 106/ר: "the Deno stage of
// Netlify never ran here". Run by qa/edgeBundle.mjs after the bundle; needs a
// build (`npm run build`). Only `fetch` (the Supabase call) is stubbed.
//
//   deno run --allow-read qa/inviteOg.deno.js
const ROOT = new URL("..", import.meta.url);
let fails = 0;
const fn = (await import(new URL("netlify/edge-functions/invite-og.js", ROOT).href)).default;
const SHELL = Deno.readTextFileSync(new URL("dist/index.html", ROOT));
globalThis.Netlify = { env: { get: k => (k === "VITE_SUPABASE_URL" ? "https://x.supabase.co" : "anon") } };
const EV = { name: "החתונה של דנה ויוסי", type: "חתונה", date: "2027-06-01", venue: "אולמי הגן", bride_name: "דנה", groom_name: "יוסי" };
let reply;
globalThis.fetch = async (_u, init) => reply(JSON.parse(init.body), init.signal);
const ok = (c, w, d = "") => { if (!c) fails++; console.log(`  ${c ? "ok  " : "FAIL"} ${w}${d ? "  — " + d : ""}`); };
const pick = (h, re) => (h.match(re) || [])[1];
const T = /<title>([^<]*)<\/title>/, OGU = /<meta property="og:url" content="([^"]*)"/, CAN = /<link rel="canonical" href="([^"]*)"/,
      OGI = /<meta property="og:image" content="([^"]*)"/, OGT = /<meta property="og:title" content="([^"]*)"/;
async function run(path, ev = EV, ct = "text/html; charset=utf-8") {
  reply = async () => new Response(JSON.stringify(ev), { status: 200 });
  const res = new Response(SHELL, { status: 200, headers: { "content-type": ct } });
  const t0 = Date.now();
  const out = await fn(new Request("https://revaya-events.co.il" + path), { next: async () => res });
  return { html: await out.text(), ms: Date.now() - t0 };
}
let r = await run("/rsvp/tok12345?utm_source=wa");
ok(pick(r.html, T) === "אישור הגעה · דנה &amp; יוסי", "rsvp: title", pick(r.html, T));
ok(pick(r.html, OGT) === "אישור הגעה · דנה &amp; יוסי", "rsvp: og:title");
ok(pick(r.html, OGU) === "https://revaya-events.co.il/rsvp/tok12345", "rsvp: og:url is the link itself, no query", pick(r.html, OGU));
ok(pick(r.html, CAN) === "https://revaya-events.co.il/rsvp/tok12345", "rsvp: canonical is the link itself", pick(r.html, CAN));
ok(/^https:\/\//.test(pick(r.html, OGI)), "og:image is absolute", pick(r.html, OGI));
ok((r.html.match(/<title>/g) || []).length === 1 && (r.html.match(/og:url/g) || []).length === 1, "one title, one og:url");

// Every route in the function's table, not four of them (29.9 review: the
// record said "all page types" while /invitation, /save-the-date, /card and
// /gift were never run).
for (const [path, want] of [
  ["/invitation/tok12345",    "הזמנה · דנה &amp; יוסי"],
  ["/save-the-date/tok12345", "שמרו את התאריך · דנה &amp; יוסי"],
  ["/card/tok12345",          "הזמנה · דנה &amp; יוסי"],
  ["/gift/tok12345",          "מתנה וברכה · דנה &amp; יוסי"],
]) {
  const x = await run(path);
  ok(pick(x.html, T) === want, `${path.split("/")[1]}: title`, pick(x.html, T));
  ok(pick(x.html, OGU) === "https://revaya-events.co.il" + path, `${path.split("/")[1]}: og:url is the link`, pick(x.html, OGU));
}

r = await run("/invite/tok12345");
ok(pick(r.html, T) === "אתר החתונה של דנה &amp; יוסי", "invite: the site's wording", pick(r.html, T));
r = await run("/album/tok12345/");
ok(pick(r.html, T) === "אלבום התמונות · דנה &amp; יוסי", "album with trailing slash", pick(r.html, T));
r = await run("/gift/tok12345/wall");
ok(pick(r.html, T).startsWith("רוויה"), "the projected wall is left alone", pick(r.html, T));

r = await run("/rsvp/tok12345", { ...EV, bride_name: `דנה "$'<b>`, groom_name: "יוסי 💍" });
ok(pick(r.html, T) === "אישור הגעה · דנה &quot;$'&lt;b&gt; &amp; יוסי 💍", "quotes, $', tags, emoji: escaped, nothing expanded", pick(r.html, T));
ok(!r.html.includes("<b>"), "no raw tag reaches the page");

r = await run("/rsvp/tok12345", { ...EV, bride_name: null, groom_name: null, celebrant_name: "איתי", type: "בר מצווה" });
ok(pick(r.html, T) === "אישור הגעה · איתי", "one celebrant", pick(r.html, T));
// ברית / יום הולדת keep their one name in owner_name. Without it the title
// fell to the event's own name: "אתר הברית של הברית של איתי" (סב20).
r = await run("/invite/tok12345", { ...EV, bride_name: null, groom_name: null, owner_name: "איתי", name: "הברית של איתי", type: "ברית" });
ok(pick(r.html, T) === "אתר הברית של איתי", "a brit: named by owner_name, not twice by the event's name", pick(r.html, T));
r = await run("/rsvp/tok12345", { ...EV, type: "אחר" });
ok(!pick(r.html, /<meta property="og:description" content="([^"]*)"/).includes("אחר"), '"אחר" is not shown');

r = await run("/rsvp/tok12345", EV, "application/javascript");
ok(r.html === SHELL, "a non-HTML response is untouched");

reply = async () => new Response("boom", { status: 500 });
r = await (async () => { const res = new Response(SHELL, { headers: { "content-type": "text/html" } });
  const o = await fn(new Request("https://revaya-events.co.il/rsvp/tok12345"), { next: async () => res }); return { html: await o.text() }; })();
ok(pick(r.html, T).startsWith("רוויה"), "server error: the page is served as it was");

reply = (_b, signal) => new Promise((res, rej) => { const id = setTimeout(() => res(new Response(JSON.stringify(EV))), 5000);
  signal.addEventListener("abort", () => { clearTimeout(id); rej(new DOMException("aborted", "AbortError")); }); });
const t0 = Date.now();
{ const res = new Response(SHELL, { headers: { "content-type": "text/html" } });
  const o = await fn(new Request("https://revaya-events.co.il/rsvp/tok12345"), { next: async () => res });
  const h = await o.text(); const ms = Date.now() - t0;
  ok(ms < 2600 && pick(h, T).startsWith("רוויה"), "a 5s backend does not hold the page past ~2s", `${ms}ms`); }

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
Deno.exit(fails ? 1 : 0);
