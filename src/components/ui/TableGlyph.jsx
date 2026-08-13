import styles from "./TableGlyph.module.css";
import { glyphFontSize } from "../../utils/glyphLabel.js";

/**
 * The one shape this product owns.
 *
 * Every competitor draws a generic circle for a table. This draws the table as
 * it actually is: a top, with one seat around it for every place at it. A seat
 * that is taken is filled, a free seat is a ring. So the glyph is never
 * decoration — the picture IS the occupancy, and the same primitive works at
 * 18px in a list, 90px on a card, and 260px on the venue map.
 *
 * It reads before any label does. A host scanning twenty of these sees which
 * tables are full, which are half-empty and which are over capacity without
 * reading a single number, which is exactly the question they have.
 *
 * RTL: SVG coordinates are not mirrored by dir="rtl", and that is correct here.
 * A round table has no reading direction; mirroring it would only shift where
 * the first seat sits.
 */

/** Point at t (0..1) along the perimeter of the given shape, centred on (0,0). */
function perimeterPoint(shape, t, rx, ry) {
  if (shape === "square" || shape === "rect") {
    // Walk the four edges by arc length so seats space evenly around a top
    // that is not a circle — a long table should show its long sides busier.
    const w = rx * 2, h = ry * 2;
    const per = 2 * (w + h);
    // Start at the middle of the top edge so a single seat reads as "head".
    let d = (t * per + w / 2) % per;
    if (d < w)          return [-rx + d, -ry];
    d -= w;
    if (d < h)          return [rx, -ry + d];
    d -= h;
    if (d < w)          return [rx - d, ry];
    d -= w;
    return [-rx, ry - d];
  }
  const a = t * Math.PI * 2 - Math.PI / 2;      // start at the top
  return [rx * Math.cos(a), ry * Math.sin(a)];
}

/** The small-size measure: a full track with the taken share drawn over it. */
function CompactRing({ rect, rx, ry, c, square, share }) {
  // Thin enough that a fully taken table still reads as a ring around a
  // top rather than as a solid disc — at 7 the two collapsed together.
  const common = { fill: "none", strokeWidth: 5.5, strokeLinecap: "butt" };
  if (rect) {
    const len = 2 * (rx * 2 + ry * 2);
    return (
      <>
        <rect x={c - rx} y={c - ry} width={rx * 2} height={ry * 2} rx={square ? 10 : 9}
              className={styles.ringTrack} {...common} />
        <rect x={c - rx} y={c - ry} width={rx * 2} height={ry * 2} rx={square ? 10 : 9}
              className={styles.ringFill} {...common}
              strokeDasharray={`${len * share} ${len}`} />
      </>
    );
  }
  const len = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));  // Ramanujan
  return (
    <>
      <ellipse cx={c} cy={c} rx={rx} ry={ry} className={styles.ringTrack} {...common} />
      <ellipse cx={c} cy={c} rx={rx} ry={ry} className={styles.ringFill} {...common}
               strokeDasharray={`${len * share} ${len}`}
               transform={`rotate(-90 ${c} ${c})`} />
    </>
  );
}

export default function TableGlyph({
  shape = "round",
  capacity = 10,
  taken = 0,
  size = 64,
  label,                 // optional text in the middle (usually the table number)
  animate = false,       // replay the seats filling — see runKey in SeatingScreen
  onDark = false,        // for the near-black chrome (hostess screen)
  className = "",
}) {
  const cap  = Math.max(1, Math.round(capacity) || 1);
  const full = Math.max(0, Math.round(taken) || 0);
  const over = full > cap;

  const isRect   = shape === "rect";
  const isSquare = shape === "square";
  const isOval   = shape === "oval" || shape === "ellipse";

  // The seat ring sits outside the top, so the top itself is smaller than the
  // box. Ratios chosen so a 10-seat round table reads as a table at 18px.
  const vb   = 100;
  const c    = vb / 2;
  const seatR = cap > 16 ? 4 : cap > 12 ? 4.6 : 5.2;
  const ringInset = seatR + 2;
  const rx = (isRect ? 40 : isOval ? 38 : 31) - ringInset * 0.35;
  const ry = (isRect ? 24 : isOval ? 26 : 31) - ringInset * 0.35;
  const seatRx = rx + seatR + 3.5;
  const seatRy = ry + seatR + 3.5;

  // Below ~34px individual seats collapse into an unreadable cluster of specks,
  // so the same information changes form rather than shrinking: the ring around
  // the top becomes the measure, drawn as an arc for the share that is taken.
  // One primitive, two honest renderings — a list row and a venue map are not
  // the same drawing problem.
  const compact = size < 34;

  const seats = Array.from({ length: cap }, (_, i) => {
    const [x, y] = perimeterPoint(
      isRect || isSquare ? "rect" : "ellipse",
      i / cap, seatRx, seatRy
    );
    return { x: c + x, y: c + y, on: i < full };
  });

  const topProps = { className: styles.top, strokeWidth: 2.4 };

  return (
    <svg
      viewBox={`0 0 ${vb} ${vb}`}
      width={size}
      height={size}
      className={[styles.glyph, over ? styles.over : "", onDark ? styles.onDark : "", className].filter(Boolean).join(" ")}
      role="img"
      aria-label={label
        ? `שולחן ${label} — ${full} מתוך ${cap} מקומות`
        : `${full} מתוך ${cap} מקומות`}
    >
      {isRect || isSquare ? (
        <rect x={c - rx} y={c - ry} width={rx * 2} height={ry * 2} rx={isSquare ? 8 : 7} {...topProps} />
      ) : (
        <ellipse cx={c} cy={c} rx={rx} ry={ry} {...topProps} />
      )}

      {compact ? (
        <CompactRing
          rect={isRect || isSquare}
          rx={seatRx}
          ry={seatRy}
          c={c}
          square={isSquare}
          share={Math.min(1, full / cap)}
        />
      ) : (
        seats.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={seatR}
            className={[
              s.on ? styles.seatOn : styles.seatOff,
              animate && s.on ? styles.seatArriving : "",
            ].filter(Boolean).join(" ")}
            // Staggered around the table so guests appear to take their places
            // one after another rather than blinking on together. Capped so a
            // twenty-seat table still finishes inside half a second.
            style={animate && s.on ? { animationDelay: `${Math.min(i, 14) * 28}ms` } : undefined}
          />
        ))
      )}

      {label != null && (
        // The size is computed, not fixed. The CSS `font-size: var(--step-3)`
        // is 28 user units with nothing stopping it, and a caller that passed a
        // NAME rather than a number blew the label 77 units out of each side of
        // the glyph and straight through its neighbours. A one or two character
        // label still gets exactly 28, so every screen that already uses this is
        // pixel-identical.
        <text
          x={c} y={c} className={styles.label}
          style={{ fontSize: `${glyphFontSize(String(label))}px` }}
          dominantBaseline="central" textAnchor="middle"
        >
          {label}
        </text>
      )}
    </svg>
  );
}
