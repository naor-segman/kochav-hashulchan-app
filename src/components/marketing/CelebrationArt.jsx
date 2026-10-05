import styles from "./CelebrationArt.module.css";

/**
 * One drawing per kind of celebration (136 — owner 5.10: "תמונות מרגשות,
 * אלמנטים מתאימים, לא גנרי ויבש"). Drawn in the same hand as SectionMark —
 * ink line, blush plate, one accent — so the page reads as one illustrator.
 * Placeholders for real photographs from Unica's events if the owner sends
 * them; until then these carry the feeling without stock photos.
 */
const Spark = ({ x, y, s = 1 }) => (
  <path className={styles.spark} transform={`translate(${x} ${y}) scale(${s})`}
        d="M0-7 C1-2 2-1 7 0 C2 1 1 2 0 7 C-1 2 -2 1 -7 0 C-2-1 -1-2 0-7Z" />
);

const ART = {
  wedding: (
    <>
      <circle className={styles.ringInk} cx="48" cy="72" r="24" />
      <circle className={styles.ringLive} cx="72" cy="72" r="24" />
      <path className={styles.plate} d="M38 38 L48 26 L58 38 L48 50 Z" />
      <path className={styles.line} d="M38 38 H58 M44 38 L48 50 M52 38 L48 50" />
      <Spark x={86} y={30} /><Spark x={24} y={44} s={.7} />
    </>
  ),
  mitzvah: (
    <>
      <path className={styles.plate} d="M60 18 L95 78 H25 Z" />
      <path className={styles.lineLive} d="M60 102 L25 42 H95 Z" />
      <circle className={styles.live} cx="60" cy="60" r="6" />
      <Spark x={98} y={24} /><Spark x={20} y={96} s={.7} />
    </>
  ),
  brit: (
    <>
      <path className={styles.plate} d="M40 30 L52 24 Q60 33 68 24 L80 30 L95 45 L85 56 L78 49 L78 92 Q60 101 42 92 L42 49 L35 56 L25 45 Z" />
      <path className={styles.live} d="M60 70 C55 63 45 67 50 75 L60 84 L70 75 C75 67 65 63 60 70 Z" />
      <Spark x={96} y={22} /><Spark x={22} y={92} s={.7} />
    </>
  ),
  henna: (
    <>
      <rect className={styles.plate} x="37" y="22" width="11" height="40" rx="5.5" />
      <rect className={styles.plate} x="50" y="16" width="11" height="42" rx="5.5" />
      <rect className={styles.plate} x="63" y="18" width="11" height="42" rx="5.5" />
      <rect className={styles.plate} x="76" y="26" width="10" height="36" rx="5" />
      <rect className={styles.plate} x="20" y="58" width="11" height="30" rx="5.5" transform="rotate(-38 26 73)" />
      <rect className={styles.plate} x="34" y="48" width="54" height="56" rx="20" />
      <circle className={styles.live} cx="61" cy="76" r="7" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
        <circle key={a} className={styles.dot} cx={61 + 14 * Math.cos(a * Math.PI / 180)} cy={76 + 14 * Math.sin(a * Math.PI / 180)} r="2.6" />
      ))}
      <Spark x={100} y={30} s={.8} />
    </>
  ),
  business: (
    <>
      <path className={styles.lineLive} d="M46 8 L56 40 M74 8 L64 40" />
      <rect className={styles.plate} x="34" y="38" width="52" height="66" rx="5" />
      <rect className={styles.paper} x="52" y="45" width="16" height="5" rx="2" />
      <circle className={styles.live} cx="60" cy="66" r="10" />
      <path className={styles.line} d="M46 86 H74 M51 95 H69" />
      <Spark x={98} y={34} s={.8} />
    </>
  ),
  birthday: (
    <>
      <path className={styles.line} d="M16 102 H104" />
      <rect className={styles.plate} x="24" y="64" width="72" height="36" rx="4" />
      <path className={styles.lineLive} d="M24 74 q9 8 18 0 t18 0 t18 0 t18 0" />
      <rect className={styles.paper} x="36" y="48" width="48" height="16" rx="3" />
      {[46, 58, 70].map(x => (
        <g key={x}>
          <rect className={styles.live} x={x} y="30" width="4" height="18" rx="1" />
          <path className={styles.flame} d={`M${x + 2} 18 C${x + 7} 24 ${x + 6} 29 ${x + 2} 29 C${x - 2} 29 ${x - 3} 24 ${x + 2} 18 Z`} />
        </g>
      ))}
      <Spark x={100} y={30} s={.8} /><Spark x={18} y={40} s={.6} />
    </>
  ),
};

export default function CelebrationArt({ kind, className = "" }) {
  return (
    <svg viewBox="0 0 120 120" className={[styles.art, className].filter(Boolean).join(" ")} aria-hidden="true" focusable="false">
      {ART[kind]}
    </svg>
  );
}
