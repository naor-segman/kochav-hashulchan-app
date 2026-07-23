// Netlify Edge Function — per-event Open Graph tags for /invite/:token links.
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

export default async (request, context) => {
  const res = await context.next();
  try {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/invite\/([^/]+)/);
    if (!m) return res;
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
        body: JSON.stringify({ token_type: "invite", token_value: m[1] }),
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
    const hosts = (ev.bride_name && ev.groom_name)
      ? `${ev.bride_name} & ${ev.groom_name}`
      : (ev.celebrant_name || ev.organization_name || ev.name);
    const title = `${typeSite} ${hosts}`;
    const desc  = [ev.type, ev.venue].filter(Boolean).join(" · ") || "אתם מוזמנים! פרטים ואישור הגעה בקישור.";

    const html = await res.text();
    const out = html
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/i, `$1${esc(title)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/i, `$1${esc(desc)}$2`)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/i, `$1${esc(title)}$2`)
      .replace(/(<meta name="twitter:description" content=")[^"]*(")/i, `$1${esc(desc)}$2`);

    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(out, { status: res.status, headers });
  } catch {
    return res;
  }
};
