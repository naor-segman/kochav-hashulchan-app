import styles from "./NextStep.module.css";

export default function NextStep({ label, hint, onClick }) {
  return (
    <div className={styles.nextBanner}>
      <div>
        <div className={styles.nextLabel}>שלב הבא</div>
        {hint && <div className={styles.nextHint}>{hint}</div>}
      </div>
      <button className={styles.btn} onClick={onClick}>{label} ←</button>
    </div>
  );
}
