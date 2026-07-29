import styles from "./StatPill.module.css";

/**
 * `primary` marks the ONE number on the screen that answers the question the
 * host came with. It takes the blush ground — the surface this system uses
 * when something must be looked at without spending the accent — so a row of
 * six equal boxes gains a place for the eye to land. One per screen; a second
 * one is two, which is none.
 */
export default function StatPill({ n, label, color, primary = false }) {
  return (
    <div className={[styles.pill, primary ? styles.pillPrimary : ""].filter(Boolean).join(" ")}>
      <span className={styles.pillN} style={color ? { color } : undefined}>{n}</span>
      <span className={styles.pillL}>{label}</span>
    </div>
  );
}
