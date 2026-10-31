import styles from "./Illustration.module.css";

/* The illustration set (136 stage A; owner, 31.10: palette A, the twelve
 * drawings and the line exactly as proposed on 19.10).
 *
 * Drawn in the logo's own manner: flat colour, a thick round ink outline, and
 * the logo's table as the first drawing. Colours are ROLES painted by the CSS
 * module from tokens — ink, paper, the three logo colours and the accent — so
 * the set moves with the palette. Decorative only: every place that shows one
 * also has a heading that says the same thing, so the SVG is aria-hidden.
 */

const CHAIR_ROLES = ["a", "b", "c", "p", "b", "c"];

const R = {
  ink: styles.ink, thin: styles.thin, paper: styles.paper,
  a: styles.fa, b: styles.fb, c: styles.fc, p: styles.fp, none: styles.none,
};
const cx = (...k) => k.map(x => R[x]).join(" ");

function Table() {
  return (
    <g transform="translate(48 48) scale(.56)">
      <g className={R.ink} style={{ strokeWidth: 5 }}>
        {CHAIR_ROLES.map((role, k) => (
          <g key={k} transform={`rotate(${k * 60})`}>
            <rect x="-15" y="-66" width="30" height="24" rx="6" className={R[role]} />
            <rect x="-17" y="-72" width="34" height="9" rx="4.5" className={R[role]} />
          </g>
        ))}
        <circle r="40" className={R.paper} />
        <circle r="9" className={R.p} />
      </g>
      <g className={cx("ink", "none")} style={{ strokeWidth: 3.5 }}>
        {[0, 1, 2, 3, 4, 5].map(k => {
          const a = (k * 60 - 90) * Math.PI / 180;
          return <circle key={k} cx={+(27 * Math.cos(a)).toFixed(2)} cy={+(27 * Math.sin(a)).toFixed(2)} r="7" />;
        })}
      </g>
    </g>
  );
}

const heart = (x, y, s = 1) =>
  `M${x} ${y + 9.5 * s} C ${x - 10 * s} ${y + 1.5 * s}, ${x - 8 * s} ${y - 8.5 * s}, ${x} ${y - 3.5 * s} C ${x + 8 * s} ${y - 8.5 * s}, ${x + 10 * s} ${y + 1.5 * s}, ${x} ${y + 9.5 * s} Z`;

const Glass = ({ x, fill, tilt }) => (
  <g transform={`translate(${x} 28) rotate(${tilt} 13 20)`}>
    <path className={R.paper} d="M0 0 H26 C26 16 21 25 13 25 C5 25 0 16 0 0 Z" />
    <path className={cx(fill, "thin")} d="M2.5 9 H23.5 C22.5 17 19 22 13 22 C7 22 3.5 17 2.5 9 Z" />
    <path className={R.none} d="M13 25 V46 M4 47 H22" />
  </g>
);

