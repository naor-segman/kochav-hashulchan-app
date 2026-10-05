/* The event's package card, on the event hub, in a real browser.
 *
 * It is the only place in the product where money can be spent, and it is the
 * one thing in the per-event entitlement change that a host SEES. The jsdom
 * tests beside the component assert its logic; this asserts that it survives a
 * real build, real CSS and two viewport widths — that the price is on the
 * button, that a state where buying is impossible says so instead of offering a
 * button that fails, and that it does not push the page sideways.
 *
 * Signed out and with no Stripe key, which is the state of this build and of
 * production today: the expected outcome is a disabled button with a reason.
 *
 * Run: node qa/eventPlanCard.mjs   (expects a build)
 */
import { createRequire } from "node:module";
import { startPreview } from "./lib/preview.mjs";
const require = createRequire("/home/user/kochav-hashulchan-app/");
const { chromium } = require("playwright");

const { base, stop } = await startPreview(4396);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
const results = [];
const check = (n, pass, d = "") => results.push({ n, pass: !!pass, d: String(d) });

for (const w of [390, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  /* JS errors only. This sandbox routes outbound requests through a proxy whose
     CA the browser does not trust, so any external asset logs
     ERR_CERT_AUTHORITY_INVALID — an environment artefact, not a page defect.
     The first version of this check counted those and "failed" on a page that
     was fine. */
  p.on("console", m => {
    const t = m.text();
    if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|Failed to load resource/.test(t)) errs.push(t);
  });

  // Seed one event straight into localStorage — the guest-mode store — then open it.
  await p.goto(base + "/app", { waitUntil: "networkidle" });
  const id = await p.evaluate(() => {
    const id = crypto.randomUUID();
    const ev = { id, name: "נאור ומיכל", type: "חתונה", date: "2027-05-20", venue: "אולמי X",
                 // 8 rows × 40 = 320 people. One row of 320 is not a real list:
                 // normalizeEvent caps a row at 50, and read back as 50.
                 guests: Array.from({ length: 8 }, (_, i) => ({ id: "g" + i, name: "משפחה " + i, count: 40 })), tables: [], seating: {}, constraints: [], version: 1, updatedAt: Date.now() };
    localStorage.setItem("kochav_hashulchan_v1", JSON.stringify({ events: [ev], activeEventId: id }));
    return id;
  });
  await p.goto(`${base}/events/${id}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);

  const card = await p.evaluate(() => {
    const el = [...document.querySelectorAll("section")].find(s => s.textContent.includes("החבילה של האירוע הזה"));
    if (!el) return null;
    const btn = el.querySelector("button");
    const r = el.getBoundingClientRect();
    return {
      text: el.textContent.trim().replace(/\s+/g, " "),
      top: Math.round(r.top + window.scrollY), height: Math.round(r.height),
      btn: btn ? { text: btn.textContent.trim(), disabled: btn.disabled,
                   w: Math.round(btn.getBoundingClientRect().width) } : null,
      overflowsRight: r.right > window.innerWidth + 1,
      ...(() => {
        /* The tool grid, anchored on a real AREA title from src/data/eventAreas.js
           rather than on "the first h2 or h3" — which the previous version used
           and which matched a heading inside the page header at 158px, so the
           check failed on a page where the card was in the right place. Document
           order, not coordinates: the card must come BEFORE the host starts
           picking tools. */
        const area = [...document.querySelectorAll("*")]
          .find(el => el.children.length === 0 && el.textContent.trim() === "הרשימה וההושבה");
        if (!area) return { toolsTop: null, beforeTools: false };
        const before = !!(document.querySelector("section") &&
          (area.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING));
        return { toolsTop: Math.round(area.getBoundingClientRect().top + window.scrollY), beforeTools: before };
      })(),
    };
  });

  check(`@${w} card renders on the event hub`, !!card, JSON.stringify(card));
  if (card) {
    // 320 people → the 350 step, rounded UP (136, 5.10). Nearest would be ₪349.
    check(`@${w} names this event's price`, card.text.includes("₪399"), card.text.slice(0, 160));
    // Signed out + no Stripe key in this build: the honest state is a disabled
    // button that says why, not a button that fails when pressed.
    check(`@${w} buy button disabled with a reason`, card.btn && card.btn.disabled, JSON.stringify(card.btn));
    check(`@${w} says why`, /מחוברים לחשבון|בענן|בקרוב/.test(card.text), card.text.slice(0, 160));
    check(`@${w} does not overflow`, !card.overflowsRight, `right edge vs ${w}`);
    /* NOT asserted, reported. Two attempts at a position claim were both wrong:
       `top < 900` failed at 390 because the hub's header is 951px tall on a
       phone, and "before the first area title" failed because area labels also
       appear in the chrome's nav rail at 75px. The position is measured and
       printed instead of dressed up as a passing check. */
    console.log(`      measured @${w}: card top ${card.top}px, height ${card.height}px`);
  }
  const x = await p.evaluate(() => { window.scrollTo({ left: -1e5, behavior: "instant" }); const v = window.scrollX; window.scrollTo(0, 0); return v; });
  check(`@${w} no horizontal scroll`, x === 0, `scrollX=${x}`);
  check(`@${w} no console errors`, errs.length === 0, errs.slice(0, 2).join(" | "));
  await p.close();
}
await b.close(); stop();
const failed = results.filter(r => !r.pass);
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.n}   [${r.d.slice(0, 150)}]`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
