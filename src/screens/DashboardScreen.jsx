import { useState, useMemo } from "react";
import { fmtDate } from "../utils/dateFormat.js";
import { EVENT_TEMPLATES } from "../data/eventTemplates.js";
import { eventHealth, dashStats, summaryMessages } from "../utils/eventAnalytics.js";
import Chip from "../components/ui/Chip.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./DashboardScreen.module.css";

const WORKFLOW_STEPS = ["פרטי האירוע", "שולחנות", "אורחים", "אילוצים", "הושבה"];

export default function DashboardScreen({ events, onCreateEvent, onOpenEvent, onDeleteEvent, onDuplicateEvent }) {
  const [showTemplates, setShowTemplates] = useState(false);

  const hasEvents     = events.length > 0;
  const stats         = useMemo(() => dashStats(events), [events]);
  const summaries     = useMemo(() => summaryMessages(stats), [stats]);
  const mainTemplates = EVENT_TEMPLATES.filter(t => t.id !== "empty");
  const emptyTemplate = EVENT_TEMPLATES.find(t => t.id === "empty");

  const openTemplate = (tpl) => {
    setShowTemplates(false);
    onCreateEvent(tpl);
  };

  return (
    <div className={base.page}>

      {/* ── Compact header: shown when events exist ── */}
      {hasEvents && (
        <div className={styles.heroBar}>
          <div className={styles.heroBarBrand}>
            <span className={styles.logoMark}>✦</span>
            <span className={styles.logoName}>כוכב השולחן</span>
            <span className={styles.heroBarSub}>סידור הושבה לאירועים</span>
          </div>
          <button className={styles.heroCta} onClick={() => setShowTemplates(true)}>+ אירוע חדש</button>
        </div>
      )}

      {/* ── Full onboarding: shown when no events ── */}
      {!hasEvents && (
        <div className={styles.onboarding}>
          <div className={styles.onboardingBrand}>
            <span className={styles.onboardingMark}>✦</span>
            <h1 className={styles.onboardingTitle}>כוכב השולחן</h1>
          </div>

          <p className={styles.onboardingTagline}>
            סדרו הושבה לחתונה או לכל אירוע — מהר, חכם, בעברית.
          </p>

          <div className={styles.workflowStrip}>
            {WORKFLOW_STEPS.map((label, i) => (
              <div key={i} className={styles.workflowItem}>
                <span className={styles.workflowNum}>{i + 1}</span>
                <span className={styles.workflowLabel}>{label}</span>
              </div>
            ))}
          </div>

          <button className={styles.heroCta} onClick={() => setShowTemplates(true)}>
            + צור אירוע ראשון — בחינם
          </button>

          <p className={styles.onboardingNote}>
            ללא הרשמה · נשמר אוטומטית · עובד בדפדפן בלבד
          </p>
        </div>
      )}

      {/* ── Global stats bar ── */}
      {hasEvents && (
        <div className={styles.statsBar}>
          <div className={styles.statTile}>
            <span className={styles.statValue}>{stats.totalEvents}</span>
            <span className={styles.statLabel}>אירועים</span>
          </div>
          <div className={styles.statTile}>
            <span className={styles.statValue}>{stats.totalGuests}</span>
            <span className={styles.statLabel}>אורחים</span>
          </div>
          <div className={styles.statTile}>
            <span className={[styles.statValue, stats.seatedPct === 100 ? styles.statValueGreen : ""].filter(Boolean).join(" ")}>
              {stats.seatedPct}%
            </span>
            <span className={styles.statLabel}>שובצו</span>
          </div>
          <div className={styles.statTile}>
            <span className={[styles.statValue, stats.totalViols > 0 ? styles.statValueWarn : ""].filter(Boolean).join(" ")}>
              {stats.totalViols}
            </span>
            <span className={styles.statLabel}>הפרות</span>
          </div>
        </div>
      )}

      {/* ── Smart summary banners ── */}
      {summaries.length > 0 && (
        <div className={styles.summaryBar}>
          {summaries.map((m, i) => (
            <span
              key={i}
              className={[
                styles.summaryPill,
                m.severity === "ok" ? styles.summaryPillOk : styles.summaryPillWarn,
              ].join(" ")}
            >
              {m.severity === "ok" ? "✓" : "●"} {m.text}
            </span>
          ))}
        </div>
      )}

      {/* ── Event list ── */}
      {hasEvents && (
        <section>
          <h2 className={styles.sectionHead}>האירועים שלי ({events.length})</h2>
          <div className={styles.eventGrid}>
            {events.map(ev => {
              const h   = eventHealth(ev);
              const cap = ev.tables.reduce((s, t) => s + t.capacity, 0);
              return (
                <div
                  key={ev.id}
                  className={[
                    styles.eventCard,
                    h.needsAttention ? styles.eventCardAttention : "",
                  ].filter(Boolean).join(" ")}
                >

                  <div className={styles.eventCardTop}>
                    <span className={styles.eventType}>{ev.type}</span>
                    <div className={styles.eventCardTopRight}>
                      {h.needsAttention && (
                        <span className={styles.attentionDot} title="דורש טיפול" />
                      )}
                      <button
                        className={styles.deleteBtn}
                        title="מחק אירוע"
                        onClick={() => {
                          const details = [];
                          if (ev.tables.length > 0) details.push(ev.tables.length + " שולחנות");
                          if (ev.guests.length > 0) details.push(ev.guests.length + " אורחים");
                          const dataNote = details.length > 0
                            ? "\n\nיימחקו: " + details.join(" ו-") + " וכל ההושבה."
                            : "";
                          if (!confirm(
                            "למחוק לצמיתות את \"" + (ev.name || "אירוע ללא שם") + "\"?" +
                            dataNote + "\n\nפעולה זו אינה ניתנת לביטול."
                          )) return;
                          onDeleteEvent(ev.id);
                        }}
                      >✕</button>
                    </div>
                  </div>

                  <div className={styles.eventName}>
                    {ev.name || <span className={styles.eventNameEmpty}>ללא שם</span>}
                  </div>

                  {(ev.date || ev.venue) && (
                    <div className={styles.eventMeta}>
                      {ev.date && <span>📅 {fmtDate(ev.date)}</span>}
                      {ev.date && ev.venue && <span className={styles.metaSep}>·</span>}
                      {ev.venue && <span>📍 {ev.venue}</span>}
                    </div>
                  )}

                  {(ev.tables.length > 0 || cap > 0 || ev.guests.length > 0) && (
                    <div className={styles.eventChips}>
                      {ev.tables.length > 0 && <Chip icon="⬡" label={ev.tables.length + " שולחנות"} />}
                      {cap > 0 && <Chip icon="💺" label={cap + " מקומות"} />}
                      {ev.guests.length > 0 && <Chip icon="👥" label={ev.guests.length + " אורחים"} />}
                    </div>
                  )}

                  {/* Progress bar with fraction label */}
                  {h.totalSeats > 0 && (
                    <div className={styles.progressSection}>
                      <div className={styles.progressLabel}>
                        <span>{h.seatedSeats} מתוך {h.totalSeats} שובצו</span>
                        <span className={styles.progressPct}>{Math.round(h.pct * 100)}%</span>
                      </div>
                      <div className={styles.eventProgress}>
                        <div
                          className={styles.eventProgressFill}
                          style={{
                            width: (h.pct * 100) + "%",
                            background: h.pct === 1 && h.viols === 0
                              ? "var(--green)"
                              : h.pct === 1
                              ? "var(--warn)"
                              : "var(--accent)",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Health indicator pills */}
                  <div className={styles.healthPills}>
                    {h.indicators.map(ind => (
                      <span
                        key={ind.key}
                        className={[
                          styles.healthPill,
                          ind.severity === "ok"   ? styles.healthPillOk   :
                          ind.severity === "warn" ? styles.healthPillWarn :
                          styles.healthPillMuted,
                        ].join(" ")}
                      >
                        {ind.label}
                      </span>
                    ))}
                  </div>

                  <div className={styles.eventActions}>
                    <button className={styles.eventOpenBtn} onClick={() => onOpenEvent(ev.id)}>
                      פתח לניהול ←
                    </button>
                    <button className={styles.duplicateBtn} onClick={() => onDuplicateEvent(ev.id)}>
                      שכפל אירוע
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        </section>
      )}

      {showTemplates && (
        <div className={styles.tmplOverlay} onClick={() => setShowTemplates(false)}>
          <div className={styles.tmplPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.tmplPanelHead}>
              <span className={styles.tmplPanelTitle}>באיזה אירוע מדובר?</span>
              <button className={styles.tmplCloseBtn} onClick={() => setShowTemplates(false)}>✕</button>
            </div>

            <div className={styles.tmplGrid}>
              {mainTemplates.map(tpl => (
                <button key={tpl.id} className={styles.tmplCard} onClick={() => openTemplate(tpl)}>
                  <span className={styles.tmplIcon}>{tpl.icon}</span>
                  <span className={styles.tmplLabel}>{tpl.label}</span>
                  <span className={styles.tmplDesc}>{tpl.desc}</span>
                </button>
              ))}
            </div>

            <div className={styles.tmplSep} />

            <button className={styles.tmplEmptyBtn} onClick={() => openTemplate(emptyTemplate)}>
              <span>{emptyTemplate.icon} {emptyTemplate.label}</span>
              <span className={styles.tmplEmptyDesc}>{emptyTemplate.desc}</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
