import SectionMark from "./SectionMark.jsx";
import styles from "./EmptyState.module.css";

/**
 * Polished empty-state placeholder.
 *
 * @param {string} mark   — SectionMark key. An empty screen is the ONE place a
 *                          section is nothing but its own identity, so it gets
 *                          the section's own drawing at size, on the same tile
 *                          the page head uses.
 * @param {string} icon   — line icon, for states that are not a whole section
 *                          ("no results for this filter" is not a section)
 * @param {string} title  — short heading
 * @param {string} text   — guiding sentence
 * @param {{label:string,onClick:Function}} [action] — optional primary CTA
 */
export default function EmptyState({ mark, icon, title, text, action }) {
  return (
    <div className={styles.empty}>
      {mark
        ? <SectionMark name={mark} size={34} tile className={styles.emptyMark} />
        : <div className={styles.emptyIcon} aria-hidden="true">{icon}</div>}
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