const DRAWINGS = {
  table: Table,

  chair: () => (
    <g className={R.ink}>
      <path className={R.none} d="M33 58 V86 M63 58 V86 M33 74 H63" />
      <rect x="30" y="12" width="36" height="38" rx="5" className={R.a} />
      <rect x="36" y="18" width="24" height="26" rx="3" className={cx("paper", "thin")} />
      <rect x="25" y="48" width="46" height="11" rx="3" className={R.b} />
      <path className={cx("p", "thin")} d={heart(48, 28.5, 0.75)} />
    </g>
  ),

  envelope: () => (
    <g className={R.ink}>
      <rect x="18" y="16" width="60" height="40" className={cx("b", "thin")} />
      <path className={cx("none", "thin")} d="M27 28 H69 M27 36 H57" />
      <path className={R.paper} d="M12 34 L48 58 L84 34 V80 H12 Z" />
      <path className={R.none} d="M12 80 L40 56 M84 80 L56 56" />
      <path className={R.p} d={heart(48, 57.5)} />
    </g>
  ),

  chuppah: () => (
    <g className={R.ink}>
      <path className={R.none} d="M22 36 V84 M74 36 V84 M10 85 H86" />
      <path className={R.a} d="M14 28 H82 L78 42 Q70 36 62 42 Q55 36 48 42 Q41 36 34 42 Q26 36 18 42 Z" />
      <circle cx="18" cy="26" r="6" className={R.p} />
      <circle cx="78" cy="26" r="6" className={R.p} />
      <circle cx="48" cy="22" r="5" className={R.b} />
      <path className={cx("c", "thin")} d="M40 84 V70 Q48 62 56 70 V84 Z" />
    </g>
  ),

  glasses: () => (
    <g className={R.ink}>
      <Glass x={18} fill="p" tilt={-14} />
      <Glass x={52} fill="b" tilt={14} />
      <path className={cx("none", "thin")} d="M48 8 V16 M38 12 L42 18 M58 12 L54 18" />
    </g>
  ),

  gift: () => (
    <g className={R.ink}>
      <rect x="20" y="44" width="56" height="38" className={R.a} />
      <rect x="15" y="32" width="66" height="13" className={R.b} />
      <rect x="42" y="32" width="12" height="50" className={cx("p", "thin")} />
      <path className={R.p} d="M48 32 C 35 16, 24 30, 48 32 Z M48 32 C 61 16, 72 30, 48 32 Z" />
    </g>
  ),

  calendar: () => (
    <g className={R.ink}>
      <rect x="16" y="20" width="64" height="62" className={R.paper} />
      <rect x="16" y="20" width="64" height="16" className={R.a} />
      <path className={R.none} d="M32 13 V27 M64 13 V27" />
      <g className={cx("b", "thin")}>
        <rect x="25" y="45" width="9" height="8" /><rect x="38" y="45" width="9" height="8" />
        <rect x="51" y="45" width="9" height="8" /><rect x="64" y="45" width="7" height="8" />
        <rect x="25" y="60" width="9" height="8" /><rect x="38" y="60" width="9" height="8" />
      </g>
      <path className={cx("p", "thin")} d={heart(60, 66.5, 0.8)} />
    </g>
  ),

  list: () => (
    <g className={R.ink}>
      <rect x="20" y="16" width="56" height="70" className={R.b} />
      <rect x="27" y="26" width="42" height="53" className={R.paper} />
      <rect x="37" y="10" width="22" height="11" className={R.a} />
      <circle cx="36" cy="40" r="4" className={cx("p", "thin")} /><path className={cx("none", "thin")} d="M45 40 H61" />
      <circle cx="36" cy="53" r="4" className={cx("a", "thin")} /><path className={cx("none", "thin")} d="M45 53 H58" />
      <circle cx="36" cy="66" r="4" className={cx("c", "thin")} /><path className={cx("none", "thin")} d="M45 66 H62" />
    </g>
  ),

  phone: () => (
    <g className={R.ink}>
      <rect x="27" y="8" width="42" height="80" rx="7" className={R.paper} />
      <path className={cx("none", "thin")} d="M42 15 H54" />
      <rect x="33" y="24" width="27" height="13" rx="3" className={cx("b", "thin")} />
      <rect x="33" y="41" width="27" height="7" rx="2" className={cx("p", "thin")} />
      <rect x="33" y="51" width="27" height="7" rx="2" className={cx("paper", "thin")} />
      <rect x="39" y="64" width="24" height="12" rx="3" className={cx("a", "thin")} />
      <path className={cx("none", "thin")} d="M45 70 L48 73 L55 66" />
    </g>
  ),

  placecard: () => (
    <g className={R.ink}>
      <path className={R.a} d="M28 30 H68 L62 18 H34 Z" />
      <path className={R.paper} d="M18 76 L28 30 H68 L78 76 Z" />
      <circle cx="48" cy="48" r="7" className={cx("p", "thin")} />
      <path className={cx("b", "thin")} d="M41 48 C 34 44, 32 50, 36 54 C 39 53, 41 51, 41 48 Z M55 48 C 62 44, 64 50, 60 54 C 57 53, 55 51, 55 48 Z" />
      <path className={cx("none", "thin")} d="M36 64 H60" />
      <path className={R.none} d="M12 80 H84" />
    </g>
  ),

  camera: () => (
    <g className={R.ink}>
      <rect x="34" y="20" width="24" height="12" rx="2" className={R.b} />
      <rect x="12" y="30" width="72" height="50" rx="5" className={R.a} />
      <circle cx="48" cy="55" r="17" className={R.paper} />
      <circle cx="48" cy="55" r="8" className={R.p} />
      <rect x="68" y="37" width="9" height="7" className={cx("c", "thin")} />
    </g>
  ),

  tasks: () => (
    <g className={R.ink}>
      <rect x="20" y="12" width="56" height="74" className={R.paper} />
      <rect x="29" y="25" width="11" height="11" className={cx("a", "thin")} />
      <path className={cx("none", "thin")} d="M31 30.5 L34 33.5 L39 27 M47 30.5 H66" />
      <rect x="29" y="44" width="11" height="11" className={cx("b", "thin")} />
      <path className={cx("none", "thin")} d="M31 49.5 L34 52.5 L39 46 M47 49.5 H62" />
      <rect x="29" y="63" width="11" height="11" className={cx("paper", "thin")} />
      <path className={cx("none", "thin")} d="M47 68.5 H64" />
      <path className={cx("p", "thin")} d={heart(70, 76.5, 0.8)} />
    </g>
  ),
};

export default function Illustration({ name, size = 112, className }) {
  const Drawing = DRAWINGS[name];
  if (!Drawing) return null;
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} aria-hidden="true" focusable="false"
         className={[styles.art, className].filter(Boolean).join(" ")} data-illustration={name}>
      <Drawing />
    </svg>
  );
}
