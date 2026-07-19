import styles from "./EmptyState.module.css";

export default function EmptyState({ icon, title, text }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>{icon}</div>
      {title && <h3 className={styles.emptyTitle}>{title}</h3>}
      <p className={styles.emptyText}>{text}</p>
    </div>
  );
}
