import styles from "./CapBar.module.css";

export default function CapBar({ filled, capacity, isOver }) {
  const pct  = Math.min(filled / capacity, 1) * 100;
  const full = !isOver && capacity > 0 && filled >= capacity;
  // Teal while filling, coral at exactly full (the celebratory beat), red if over.
  const color = isOver ? "var(--red)" : full ? "var(--cta)" : "var(--accent)";
  return (
    <div className={styles.wrap}>
      <div className={styles.fill} style={{ width: pct + "%", background: color }} />
    </div>
  );
}
