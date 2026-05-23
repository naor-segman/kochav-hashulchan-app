import styles from "./CapBar.module.css";

export default function CapBar({ filled, capacity, isOver }) {
  const pct   = Math.min(filled / capacity, 1) * 100;
  const color = isOver ? "var(--red)" : pct > 85 ? "var(--warn)" : "var(--green)";
  return (
    <div className={styles.wrap}>
      <div className={styles.fill} style={{ width: pct + "%", background: color }} />
    </div>
  );
}
