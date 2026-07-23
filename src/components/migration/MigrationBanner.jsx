import { MIGRATION_STATUS } from "../../hooks/useMigration.js";
import styles from "./MigrationBanner.module.css";

export default function MigrationBanner({ migration }) {
  const { status, progress, error, migrate, dismiss, unsyncedCount } = migration;

  if (status === MIGRATION_STATUS.MIGRATING) {
    const pct = progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;
    return (
      <div className={styles.banner} role="status">
        <div className={styles.row}>
          <span className={styles.icon} aria-hidden="true">☁</span>
          <div className={styles.body}>
            <span className={styles.title}>מייבא אירועים לחשבון…</span>
            <span className={styles.sub}>{progress.done} מתוך {progress.total}</span>
          </div>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: pct + "%" }} />
        </div>
      </div>
    );
  }

  if (status === MIGRATION_STATUS.SUCCESS) {
    return (
      <div className={[styles.banner, styles.bannerSuccess].join(" ")} role="status">
        <div className={styles.row}>
          <span className={styles.iconSuccess} aria-hidden="true">✓</span>
          <span className={styles.title}>
            {progress.total} {progress.total === 1 ? "אירוע יובא" : "אירועים יובאו"} בהצלחה לחשבון שלכם
          </span>
          <button className={styles.closeBtn} onClick={dismiss} aria-label="סגרו">✕</button>
        </div>
      </div>
    );
  }

  if (status === MIGRATION_STATUS.FAILED) {
    return (
      <div className={[styles.banner, styles.bannerError].join(" ")} role="alert">
        <div className={styles.row}>
          <span className={styles.iconError} aria-hidden="true">⚠</span>
          <div className={styles.body}>
            <span className={styles.title}>הייבוא נכשל</span>
            {error && <span className={styles.sub}>{error}</span>}
          </div>
          <div className={styles.actions}>
            <button className={styles.skipBtn}    onClick={dismiss}>דלגו</button>
            <button className={styles.migrateBtn} onClick={migrate}>נסו שוב</button>
          </div>
        </div>
      </div>
    );
  }

  // Default: idle prompt
  const countLabel = unsyncedCount === 1
    ? "אירוע מקומי אחד"
    : `${unsyncedCount} אירועים מקומיים`;

  return (
    <div className={styles.banner} role="region" aria-label="ייבוא אירועים מקומיים">
      <div className={styles.row}>
        <span className={styles.icon} aria-hidden="true">☁</span>
        <div className={styles.body}>
          <span className={styles.title}>נמצאו אירועים מקומיים במכשיר הזה</span>
          <span className={styles.sub}>
            נמצא {countLabel} — ניתן לייבא לחשבון שלכם ולשמור בענן.
          </span>
        </div>
        <div className={styles.actions}>
          <button className={styles.skipBtn}    onClick={dismiss}>דלגו לעכשיו</button>
          <button className={styles.migrateBtn} onClick={migrate}>ייבאו אירועים ←</button>
        </div>
      </div>
    </div>
  );
}
