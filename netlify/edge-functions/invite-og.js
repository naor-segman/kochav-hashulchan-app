// Netlify Edge Function — per-event Open Graph tags for every guest link.
//
// Until 28.9 this ran for /invite/* only, so five of the six links the message
// sequence sends (WORKPLAN ר, 88) previewed in WhatsApp as an advert for the
// product instead of as the couple's event. ROUTES below maps each guest path
// to the token type its page resolves with and to the words its preview uses.
//
// A single-page app serves the same static OG tags for every route, so a
// shared event-site link previews as the generic homepage in WhatsApp. This
// function fetches the event by its invite token and rewrites the <title> and
// og:/twitter: tags with the couple's names, so the link preview shows the
// actual event. It reuses the existing VITE_SUPABASE_* env vars — no extra
// setup. On ANY problem it falls through to the original page untouched.

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const COUPLE_TYPES = new Set(["חתונה", "אירוס", "חינה"]);

// Each entry: which paths, which token type the page itself resolves with (the
// same one — the RPC hands each type only what its page needs), and how the
// preview names the page. `null` label = the site's own wording (below).
// /gift/:t/wall is deliberately absent: it is projected in the hall, not sent.
export const ROUTES = [
  { re: /^\/invite\/([^/]+)/,             type: "invite", label: null },
  { re: /^\/rsvp\/([^/]+)/,               type: "rsvp",   label: "אישור הגעה",       desc: "לחצו כדי לאשר הגעה." },
  { re: /^\/invitation\/([^/]+)/,         type: "invite", label: "הזמנה" },
  { re: /^\/save-the-date\/([^/]+)/,      type: "invite", label: "שמרו את התאריך" },
  { re: /^\/card\/([^/]+)/,               type: "invite", label: "הזמנה" },
  { re: /^\/album\/([^/]+)\/?$/,          type: "album",  label: "אלבום התמונות",   desc: "העלו תמונות מהאירוע וראו מה צילמו כולם." },
  { re: /^\/gift\/([^/]+)\/?$/,           type: "gift",   label: "מתנה וברכה",      desc: "השאירו ברכה למארחים." },
];

// "2026-10-01" → "1.10.2026", from the string's own parts. `new Date()` on a
// date-only string parses as UTC and lands on the previous day here.
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : "";
}

