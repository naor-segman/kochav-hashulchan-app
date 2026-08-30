import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import handler from "./invite-og.js";

/* THE BUG: this function has never worked. Not "worked and then regressed" —
 * never, on any /invite/ link ever shared.
 *
 * Line 70 read `const out = html…` and `html` was not defined anywhere in the
 * file: `context.next()` returns a Response and nobody ever called `.text()` on
 * it. So every request threw ReferenceError, the outer `catch { return res; }`
 * swallowed it, and the response went out untouched. Every WhatsApp preview of
 * an invitation showed the site's generic title instead of the couple's names,
 * which is the whole reason this file exists.
 *
 * It hid inside three eslint errors under netlify/ recorded as "pre-existing".
 * Two were genuinely false (`Netlify` is a real edge global). The third was
 * this.
 *
 * There is no test runner for edge functions in this repo, so the module is
 * imported directly and the two things it touches — `Netlify.env` and global
 * `fetch` — are stubbed. That is enough to answer the only question that
 * matters: does the returned HTML actually carry the event's name?
 */

const SHELL = `<!doctype html><html><head>
<title>רוויה — סידור הושבה, אישורי הגעה וניהול אירועים</title>
<meta property="og:title" content="רוויה" />
<meta property="og:description" content="סידור הושבה" />
<meta name="twitter:title" content="רוויה" />
<meta name="twitter:description" content="סידור הושבה" />
</head><body><div id="root"></div></body></html>`;

const htmlResponse = (body = SHELL) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

const ctx = (res = htmlResponse()) => ({ next: async () => res });

const EVENT = {
  name: "החתונה של דנה ויוסי", type: "חתונה", venue: "אולמי הגן, רחובות",
  bride_name: "דנה", groom_name: "יוסי",
};

let fetchMock, envGet;
beforeEach(() => {
  envGet = vi.fn((k) => (k === "VITE_SUPABASE_URL" ? "https://x.supabase.co" : "anon-key"));
  globalThis.Netlify = { env: { get: envGet } };
  fetchMock = vi.fn(async () => new Response(JSON.stringify(EVENT), {
    status: 200, headers: { "content-type": "application/json" },
  }));
  globalThis.fetch = fetchMock;
});
afterEach(() => { delete globalThis.Netlify; });

const run = async (url = "https://kochav.co.il/invite/tok123", res) =>
  handler(new Request(url), ctx(res));

/** Run and hand back the ORIGINAL response too, so pass-through can be asserted
 *  by identity rather than by string equality — a rebuilt response with the same
 *  bytes is not the same thing as getting out of the way. */
const runWith = async (url, res = htmlResponse()) => ({ out: await handler(new Request(url), ctx(res)), res });

describe("the invitation's link preview", () => {
  it("puts the couple's names in the title — the thing that never happened", async () => {
    const out = await run();
    const body = await out.text();
    expect(body).toContain("<title>אתר החתונה של דנה &amp; יוסי</title>");
    expect(body).not.toContain("<title>רוויה – סידור");
  });

  it("rewrites all four social meta tags", async () => {
    const body = await (await run()).text();
    expect(body).toContain('<meta property="og:title" content="אתר החתונה של דנה &amp; יוסי"');
    expect(body).toContain('<meta name="twitter:title" content="אתר החתונה של דנה &amp; יוסי"');
    for (const tag of ["og:description", "twitter:description"]) {
      expect(body, tag).toContain("חתונה · אולמי הגן, רחובות");
    }
  });

  it("names the event type — a bar mitzvah is not a wedding", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      name: "בר המצווה של איתי", type: "בר מצווה", celebrant_name: "איתי", venue: "האחוזה",
    }), { status: 200 }));
    const body = await (await run()).text();
    expect(body).toContain("<title>אתר הבר מצווה של איתי</title>");
  });
});

describe("what the host can and cannot inject", () => {
  // The recorded bug this file already carried a fix for — a fix that, because
  // of the above, had never once executed. It is the live path now.

  it("does not let $-patterns in an event name eat the document", async () => {
    // String.prototype.replace expands `$&`, "$`", `$'` and `$1` in a STRING
    // replacement, AFTER escaping. `$'` swallowed the rest of the document into
    // <title>; `` $` `` injected raw page HTML, quotes included, into content=.
    // Replacement FUNCTIONS never expand anything.
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      name: "x", type: "חתונה", celebrant_name: "דנה $' $` $& $1", venue: "אולם",
    }), { status: 200 }));
    const body = await (await run()).text();
    expect(body).toContain("<title>אתר החתונה של דנה $' $` $&amp; $1</title>");
    // The shell is still a document, not a document nested inside its own title.
    expect(body.match(/<title>/g)).toHaveLength(1);
    expect(body).toContain('<div id="root"></div>');
  });

  it("escapes markup in an event name", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      name: "x", type: "חתונה", celebrant_name: '<script>alert(1)</script>"', venue: "אולם",
    }), { status: 200 }));
    const body = await (await run()).text();
    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain("&lt;script&gt;");
  });
});

describe("and it gets out of the way when it cannot help", () => {
  it("passes a non-invite path straight through", async () => {
    // Identity, not bytes. Deleting the `if (!m) return res` guard survived the
    // string comparison: `m[1]` throws further down, the catch returns `res`,
    // and the body looks identical. Same output, completely different reason.
    const { out, res } = await runWith("https://kochav.co.il/app");
    expect(out).toBe(res);
    expect(res.bodyUsed, "it did not even read the page").toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    // The one thing that separates "returned early on purpose" from "threw on
    // `m[1]` and the catch tidied up": the mutant reaches the env lookup first,
    // and every other observable is identical.
    expect(envGet, "it should not have got as far as reading the env").not.toHaveBeenCalled();
  });

  it("leaves the original response unread on the happy path", async () => {
    // What `.clone()` buys, asserted directly. With a bare `res.text()` the
    // original is consumed, so ANY later throw hands Netlify a used Response
    // and the visitor gets a blank page. Nothing else in this file can observe
    // that, and a mutation dropping the clone survived until this existed.
    const { out, res } = await runWith("https://kochav.co.il/invite/tok123");
    expect(out).not.toBe(res);
    expect(res.bodyUsed).toBe(false);
    expect(await out.text()).toContain("דנה &amp; יוסי");
  });

  it("passes through when the token resolves to nothing", async () => {
    fetchMock.mockResolvedValue(new Response("null", { status: 200 }));
    const body = await (await run()).text();
    expect(body).toBe(SHELL);
  });

  it("passes through when the backend errors, without throwing", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    const out = await run();
    expect(out.status).toBe(200);
    expect(await out.text()).toBe(SHELL);
  });

  it("passes a non-HTML response through untouched", async () => {
    const json = new Response('{"a":1}', { status: 200, headers: { "content-type": "application/json" } });
    const out = await run("https://kochav.co.il/invite/tok123", json);
    expect(await out.text()).toBe('{"a":1}');
  });

  it("drops content-length, which would now be wrong", async () => {
    const res = new Response(SHELL, {
      status: 200,
      headers: { "content-type": "text/html", "content-length": String(SHELL.length) },
    });
    const out = await run("https://kochav.co.il/invite/tok123", res);
    expect(out.headers.get("content-length")).toBeNull();
  });
});
