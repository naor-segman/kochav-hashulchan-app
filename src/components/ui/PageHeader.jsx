import SectionMark from "./SectionMark.jsx";
import styles from "./PageHeader.module.css";

/**
 * `mark` is a key from SectionMark — the section's own drawing, in a tile
 * beside the title. It is what makes a screen recognisable before the title is
 * read, and it is why fourteen screens no longer open identically.
 *
 * `icon` is the older generic-outline path and is still honoured, so a screen
 * that has not been given a mark yet keeps working.
 *
 * The title is the page's h1: every event screen opens with this header and
 * none has another heading above it (WORKPLAN 108 — until 29.9 it was an h2
 * and sixteen screens had no h1 at all).
 */
export default function PageHeader({ title, mark, icon, sub, aside }) {
  return (
    <div className={styles.pageHead}>
      {mark && <SectionMark name={mark} size={26} tile className={styles.mark} />}
      <div className={styles.titleWrap}>
        <h1 className={styles.pageTitle}>
          {!mark && icon && <><span className={styles.icon}>{icon}</span>{" "}</>}
          {title}
        </h1>
        {sub && <p className={styles.pageSub}>{sub}</p>}
      </div>
      {aside && <div className={styles.aside}>{aside}</div>}
    </div>
  );
}
