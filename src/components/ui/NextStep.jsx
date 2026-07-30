import styles from "./NextStep.module.css";
import Icon from "./Icon.jsx";

export default function NextStep({ label, hint, onClick }) {
  return (
    <div className={styles.nextBanner}>
      <div>
        <div className={styles.nextLabel}>שלב הבא</div>
        {hint && <div className={styles.nextHint}>{hint}</div>}
      </div>
      <button className={styles.btn} onClick={onClick}>
        {label}
        <Icon name="arrowLeft" size={15} />
      </button>
    </div>
  );
}
