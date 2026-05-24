import { useState, useEffect } from "react";
import styles from "./SuggestionsPanel.module.css";

const SEVERITY_ICON = { critical: "🔴", warning: "⚡", info: "💡" };
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

function hasCriticalOrWarning(suggestions) {
  return suggestions.some(s => s.severity === "critical" || s.severity === "warning");
}

export default function SuggestionsPanel({ suggestions }) {
  const [open, setOpen] = useState(() => hasCriticalOrWarning(suggestions));

  // Auto-open when new critical/warning suggestions appear
  useEffect(() => {
    if (hasCriticalOrWarning(suggestions)) setOpen(true);
  }, [suggestions]);

  if (!suggestions) return null;

  const criticalCount = suggestions.filter(s => s.severity === "critical").length;
  const warningCount  = suggestions.filter(s => s.severity === "warning").length;

  const countLabel = suggestions.length === 0
    ? "הכל תקין"
    : suggestions.length === 1
    ? "המלצה אחת"
    : `${suggestions.length} המלצות`;

  return (
    <div className={styles.panel}>
      <button
        className={styles.toggle}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <div className={styles.toggleLeft}>
          <span className={styles.toggleIcon}>✦</span>
          <span className={styles.toggleTitle}>הצעות חכמות</span>
          <span
            className={[
              styles.toggleBadge,
              criticalCount > 0 ? styles.toggleBadgeCrit :
              warningCount  > 0 ? styles.toggleBadgeWarn :
              suggestions.length === 0 ? styles.toggleBadgeOk : styles.toggleBadgeInfo,
            ].join(" ")}
          >
            {countLabel}
          </span>
        </div>
        <span className={styles.toggleChevron} aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className={styles.body}>
          {suggestions.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>✓</span>
              <span>לא נמצאו המלצות — ההושבה נראית תקינה.</span>
            </div>
          ) : (
            <ul className={styles.list}>
              {suggestions.map((s, i) => (
                <li
                  key={i}
                  className={[styles.row, styles["row_" + s.severity]].join(" ")}
                >
                  <span className={styles.rowIcon} aria-hidden="true">
                    {SEVERITY_ICON[s.severity]}
                  </span>
                  <div className={styles.rowContent}>
                    <span className={styles.rowText}>{s.text}</span>
                    {s.action && (
                      <span className={styles.rowAction}>{s.action}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.disclaimer}>
            ההצעות הן מידע בלבד — אין שינוי אוטומטי בהושבה.
          </p>
        </div>
      )}
    </div>
  );
}
