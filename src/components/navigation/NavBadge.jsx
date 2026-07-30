import styles from "./NavBadge.module.css";

/**
 * The count beside a nav tab.
 *
 * `tone` picks a ground/ink pair from the stylesheet. It used to take a raw
 * `color` and build `{ background: color + "22" }` — with the caller passing
 * `var(--red)`, that produced the literal declaration `background: var(--red)22`,
 * which is not just invalid: because the value contains var(), the property is
 * resolved at computed-value time and falls back to `unset`, i.e. TRANSPARENT,
 * rather than to the class's own background. Measured rgba(0, 0, 0, 0).
 * The result was three tinted count pills and one bare red numeral 8px away.
 */
export default function NavBadge({ n, tone }) {
  return (
    <span className={[styles.badge, tone === "danger" ? styles.badgeDanger : ""].filter(Boolean).join(" ")}>
      {n}
    </span>
  );
}
