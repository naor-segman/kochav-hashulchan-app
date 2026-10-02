import styles from "./NextStep.module.css";
import Icon from "./Icon.jsx";

export default function NextStep({ label, hint, onClick }) {
  return (
    // One per screen, so the guided tour (124) can always point at "what next".
    <div className={styles.nextBanner} data-tour="next">
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
