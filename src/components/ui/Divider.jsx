import styles from "./Divider.module.css";

export default function Divider({ label }) {
  return (
    <div className={styles.divider}>
      <div className={styles.line} />
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.line} />
    </div>
  );
}
