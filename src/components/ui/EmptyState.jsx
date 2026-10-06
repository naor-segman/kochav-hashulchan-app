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
 * @param {import("react").ReactNode} [art] — a drawing of what will be here
 *                          (136 stage D, "מצבים ריקים עם אופי"): the tables
 *                          screen draws empty tables. Decorative; replaces the
 *                          mark when given.
 */
export default function EmptyState({ mark, icon, title, text, action, art }) {
  return (
    <div className={styles.empty}>
      {art
        ? <div className={styles.emptyArt} aria-hidden="true">{art}</div>
        : mark
        ? <SectionMark name={mark} size={34} tile className={styles.emptyMark} />
        : <div className={styles.emptyIcon} aria-hidden="true">{icon}</div>}
      {title && <h2 className={styles.emptyTitle}>{title}</h2>}
      {text && <p className={styles.emptyText}>{text}</p>}
      {action && (
        <button className={styles.emptyAction} onClick={action.onClick} type="button">
          {action.label}
        </button>
      )}
    </div>
  );
}
