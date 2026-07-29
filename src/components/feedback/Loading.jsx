import styles from "./Loading.module.css";

/**
 * The wait, designed.
 *
 * Before this every screen wrote its own "טוען…" — a line of grey text in the
 * middle of an empty page. That tells someone the app is not broken, and
 * nothing else: not what is coming, not how much of it, not whether the page
 * they are about to see is a list or a form. On a phone on venue wifi that
 * wait is several seconds long and it is the product's first impression.
 *
 * Two forms, because there are two kinds of wait:
 *
 *   <Loading rows={4} />   — a SKELETON. Use it wherever the shape of what is
 *                            coming is already known: a list, a table, cards.
 *                            The page does not jump when the data lands,
 *                            because the space was already the right size.
 *   <Loading label="…" />  — a quiet centred block, for a whole screen whose
 *                            shape is not known until it arrives.
 *
 * The shimmer is decoration and says nothing, so `prefers-reduced-motion` gets
 * the static bars — same information, no movement.
 */
export default function Loading({ rows = 0, label = "טוען…", className = "" }) {
  if (rows > 0) {
    return (
      <div
        className={[styles.skeleton, className].filter(Boolean).join(" ")}
        role="status"
        aria-label={label}
      >
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={styles.row}>
            <span className={styles.bar} style={{ width: `${72 - (i % 3) * 14}%` }} />
            <span className={styles.barSm} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={[styles.block, className].filter(Boolean).join(" ")} role="status">
      <span className={styles.mark} aria-hidden="true">✦</span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
