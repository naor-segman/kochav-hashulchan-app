// The work-plan page, GENERATED from WORKPLAN.md (3.10).
//
// Until 3.10 the page the owner reads was an HTML file kept by hand next to
// WORKPLAN.md. It drifted exactly the way CLAUDE.md bug class 6 says a hand-kept
// duplicate drifts: WORKPLAN closed item 23 on 1.10, the page still showed it
// open on 3.10, and the owner found it before anyone else did. So the page is
// no longer written, it is rendered: every word on it comes from WORKPLAN.md at
// the commit printed in its header, and a row's colour comes from the status
// mark at the start of that row — nothing is summarised by hand.
//
//   node qa/planPage.mjs <out.html>
//
// A small renderer for the markdown WORKPLAN actually uses (headings, tables,
// lists, quotes, bold/italic/strike/code/links) — no dependency for one page.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const out = process.argv[2];
if (!out) { console.error("usage: node qa/planPage.mjs <out.html>"); process.exit(2); }

const md = readFileSync(ROOT + "WORKPLAN.md", "utf8");
const commit = execSync("git log -1 --format=%h -- WORKPLAN.md", { cwd: ROOT }).toString().trim();
const when = execSync("git log -1 --format=%cd --date=format:%d.%m.%Y\\ %H:%M -- WORKPLAN.md", { cwd: ROOT }).toString().trim();

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline markdown → HTML. Code spans are cut out first so nothing inside them is touched. */
function inline(src) {
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:])/g, (_, p, u) => `${p}<a href="${u}">${u}</a>`);
  s = s.replace(/~~([\s\S]+?)~~/g, "<s>$1</s>");
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>");
  s = s.replace(/(^|[\s(>"״׳])\*(?!\s)([^*\n]+?)(?<!\s)\*(?=[\s).,;:!?<"״׳—-]|$)/g, "$1<i>$2</i>");
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
  return s;
}

/** Split a table row on pipes that are not inside a code span. */
function cells(line) {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out = [];
  let cur = "", inCode = false;
  for (const ch of t) {
    if (ch === "`") inCode = !inCode;
    if (ch === "|" && !inCode) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// A row's status is the first mark in its text. Order matters: a row that says
// "✅ closed … ⬜ one thing left" is closed with a remainder, and reads as closed.
const MARKS = [
  ["done", /^(~~)?\s*(\*\*)?\s*✅/],
  ["wait", /^(\*\*)?\s*(❓|👤|⚖️)/],
  ["hold", /^(\*\*)?\s*(⏸️|⏸|⛔|🧊)/],
  ["work", /^(\*\*)?\s*(🔨|🔄|🛠️)/],
  ["urgent", /^(\*\*)?\s*🔴/],
  ["open", /^(\*\*)?\s*(⬜|🆕)/],
];
function statusOf(text) {
  const t = text.replace(/^\s*(🆕\s*)/, (m) => m); // 🆕 alone means "new", look past it
  const past = t.replace(/^(\*\*)?\s*🆕\s*/, "");
  for (const [k, re] of MARKS) if (re.test(past)) return k;
  for (const [k, re] of MARKS) if (re.test(t)) return k;
  return "";
}
/** A row's status. The review-round tables put the finding (often opening
 *  with 🔴 — a severity, not a state) first and the outcome (✅ …) in a later
 *  column, so the LAST column that carries a mark wins; the "who" column
 *  (👤 / 🤖) is an owner, not a state, and is skipped. */
function rowStatus(r) {
  for (let i = r.length - 1; i >= 0; i--) {
    const c = (r[i] ?? "").trim();
    if (i >= 2 && /^(👤|🤖)/u.test(c) && c.length < 30) continue;
    const st = statusOf(c);
    if (st) return st;
  }
  return "";
}
const LABEL = { done: "סגור", wait: "מחכה לך", hold: "מושהה", work: "בעבודה", urgent: "דחוף", open: "פתוח" };

function table(rows) {
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const numbered = /^#$|^מס|^סדר$/.test(head[0]);
  // A table with a commit column lists what WAS done ("מה תוקן | קומיט",
  // "ההחלטה | מה נעשה | קומיט"): a row there without its own mark is closed.
  const doneTable = head.some((h) => /קומיט/.test(h));
  let h = `<div class="tbl${numbered ? " list" : ""}"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>`;
  for (const r of body) {
    // In a commit table the finding column opens with its SEVERITY (🔴), not a
    // state: a row with a commit is done unless its outcome column says
    // otherwise (⬜ "waits for you").
    const committed = doneTable && /[0-9a-f]{7}/.test(r[r.length - 1] ?? "");
    const outcome = committed ? r.slice(2, -1).map(statusOf).find(Boolean) : "";
    const st = committed ? (outcome || "done") : rowStatus(r);
    h += `<tr${st ? ` class="st-${st}"` : ""}>`;
    r.forEach((c, i) => {
      const lab = head[i] ? ` data-h="${esc(head[i].replace(/[*`]/g, ""))}"` : "";
      const chip = i === 1 && st ? `<span class="chip">${LABEL[st]}</span>` : "";
      h += `<td${lab}>${chip}${inline(c)}</td>`;
    });
    h += "</tr>";
  }
  return h + "</tbody></table></div>";
}

