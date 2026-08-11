import styles from "./CapBar.module.css";

export default function CapBar({ filled, capacity, isOver }) {
  const pct  = Math.min(filled / capacity, 1) * 100;
  const full = !isOver && capacity > 0 && filled >= capacity;
  // Magenta while filling, deeper CTA at exactly full, red + hatch when over (the celebratory beat), red if over.
  // Hue alone no longer separates these: --red sits ΔE 34 from the magenta
  // ramp, and at 6px tall on a pale card the eye reads them as one colour.
  // Over-capacity gets a hatch as well, so the state survives being glanced at
  // — and survives a colour-blind viewer.
  const color = isOver ? "var(--red)" : full ? "var(--cta)" : "var(--accent)";
  const hatch = isOver
    ? "repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 3px, transparent 3px 7px)"
    : "none";
  return (
    <div className={styles.wrap}>
      {/* `backgroundColor`, not the `background` shorthand: the shorthand also
          resets background-image, so pairing it with `backgroundImage` in one
          style object is a conflict React warns about on every rerender — and
          whichever of the two React writes last decides whether the hatch is
          there at all. */}
      <div className={styles.fill} style={{ width: pct + "%", backgroundColor: color, backgroundImage: hatch }} />
    </div>
  );
}
