import styles from "./StatPill.module.css";

export default function StatPill({ n, label, color }) {
  return (
    <div className={styles.pill}>
      <span className={styles.pillN} style={color ? { color } : undefined}>{n}</span>
      <span className={styles.pillL}>{label}</span>
    </div>
  );
}
