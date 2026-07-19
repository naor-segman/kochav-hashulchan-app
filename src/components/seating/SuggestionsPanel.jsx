import { useState, useEffect } from "react";
import styles from "./SuggestionsPanel.module.css";

const SEVERITY_ICON = { critical: "🔴", warning: "⚡", info: "💡" };

const SECTION_META = {
  critical:      { label: "בעיות קריטיות",       icon: "🔴", style: "critical" },
  fixes:         { label: "תיקונים מוצעים",       icon: "⚡", style: "fixes"    },
  opportunities: { label: "הזדמנויות לשיפור",    icon: "💡", style: "opportunities" },
};

// Derive section for suggestions that predate V2 (no section field)
function getSection(s) {
  if (s.section) return s.section;
  if (s.severity === "critical") return "critical";
  if (s.severity === "warning")  return "fixes";
  return "opportunities";
}

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
 * @param {number|null} qualityScore  Output of computeQualityScore()
 * @param {function}    onApply       Called with suggestion when "החל" is clicked
 */
export default function SuggestionsPanel({ suggestions = [], qualityScore = null, onApply }) {
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

  // Build section groups — only sections that have items
  const groups = ["critical", "fixes", "opportunities"]
    .map(sec => ({ sec, items: suggestions.filter(s => getSection(s) === sec) }))
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
          <span className={styles.toggleTitle}>עוזר חכם</span>
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
            groups.map(({ sec, items }) => {
              const meta = SECTION_META[sec] || SECTION_META.opportunities;
              return (
                <div key={sec} className={styles.group}>
                  {/* Section header */}
                  <div className={[styles.groupHeader, styles["groupHeader_" + meta.style]].join(" ")}>
                    <span className={styles.groupIcon} aria-hidden="true">{meta.icon}</span>
                    <span className={styles.groupLabel}>{meta.label}</span>
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
                          {/* Score / confidence chips */}
                          {(s.score > 2 || s.violationDelta < 0) && (
                            <div className={styles.rowChips}>
                              {s.score > 2 && (
                                <span className={styles.scoreImpactChip}>
                                  +{s.score} ציון
                                </span>
                              )}
                              {s.violationDelta < 0 && (
                                <span className={styles.violDeltaChip}>
                                  {Math.abs(s.violationDelta)} הפרות פחות
                                </span>
                              )}
                              {s.confidence === "high" && (
                                <span className={styles.confidenceChip}>ביטחון גבוה</span>
                              )}
                            </div>
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
              );
            })
          )}
          <p className={styles.disclaimer}>
            ההצעות הן מידע בלבד — כל החלה מצריכה אישורך.
          </p>
        </div>
      )}
    </div>
  );
}