export default async (request, context) => {
  const res = await context.next();
  try {
    const url = new URL(request.url);
    let route = null, m = null;
    for (const r of ROUTES) { m = url.pathname.match(r.re); if (m) { route = r; break; } }
    if (!route) return res;
    // Only rewrite HTML documents.
    if (!(res.headers.get("content-type") || "").includes("text/html")) return res;

    const SUPA = Netlify.env.get("VITE_SUPABASE_URL");
    const KEY  = Netlify.env.get("VITE_SUPABASE_ANON_KEY");
    if (!SUPA || !KEY) return res;

    // Fetch the event by invite token, with a short timeout so a slow/unavailable
    // backend never delays the page.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    let ev = null;
    try {
      const r = await fetch(`${SUPA}/rest/v1/rpc/public_event_by_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ token_type: route.type, token_value: m[1] }),
        signal: ctrl.signal,
      });
      if (r.ok) ev = await r.json();
    } finally {
      clearTimeout(timer);
    }
    if (!ev || !ev.name) return res;

    // "אתר החתונה של…" / "אתר הבר מצווה של…" — a warm, event-typed prefix.
    const typeSite = {
      "חתונה": "אתר החתונה של", "אירוס": "אתר האירוסין של", "חינה": "אתר החינה של",
      "בר מצווה": "אתר הבר מצווה של", "בת מצווה": "אתר הבת מצווה של",
      "ברית": "אתר הברית של", "יום הולדת": "אתר יום ההולדת של",
    }[ev.type] || "אתר האירוע של";
    // Bride and groom names only on a couple's event, the same rule the guest
    // pages follow (coupleEvent in src/utils/publicTokens.js — inlined, an edge
    // function cannot import from src/). A bar mitzvah first set up as a
    // wedding still carries them, and its WhatsApp preview read "אתר הבר מצווה
    // של נועה & טל" (sixth review 30.9).
    const couple = !ev.type || COUPLE_TYPES.has(ev.type);
    const hosts = (couple && ev.bride_name && ev.groom_name)
      ? `${ev.bride_name} & ${ev.groom_name}`
      // owner_name: the one name of a ברית, יום הולדת… — without it the title
      // fell to the event's own name: "אתר הברית של הברית של איתי" (סב20).
      : (ev.celebrant_name || ev.organization_name || ev.owner_name || ev.name);
    // The site keeps its original wording. Every other page names itself first,
    // then whose event it is — "אישור הגעה · דנה & יוסי".
    const title = route.label ? `${route.label} · ${hosts}` : `${typeSite} ${hosts}`;
    // "אחר" is a real type and not something to show a guest (106). Inline,
    // because an edge function cannot import from src/.
    const type  = ev.type && ev.type !== "אחר" ? ev.type : "";
    const facts = [type, fmtDate(ev.date), ev.venue].filter(Boolean).join(" · ");
    const desc  = route.label
      ? [facts, route.desc].filter(Boolean).join(" — ") || "אתם מוזמנים!"
      : [type, ev.venue].filter(Boolean).join(" · ") || "אתם מוזמנים! פרטים ואישור הגעה בקישור.";

    // Replacement FUNCTIONS, not strings.
    //
    // esc() is correct, but String.prototype.replace expands `$&`, "$`", `$'`
    // and `$1` inside a STRING replacement — after the escaping. A host whose
    // event name contained `$'` had the entire remainder of the document
    // swallowed into <title>, and `` $` `` injected raw page HTML, quotes
    // included, straight into content="…". The attacker is the host, the
    // victims are their guests and every WhatsApp link-preview crawler.
    // A function replacement never expands anything.
    const t = esc(title);
    const d = esc(desc);
    // This page's own address. The shell it is served comes out of the build
    // with og:url and canonical pointing at the HOMEPAGE (it is the "/"
    // document), and a crawler that honours og:url — Facebook's does — goes
    // and previews the homepage instead of the invitation. Query string
    // dropped: it is tracking, not identity.
    const self = esc(url.origin + url.pathname);

    // `html` WAS NEVER DEFINED. This line read `const out = html…` against a
    // variable that does not exist anywhere in the file, so every request threw
    // ReferenceError, the outer `catch { return res; }` swallowed it, and the
    // rewrite below has therefore NEVER RUN — not once, on any /invite/ link
    // ever shared. Every WhatsApp preview showed the site's generic title
    // instead of the event's, which is the entire purpose of this function.
    //
    // It hid inside the three eslint errors under netlify/ that were written
    // off as pre-existing: the two `Netlify` ones really are false positives
    // (it is a real edge-runtime global, now declared in eslint.config.js), and
    // this one was a live bug travelling with them.
    //
    // `.clone()` and not `res.text()`: reading the body consumes it, and the
    // catch below still has to be able to hand the original response back.
    const html = await res.clone().text();
    const out = html
      .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${t}</title>`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/i, (_m, a, b) => a + t + b)
      .replace(/(<meta property="og:description" content=")[^"]*(")/i, (_m, a, b) => a + d + b)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/i, (_m, a, b) => a + t + b)
      .replace(/(<meta name="twitter:description" content=")[^"]*(")/i, (_m, a, b) => a + d + b)
      .replace(/(<meta property="og:url" content=")[^"]*(")/i, (_m, a, b) => a + self + b)
      .replace(/(<link rel="canonical" href=")[^"]*(")/i, (_m, a, b) => a + self + b);

    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(out, { status: res.status, headers });
  } catch {
    return res;
  }
};
