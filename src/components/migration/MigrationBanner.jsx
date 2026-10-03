import { MIGRATION_STATUS } from "../../hooks/useMigration.js";
import styles from "./MigrationBanner.module.css";
import Icon from "../ui/Icon.jsx";

export default function MigrationBanner({ migration }) {
  const { status, progress, error, migrate, dismiss, unsyncedCount, draftNames = [] } = migration;

  if (status === MIGRATION_STATUS.MIGRATING) {
    const pct = progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;
    return (
      <div className={styles.banner} role="status">
        <div className={styles.row}>
          <span className={styles.icon} aria-hidden="true"><Icon name="cloud" size={17} /></span>
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
          <span className={styles.iconError} aria-hidden="true"><Icon name="alert" size={17} /></span>
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

  // Drafts made on this browser without an account (33d). They are NAMED, so
  // whoever signed in can tell whether they are theirs — on a shared computer
  // they may well not be — and declining leaves them where they were.
  if (draftNames.length > 0) {
    const shown = draftNames.slice(0, 3).map(n => `"${n}"`).join(", ");
    const more  = draftNames.length > 3 ? ` ועוד ${draftNames.length - 3}` : "";
    return (
      <div className={styles.banner} role="region" aria-label="אירועים שנוצרו בלי חשבון">
        <div className={styles.row}>
          <span className={styles.icon} aria-hidden="true"><Icon name="cloud" size={17} /></span>
          <div className={styles.body}>
            <span className={styles.title}>
              {draftNames.length === 1 ? "נמצא במכשיר הזה אירוע שנוצר בלי חשבון" : "נמצאו במכשיר הזה אירועים שנוצרו בלי חשבון"}
            </span>
            <span className={styles.sub}>
              {shown}{more}.{" "}
              {draftNames.length === 1
                ? "שלכם? צרפו אותו לחשבון והוא יישמר בענן. אם לא — הוא יישאר במכשיר, בלי חשבון."
                : "שלכם? צרפו אותם לחשבון והם יישמרו בענן. אם לא — הם יישארו במכשיר, בלי חשבון."}
            </span>
          </div>
          <div className={styles.actions}>
            <button className={styles.skipBtn}    onClick={dismiss}>לא שלי</button>
            <button className={styles.migrateBtn} onClick={migrate}>צרפו לחשבון ←</button>
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
        <span className={styles.icon} aria-hidden="true"><Icon name="cloud" size={17} /></span>
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
