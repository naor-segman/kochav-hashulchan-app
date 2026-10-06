/* The Unica Plan logo, as geometry (owner, 6.10: direction B2).
 *
 * Built like Unica's own logo — an object above the name, the name, and in
 * place of Unica's tripod the word "plan". The object is a round table seen
 * from above, laid for an event: six chairs with backs, six plates, a centre
 * piece. The letters of "unica" are Unica's own, re-measured from the original
 * logo (cap height 100, stroke 17.6, round ends; the I is shorter than the rest,
 * the A has no crossbar and carries the drop). "plan" is set in the same
 * letters: p = stem + the n's bowl, l = a stem with an ascender (without it the
 * word read "pIan"), the same A with its drop (without it the A read Λ), n.
 *
 * Shapes are described with colour ROLES, not colours, so the React component
 * can paint them with CSS tokens and the asset script with hex values:
 *   ink    — the letters of "unica" and the outlines (dark on light, light on dark)
 *   accent — "plan", the drop, the centre piece
 *   paper  — the table top (always light, whatever the ground)
 *   detail — lines drawn ON the table (always dark, since the table is light)
 *   chair1..chair4 — the chairs, in Unica's camera colours
 * Pure: no DOM, no React — node imports it to write public/favicon.svg.
 */

const STROKE = 17.6;
const TOP = 8.8;
const BASE = 91.2;

function arc(cx, cy, r, a0, a1) {
  const at = a => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  const [x0, y0] = at(a0), [x1, y1] = at(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/* One glyph per letter: centre-line path, advance width, gap to the next. */
const GLYPHS = {
  u: { w: 91.8, gap: 13.7, d: `M8.8 ${TOP} V54.1 A37.1 37.1 0 0 0 83 54.1 V${TOP}` },
  n: { w: 90.5, gap: 16.4, d: `M8.8 ${BASE} V45.3 A36.45 36.45 0 0 1 81.7 45.3 V${BASE}` },
  i: { w: 17.8, gap: 15, d: `M8.9 17 V${BASE}` },
  c: { w: 87.7, gap: 9.6, d: arc(50.5, 50.5, 41.7, 43, 317) },
  a: { w: 105.5, gap: 14, d: `M8.8 ${BASE} L55.3 14 L96.8 ${BASE}`, drop: true },
  p: { w: 90.5, gap: 14, d: `M8.8 ${TOP} V128 M8.8 50 A36.45 36.45 0 1 1 81.7 50 A36.45 36.45 0 1 1 8.8 50` },
  l: { w: 17.8, gap: 14, d: `M8.9 -16 V${BASE}` },
};

const DROP = "M37.5 62 C 40 54, 50 53.5, 55 59 L 82.5 82.3 L 47 82.6 C 38 82.6, 34.5 70, 37.5 62 Z";
const HIGHLIGHT = "M47 61 C 51 58, 55 60, 59 64 C 55 63, 51 63, 47 61 Z";

/* A word as shapes, starting at x0. In "unica" the drop is the accent with an
   ink outline and a white highlight, as in Unica's logo; in "plan" (already
   the accent) the drop takes the ink colour so the A still reads as an A. */
function word(text, role, x0, dropRole) {
  const shapes = [];
  let x = x0;
  for (const ch of text) {
    const g = GLYPHS[ch];
    shapes.push({ tag: "path", d: g.d, x, stroke: role, strokeWidth: STROKE });
    if (g.drop) {
      if (dropRole === "accent") {
        shapes.push({ tag: "path", d: DROP, x, fill: "accent", stroke: role, strokeWidth: 2.2 });
        shapes.push({ tag: "path", d: HIGHLIGHT, x, fill: "white" });
      } else {
        shapes.push({ tag: "path", d: DROP, x, fill: dropRole });
      }
    }
    x += g.w + g.gap;
  }
  const lastGap = GLYPHS[text[text.length - 1]].gap;
  return { shapes, width: x - x0 - lastGap };
}

/* The table, centred on 0,0, about 150 units across. */
function table() {
  const shapes = [];
  const chairs = ["chair1", "chair2", "chair3", "chair4", "chair2", "chair3"];
  for (let k = 0; k < 6; k++) {
    const rot = k * 60;
    shapes.push({ tag: "rect", x: -15, y: -66, width: 30, height: 24, rx: 6, fill: chairs[k], stroke: "ink", strokeWidth: 5, rotate: rot });
    shapes.push({ tag: "rect", x: -17, y: -72, width: 34, height: 9, rx: 4.5, fill: chairs[k], stroke: "ink", strokeWidth: 5, rotate: rot });
  }
  shapes.push({ tag: "circle", cx: 0, cy: 0, r: 40, fill: "paper", stroke: "ink", strokeWidth: 5 });
  for (let k = 0; k < 6; k++) {
    const a = (k * 60 - 90) * Math.PI / 180;
    shapes.push({ tag: "circle", cx: +(27 * Math.cos(a)).toFixed(2), cy: +(27 * Math.sin(a)).toFixed(2), r: 7, fill: "none", stroke: "detail", strokeWidth: 3.5 });
  }
  shapes.push({ tag: "circle", cx: 0, cy: 0, r: 9, fill: "accent", stroke: "detail", strokeWidth: 5 });
  return shapes;
}

/* The full logo: table above, "unica", "plan" under it. */
export function stackedLogo() {
  const unica = word("unica", "ink", 0, "accent");
  const planScale = 0.62;
  const plan = word("plan", "accent", 0, "ink");
  const centre = unica.width / 2;
  return {
    viewBox: `-10 -150 ${(unica.width + 20).toFixed(1)} 372`,
    groups: [
      { transform: `translate(${centre.toFixed(2)} -82) scale(0.85)`, shapes: table() },
      { transform: "", shapes: unica.shapes },
      { transform: `translate(${((unica.width - plan.width * planScale) / 2).toFixed(2)} 128) scale(${planScale})`, shapes: plan.shapes },
    ],
  };
}

/* The table alone — the app bar on a phone, the browser tab, the home screen. */
export function markLogo() {
  return { viewBox: "-80 -80 160 160", groups: [{ transform: "", shapes: table() }] };
}

/* Serialise to an SVG string with concrete colours (for the static assets). */
export function toSvgString(logo, colours, { width, height, background } = {}) {
  const [vx, vy, vw, vh] = logo.viewBox.split(" ").map(Number);
  const paint = role => (role === "none" ? "none" : colours[role] || role);
  const attrs = s => {
    const a = [];
    if (s.fill) a.push(`fill="${paint(s.fill)}"`); else a.push('fill="none"');
    if (s.stroke) a.push(`stroke="${paint(s.stroke)}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`);
    const t = [s.x != null && s.tag === "path" ? `translate(${s.x.toFixed(2)} 0)` : "", s.rotate ? `rotate(${s.rotate})` : ""].filter(Boolean).join(" ");
    if (t) a.push(`transform="${t}"`);
    return a.join(" ");
  };
  const shape = s => s.tag === "path" ? `<path d="${s.d}" ${attrs(s)}/>`
    : s.tag === "circle" ? `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" ${attrs(s)}/>`
    : `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${s.rx}" ${attrs({ ...s, x: null })}/>`;
  const body = logo.groups.map(g => `<g${g.transform ? ` transform="${g.transform}"` : ""}>${g.shapes.map(shape).join("")}</g>`).join("");
  const bg = background ? `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${background}"/>` : "";
  const size = (width ? ` width="${width}"` : "") + (height ? ` height="${height}"` : "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo.viewBox}"${size}>${bg}${body}</svg>`;
}
