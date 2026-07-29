import TableGlyph from "../ui/TableGlyph.jsx";
import styles from "./VenueCanvas.module.css";

/**
 * The hall, drawn from the data.
 *
 * Until now the venue map showed nothing at all until a host uploaded a
 * photograph of their floor plan — and most hosts do not have one. They have
 * tables. We already know every table's shape, capacity and occupancy, which is
 * everything needed to draw the room, so the map stops being a feature that
 * waits for a file and becomes something that is there the moment tables exist.
 *
 * It is not a replacement for the real sketch. A real sketch carries the pillars,
 * the stage and the doors, and the host can still upload one. This is the room
 * as the seating knows it: which tables, how big, how full, laid out in reading
 * order so table 1 is where a Hebrew reader starts — top right.
 */

/** Lay n tables into a landscape room: wider than tall, filled row by row. */
function grid(n) {
  const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(n * 1.7))));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

export default function VenueCanvas({ tables = [], guests = [], seating = {}, maxTables = 24 }) {
  const shown = tables.slice(0, maxTables);
  if (!shown.length) return null;

  const { cols, rows } = grid(shown.length);
  const cell = 100;
  const pad  = 34;
  const w = cols * cell + pad * 2;
  const h = rows * cell + pad * 2 + 26;      // room for the entrance strip

  const seatsAt = (tid) =>
    guests.reduce((n, g) => n + (seating[g.id] === tid ? (g.count || 1) : 0), 0);

  return (
    <figure className={styles.wrap}>
      <svg viewBox={`0 0 ${w} ${h}`} className={styles.canvas} role="img"
           aria-label={`מפת אולם משוערת — ${shown.length} שולחנות`}>
        {/* The room. A hairline and a soft ground, not a box with a border —
            it should read as a floor, which is what everything else sits on. */}
        <rect x="6" y="6" width={w - 12} height={h - 12} rx="20" className={styles.floor} />

        {/* The entrance. Every hall has one, and it is the only orientation cue
            a room drawn from data can honestly give — it tells the host which
            way they are looking at their own tables. */}
        <rect x={w / 2 - 46} y={h - 15} width="92" height="9" rx="4.5" className={styles.door} />
        <text x={w / 2} y={h - 22} className={styles.doorLabel} textAnchor="middle">כניסה</text>

        {shown.map((t, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          // RTL reading order: the first table sits top-right, like the text.
          const cx = pad + (cols - 1 - col) * cell + cell / 2;
          const cy = pad + row * cell + cell / 2;
          return (
            <g key={t.id} transform={`translate(${cx - 38} ${cy - 38})`}>
              <foreignObject width="76" height="76">
                <TableGlyph
                  shape={t.shape}
                  capacity={t.capacity}
                  taken={seatsAt(t.id)}
                  size={76}
                  label={t.name}
                />
              </foreignObject>
            </g>
          );
        })}
      </svg>

      <figcaption className={styles.caption}>
        פריסה משוערת לפי השולחנות שהגדרתם
        {tables.length > shown.length && ` · מוצגים ${shown.length} מתוך ${tables.length}`}
        {" · "}
        <span className={styles.captionQuiet}>העלו סקיצה של האולם כדי למקם אותם במקומות האמיתיים</span>
      </figcaption>
    </figure>
  );
}
