import styles from "./EmptyState.module.css";

/**
 * Polished empty-state placeholder.
 *
 * @param {string} icon   — emoji/glyph shown in a soft accent circle
 * @param {string} title  — short heading
 * @param {string} text   — guiding sentence
 * @param {{label:string,onClick:Function}} [action] — optional primary CTA
 */
export default function EmptyState({ icon, title, text, action }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon} aria-hidden="true">{icon}</div>
      {title && <h3 className={styles.emptyTitle}>{title}</h3>}
      {text && <p className={styles.emptyText}>{text}</p>}
      {action && (
        <button className={styles.emptyAction} onClick={action.onClick} type="button">
          {action.label}
        </button>
      )}
    </div>
  );
}