function list(lines) {
  // Nested by indentation; each item may continue on following indented lines.
  const items = [];
  for (const l of lines) {
    const m = l.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (m) items.push({ ind: m[1].length, ord: /\d/.test(m[2]), text: m[3] });
    else if (items.length) items[items.length - 1].text += " " + l.trim();
  }
  let h = "";
  const stack = [];
  // "🔎 היסטוריה:" holds superseded states — kept, but folded: the owner reads
  // what is true now first (4.10). Its nested list opens on a tap.
  const isHistory = (t) => /^🔎\s*(\*\*)?היסטוריה/.test(t);
  // A DONE step's details fold too — but only when nothing under it is still
  // open, waiting, or unverified: a folded ✅ must never hide a ⬜.
  const needsEyes = (t) => /^(⬜|❓|⚠️|🔨|⏸️)/u.test(t.trim());
  const foldable = items.map((it, k) => {
    if (statusOf(it.text) !== "done") return false;
    for (let j = k + 1; j < items.length && items[j].ind > it.ind; j++) if (needsEyes(items[j].text)) return false;
    return true;
  });
  let prev = null, prevK = -1;
  const close = () => { const s = stack.pop(); h += `</li></${s.tag}>${s.fold ? "</details>" : ""}`; };
  for (const it of items) {
    while (stack.length && it.ind < stack[stack.length - 1].ind) close();
    const top = stack[stack.length - 1];
    if (!top || it.ind > top.ind) {
      const tag = it.ord ? "ol" : "ul";
      const hist = !!(top && prev && isHistory(prev.text));
      const done = !hist && !!(top && prevK >= 0 && foldable[prevK]);
      const fold = hist || done;
      stack.push({ ind: it.ind, tag, fold });
      h += `${fold ? `<details class="histItem"><summary>${hist ? "להצגת ההיסטוריה" : "פירוט"}</summary>` : ""}<${tag}>`;
    }
    else h += "</li>";
    const st = statusOf(it.text);
    h += `<li${st ? ` class="st-${st}"` : ""}>${inline(it.text)}`;
    prev = it; prevK = items.indexOf(it);
  }
  while (stack.length) close();
  return h;
}

