import { useState, useEffect } from "react";
import styles from "./SuggestionsPanel.module.css";

const SEVERITY_ICON  = { critical: "🔴", warning: "⚡", info: "💡" };
const GROUP_LABEL    = { critical: "בעיות קריטיות", warning: "דורש תשומת לב", info: "המלצות לשיפור" };
const GROUP_ICON     = { critical: "🔴", warning: "⚡", info: "💡" };

function hasCriticalOrWarning(suggestions) {
  return suggestions.some(s => s.severity === "critical" || s.severity === "warning");
}

function scoreColorClass(score) {
  if (score === null) return "";
  if (score >= 80) return styles.scoreGood;
  if (score >= 60) return styles.scoreWarn;
  return styles.scoreBad;
}

/**
 * @param {object[]}    suggestions   Output of generateSuggestions()
 * @param {number|null} [qualityScore] Output of computeQualityScore()
 * @param {function}    [onApply]      Called with suggestion when "החל" is clicked
 */
export default function SuggestionsPanel({ suggestions, qualityScore = null, onApply }) {
  const [open, setOpen] = useState(() => hasCriticalOrWarning(suggestions));

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

  // Build groups — only the severities that have items
  const groups = ["critical", "warning", "info"]
    .map(sev => ({ sev, items: suggestions.filter(s => s.severity === sev) }))
    .filter(g => g.items.length > 0);

  return (
    <div className={styles.panel}>
      {/* ── Toggle header ── */}
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
          {qualityScore !== null && (
            <span className={[styles.scoreChip, scoreColorClass(qualityScore)].join(" ")}>
              ציון {qualityScore}/100
            </span>
          )}
        </div>
        <span className={styles.toggleChevron} aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* ── Body ── */}
      {open && (
        <div className={styles.body}>
          {suggestions.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>✓</span>
              <span>לא נמצאו המלצות — ההושבה נראית תקינה.</span>
            </div>
          ) : (
            groups.map(({ sev, items }) => (
              <div key={sev} className={styles.group}>
                {/* Section header */}
                <div className={[styles.groupHeader, styles["groupHeader_" + sev]].join(" ")}>
                  <span className={styles.groupIcon} aria-hidden="true">{GROUP_ICON[sev]}</span>
                  <span className={styles.groupLabel}>{GROUP_LABEL[sev]}</span>
                  <span className={styles.groupCount}>{items.length}</span>
                </div>

                {/* Suggestion rows */}
                <ul className={styles.list}>
                  {items.map(s => (
                    <li
                      key={s.id}
                      className={[styles.row, styles["row_" + s.severity]].join(" ")}
                    >
                      <span className={styles.rowIcon} aria-hidden="true">
                        {SEVERITY_ICON[s.severity]}
                      </span>
                      <div className={styles.rowContent}>
                        <span className={styles.rowText}>{s.explanation}</span>
                        {s.whyMatters && (
                          <span className={styles.rowWhy}>{s.whyMatters}</span>
                        )}
                        {s.recommendedAction && (
                          <span className={styles.rowAction}>{s.recommendedAction}</span>
                        )}
                      </div>
                      {s.canApply && onApply && (
                        <button
                          className={styles.applyBtn}
                          onClick={() => onApply(s)}
                          title="החל פעולה זו (תוצג בקשת אישור לפני הביצוע)"
                        >
                          החל
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          <p className={styles.disclaimer}>
            ההצעות הן מידע בלבד — כל החלה מצריכה אישורך.
          </p>
        </div>
      )}
    </div>
  );
}
