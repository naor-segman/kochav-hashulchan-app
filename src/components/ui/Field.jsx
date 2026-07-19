import styles from "./Field.module.css";

export default function Field({ label, required, hint, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
        {hint && <span className={styles.labelHint}> — {hint}</span>}
      </label>
      {children}
    </div>
  );
}