const toc = [];
let hn = 0;
function blocks(lines) {
  let h = "";
  // An item (4.10): "#### <status> <id> · <title>" opens a card that holds
  // everything up to the next heading — its "מי / מצב" line and its sub-items.
  let inItem = false;
  const closeItem = () => { if (inItem) { h += "</div>"; inItem = false; } };
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const hm = l.match(/^(#{1,4})\s+(.*)$/);
    if (hm) {
      closeItem();
      const lv = Math.min(hm[1].length + 1, 5);
      const id = `s${++hn}`;
      if (lv <= 4) toc.push({ lv, id, text: hm[2].replace(/\*|`|~~/g, "") });
      const st = lv === 5 ? statusOf(hm[2]) : "";
      if (st) {
        h += `<div class="item st-${st}"><h5 id="${id}"><span class="chip">${LABEL[st]}</span>${inline(hm[2])}</h5>`;
        inItem = true;
      } else {
        h += `<h${lv} id="${id}">${inline(hm[2])}</h${lv}>`;
      }
      i++; continue;
    }
    if (/^---+\s*$/.test(l)) { h += "<hr>"; i++; continue; }
    if (/^\s*\|/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      h += table(rows); continue;
    }
    if (/^\s*>/.test(l)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      h += `<blockquote>${blocks(q)}</blockquote>`; continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ls = [];
      while (i < lines.length && lines[i].trim() && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) ls.push(lines[i++]);
      h += list(ls); continue;
    }
    const p = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*\||\s*>|---+\s*$|\s*([-*]|\d+\.)\s+)/.test(lines[i])) p.push(lines[i++]);
    if (!p.length) { h += `<p>${inline(lines[i++])}</p>`; continue; }
    h += `<p>${inline(p.join(" "))}</p>`;
  }
  closeItem();
  return h;
}

// The live plan is everything before the second top-level heading; what
// follows is history (the 11.8 focus list and the archive) and opens on demand.
const all = md.split("\n");
const h1s = all.map((l, i) => (/^#\s/.test(l) ? i : -1)).filter((i) => i >= 0);
const title = all[h1s[0]].replace(/^#\s+/, "");
const liveLines = all.slice(h1s[0] + 1, h1s[1] ?? all.length);
const histLines = h1s[1] != null ? all.slice(h1s[1]) : [];
const live = blocks(liveLines);
// "##" renders as h3 and "###" as h4 (the page's own title is the h1).
const liveToc = toc.filter((t) => t.lv === 3 || t.lv === 4);
const hist = histLines.length ? blocks(histLines) : "";

const counts = {};
for (const m of live.matchAll(/<(?:tr|div) class="(?:item )?st-(\w+)"/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unica Plan — תוכנית עבודה</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap">
<style>
:root{--ink:#14161A;--ink2:#4A4F57;--ink3:#666C74;--paper:#FFFFFF;--sunken:#F5F5F6;--line:#E4E4E7;--accent:#B01253;--accentBg:#FBE7EF;
--done:#0F7350;--doneBg:#E3F4ED;--wait:#96600A;--waitBg:#FBF1DA;--hold:#2F5E9E;--holdBg:#E6EEF9;--work:#6B3FA0;--workBg:#F0E9F8;--urgent:#BC2F2A;--urgentBg:#FCE6D6;--open:#4A4F57;--openBg:#EEEEF0}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark;--ink:#F2F2F4;--ink2:#B9BDC4;--ink3:#949AA2;--paper:#1D2028;--sunken:#14161A;--line:#2B2F38;--accent:#FA9FC0;--accentBg:#3A2530;
--done:#6FD3AC;--doneBg:#16302A;--wait:#E8BC63;--waitBg:#33290F;--hold:#9DBEEB;--holdBg:#1C2A3D;--work:#C9A9EE;--workBg:#2C2140;--urgent:#F0A08F;--urgentBg:#3A211A;--open:#B9BDC4;--openBg:#2B2F38}}
:root[data-theme="dark"]{color-scheme:dark;--ink:#F2F2F4;--ink2:#B9BDC4;--ink3:#949AA2;--paper:#1D2028;--sunken:#14161A;--line:#2B2F38;--accent:#FA9FC0;--accentBg:#3A2530;
--done:#6FD3AC;--doneBg:#16302A;--wait:#E8BC63;--waitBg:#33290F;--hold:#9DBEEB;--holdBg:#1C2A3D;--work:#C9A9EE;--workBg:#2C2140;--urgent:#F0A08F;--urgentBg:#3A211A;--open:#B9BDC4;--openBg:#2B2F38}
*{box-sizing:border-box}
html{direction:rtl}
body{margin:0;background:var(--sunken);color:var(--ink);font:16px/1.65 "Heebo",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;overflow-wrap:anywhere}
.wrap{max-width:980px;margin:0 auto;padding:0 16px 96px}
header.top{padding:36px 0 18px}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--ink3);margin:0 0 8px}
h1.t{font-size:clamp(28px,7vw,40px);line-height:1.15;margin:0 0 8px;font-weight:800}
.sub{color:var(--ink2);margin:0;max-width:70ch}
.legend{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0;padding:0;list-style:none}
.legend li{font-size:13px;padding:3px 10px;border-radius:999px}
nav.toc{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:18px 0 28px}
nav.toc summary{cursor:pointer;font-weight:700;min-height:32px;display:flex;align-items:center}
nav.toc ol{margin:8px 0 0;padding-inline-start:18px;columns:2;column-gap:28px}
nav.toc li{break-inside:avoid;margin:2px 0;font-size:14px}
nav.toc li.l3{font-size:13px;color:var(--ink2);margin-inline-start:12px;list-style:circle}
@media (max-width:640px){nav.toc ol{columns:1}}
a{color:var(--accent)}
h2,h3,h4,h5{line-height:1.3;scroll-margin-top:12px}
h2{font-size:24px;margin:44px 0 12px;padding-top:12px;border-top:2px solid var(--line)}
h3{font-size:19px;margin:32px 0 10px}
h4,h5{font-size:16px;margin:22px 0 8px}
p{margin:10px 0}
code{font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:0 4px;direction:ltr;unicode-bidi:isolate}
blockquote{margin:14px 0;padding:8px 14px;background:var(--paper);border-inline-start:4px solid var(--accent);border-radius:8px}
hr{border:0;border-top:1px solid var(--line);margin:24px 0}
ul,ol{padding-inline-start:22px}
li{margin:4px 0}
li.st-done::marker{color:var(--done)}
.tbl{margin:12px 0;overflow-x:auto;background:var(--paper);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:14.5px}
th{background:var(--sunken);text-align:start;font-weight:700;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
td:first-child{font-weight:700;white-space:nowrap}
tr[class^="st-"] td:first-child{border-inline-start:4px solid var(--c)}
.chip{display:inline-block;font-size:12px;font-weight:700;padding:1px 8px;border-radius:999px;margin-inline-end:6px;background:var(--cb);color:var(--c)}
.st-done{--c:var(--done);--cb:var(--doneBg)}.st-wait{--c:var(--wait);--cb:var(--waitBg)}.st-hold{--c:var(--hold);--cb:var(--holdBg)}
.st-work{--c:var(--work);--cb:var(--workBg)}.st-urgent{--c:var(--urgent);--cb:var(--urgentBg)}.st-open{--c:var(--open);--cb:var(--openBg)}
.legend .st-done,.legend .st-wait,.legend .st-hold,.legend .st-work,.legend .st-urgent,.legend .st-open{background:var(--cb);color:var(--c);font-weight:700}
/* Phone: a table row becomes a card, so nothing scrolls sideways. */
@media (max-width:720px){
  .tbl{background:none;border:0;overflow:visible}
  .tbl table,.tbl tbody,.tbl tr,.tbl td{display:block;width:100%}
  .tbl thead{display:none}
  .tbl tr{background:var(--paper);border:1px solid var(--line);border-radius:12px;margin:10px 0;padding:6px 0}
  .tbl tr[class^="st-"]{border-inline-start:4px solid var(--c)}
  .tbl td{border:0;padding:4px 12px}
  .tbl td:first-child{border:0!important;white-space:normal}
  .tbl td[data-h]:not(:first-child):not(:nth-child(2))::before{content:attr(data-h) ": ";color:var(--ink3);font-weight:700;font-size:13px}
}
.item{background:var(--paper);border:1px solid var(--line);border-inline-start:5px solid var(--c);border-radius:12px;padding:10px 14px 8px;margin:14px 0}
.item h5{font-size:16.5px;line-height:1.4;margin:2px 0 6px;border:0;padding:0}
.item p{margin:4px 0;color:var(--ink2);font-size:14.5px}
.item ul{margin:6px 0 4px;padding-inline-start:20px}
.item li{margin:5px 0}
.item li ul{margin:2px 0}
li.st-open,li.st-wait{font-weight:500}
details.histItem{display:inline}
details.histItem>summary{cursor:pointer;color:var(--accent);font-size:13.5px;min-height:32px;display:inline-flex;align-items:center;padding-inline-start:4px}
details.histItem[open]>summary{color:var(--ink3)}
details.hist{margin:48px 0 0;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 16px}
details.hist>summary{cursor:pointer;font-weight:700;min-height:36px;display:flex;align-items:center}
footer{margin-top:40px;color:var(--ink3);font-size:13px}
</style>
</head>
<body>
<div class="wrap">
<header class="top">
<p class="eyebrow">תוכנית עבודה · נוצר מ-WORKPLAN.md · קומיט ${esc(commit)} · ${esc(when)}</p>
<h1 class="t">${inline(title)}</h1>
<p class="sub">כל מילה בדף הזה באה מ-<code>WORKPLAN.md</code> כמו שהוא — שום דבר לא סוכם ביד. הצבע של כל שורה נקבע לפי הסימן שבתחילתה (✅ סגור · ❓/👤 מחכה לך · ⏸️ מושהה · 🔨/🔄 בעבודה · 🔴 דחוף · ⬜ פתוח).</p>
<ul class="legend">${Object.entries(LABEL).map(([k, v]) => `<li class="st-${k}">${v}: ${counts[k] || 0}</li>`).join("")}</ul>
</header>
<nav class="toc" aria-label="תוכן"><details open><summary>תוכן העניינים</summary><ol>${liveToc.map((t) => `<li class="l${t.lv - 1}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join("")}</ol></details></nav>
<main>
${live}
${hist ? `<details class="hist"><summary>היסטוריה — התוכנית הממוקדת של 11.8 והארכיון (לחצו לפתיחה)</summary>${hist}</details>` : ""}
</main>
<footer>נוצר אוטומטית ע״י <code>qa/planPage.mjs</code> מ-<code>WORKPLAN.md</code> בקומיט <code>${esc(commit)}</code>.</footer>
</div>
</body>
</html>
`;
writeFileSync(out, html);
console.log(`wrote ${out} — ${(html.length / 1024).toFixed(0)} KB · rows by status: ${JSON.stringify(counts)}`);
