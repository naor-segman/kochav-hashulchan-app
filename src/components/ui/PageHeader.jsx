import SectionMark from "./SectionMark.jsx";
import styles from "./PageHeader.module.css";

/**
 * `mark` is a key from SectionMark — the section's own drawing, in a tile
 * beside the title. It is what makes a screen recognisable before the title is
 * read, and it is why fourteen screens no longer open identically.
 *
 * `icon` is the older generic-outline path and is still honoured, so a screen
 * that has not been given a mark yet keeps working.
 */
export default function PageHeader({ title, mark, icon, sub, aside }) {
  return (
    <div className={styles.pageHead}>
      {mark && <SectionMark name={mark} size={26} tile className={styles.mark} />}
      <div className={styles.titleWrap}>
        <h2 className={styles.pageTitle}>
          {!mark && icon && <><span className={styles.icon}>{icon}</span>{" "}</>}
          {title}
        </h2>
        {sub && <p className={styles.pageSub}>{sub}</p>}
      </div>
      {aside && <div className={styles.aside}>{aside}</div>}
    </div>
  );
}
