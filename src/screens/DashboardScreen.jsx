import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { fmtDate, daysUntil } from "../utils/dateFormat.js";
import { useTemplates } from "../hooks/useTemplates.js";
import { canCreateEvent } from "../utils/featureGates.js";
import { eventHealth, dashStats, summaryMessages } from "../utils/eventAnalytics.js";
import Chip from "../components/ui/Chip.jsx";
import Icon from "../components/ui/Icon.jsx";
import TableGlyph from "../components/ui/TableGlyph.jsx";
import base from "../styles/screenBase.module.css";
import Loading from "../components/feedback/Loading.jsx";
import { useConfirm } from "../components/ui/useConfirm.jsx";
import styles from "./DashboardScreen.module.css";

const WORKFLOW_STEPS = ["פרטי האירוע", "שולחנות", "אורחים", "אילוצים", "הושבה"];

// Line icons (stroke = currentColor) for the onboarding value tiles.
const svg = (paths) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
       strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
);
const DASH_ICONS = {
  auto:        svg(<><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></>),
  constraints: svg(<><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /><path d="M9 6.5h5a3.5 3.5 0 0 1 3.5 3.5v5" /></>),
  export:      svg(<><path d="M4 20h16" /><path d="M7 16V9M12 16V5M17 16v-4" /></>),
};

const DEMO_STEPS = [
  { label: "צרו אירוע חדש",        hint: 'לחצו "צרו אירוע" ובחרו את סוג האירוע מהתפריט' },
  { label: "הוסיפו שולחנות",          hint: "הגדירו כמה שולחנות יש באולם ואת הקיבולת שלהם" },
  { label: "הוסיפו אורחים",           hint: "הזינו ידנית, הדביקו רשימת שמות, או שתפו טבלה משותפת עם המשפחה" },
  { label: "הגדירו אילוצים",          hint: "הפרדות בין אורחים וישיבות משותפות" },
  { label: "חשבו הושבה אוטומטית",   hint: 'לחצו "חשבו הושבה" בלשונית ההושבה ובדקו את התוצאה' },
  { label: "ייצאו לאולם",            hint: "ייצאו את הסידור לקובץ Excel לצוות האולם" },
];

export default function DashboardScreen({ events, plan = "free", onCreateEvent, onOpenEvent, onDeleteEvent, onDuplicateEvent }) {
  const { confirm, dialog } = useConfirm();
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDemo,      setShowDemo]      = useState(false);
  const [doneSteps,     setDoneSteps]     = useState(() => new Set());

  const toggleStep = (i) => setDoneSteps(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const hasEvents     = events.length > 0;
  const stats         = useMemo(() => dashStats(events), [events]);
  const summaries     = useMemo(() => summaryMessages(stats), [stats]);

  // The event closest to happening is the one the host came here about, so it
  // is the one that gets the size. Past and undated events fall to the back —
  // an event with no date cannot be "soon".
  const featuredId = useMemo(() => {
    if (events.length === 0) return null;
    const ranked = events
      .map(e => ({ id: e.id, d: daysUntil(e.date) }))
      .sort((a, b) => {
        const av = a.d == null || a.d < 0 ? Infinity : a.d;
        const bv = b.d == null || b.d < 0 ? Infinity : b.d;
        return av - bv;
      });
    return ranked[0].id;
  }, [events]);

  // The featured card is `grid-column: 1 / -1`, so WHERE IT IS IN THE SOURCE is
  // where it lands on the page. `featuredId` picked the nearest upcoming event
  // correctly and then the list was mapped in storage order, so the "3 ימים
  // לאירוע" hero card rendered third and last — underneath an empty
  // placeholder card. It is the one thing on this page with any size to it; it
  // goes first.
  const orderedEvents = useMemo(() => {
    if (!featuredId) return events;
    const i = events.findIndex(e => e.id === featuredId);
    if (i <= 0) return events;
    return [events[i], ...events.slice(0, i), ...events.slice(i + 1)];
  }, [events, featuredId]);
  const { mainTemplates, emptyTemplate, loading: templateLoading } = useTemplates();
  const eventGate     = canCreateEvent(plan, events.length);

  const openTemplate = (tpl) => {
    setShowTemplates(false);
    onCreateEvent(tpl);
  };

  return (
    <div className={base.pageWide}>
      {dialog}

      {/* ── Compact header: shown when events exist ── */}
      {hasEvents && (
        <div className={styles.heroBar}>
          <div className={styles.heroBarBrand}>
            <span className={styles.logoMark}>✦</span>
            <span className={styles.logoName}>כוכב השולחן</span>
            <span className={styles.heroBarSub}>סידור הושבה לאירועים</span>
          </div>
          <button
            className={styles.heroCta}
            onClick={() => eventGate.allowed ? setShowTemplates(true) : onCreateEvent(null)}
          >
            + אירוע חדש
          </button>
        </div>
      )}

      {/* ── Event limit upgrade tip ── */}
      {!eventGate.allowed && hasEvents && (
        <p className={styles.upgradeTip}>
          <Icon name="lock" /> {eventGate.reason} —{" "}
          <Link to="/account" className={styles.upgradeTipLink}>שדרגו את התוכנית</Link>
        </p>
      )}

      {/* ── Full onboarding: shown when no events ── */}
      {!hasEvents && (
        <div className={styles.onboarding}>
          <div className={styles.onboardingBrand}>
            <span className={styles.onboardingMark}>✦</span>
            <h1 className={styles.onboardingTitle}>כוכב השולחן</h1>
          </div>

          <p className={styles.onboardingTagline}>
            כלי הושבה לחתונות ואירועים — הוסיפו אורחים, הגדירו אילוצים,
            וקבלו סידור שולחנות אוטומטי בלחיצה אחת.
          </p>

          <div className={styles.valueRow}>
            <div className={styles.valueTile}>
              <span className={styles.valueTileIcon}>{DASH_ICONS.auto}</span>
              <span className={styles.valueTileTitle}>סידור אוטומטי</span>
              <span className={styles.valueTileSub}>האלגוריתם ממלא שולחנות תוך שניות, ללא עבודה ידנית</span>
            </div>
            <div className={styles.valueTile}>
              <span className={styles.valueTileIcon}>{DASH_ICONS.constraints}</span>
              <span className={styles.valueTileTitle}>אילוצים בין אורחים</span>
              <span className={styles.valueTileSub}>הפרדות, ישיבות משותפות ועדיפויות — הכל נלקח בחשבון</span>
            </div>
            <div className={styles.valueTile}>
              <span className={styles.valueTileIcon}>{DASH_ICONS.export}</span>
              <span className={styles.valueTileTitle}>ייצוא לאולם</span>
              <span className={styles.valueTileSub}>ייצוא מלא לקובץ Excel עם פירוט שולחנות ואורחים</span>
            </div>
          </div>

          <div className={styles.workflowStrip}>
            {WORKFLOW_STEPS.map((label, i) => (
              <div key={i} className={styles.workflowItem}>
                <span className={styles.workflowNum}>{i + 1}</span>
                <span className={styles.workflowLabel}>{label}</span>
              </div>
            ))}
          </div>

          <button
            className={styles.heroCta}
            onClick={() => eventGate.allowed ? setShowTemplates(true) : onCreateEvent(null)}
          >
            + צרו אירוע ראשון
          </button>

          <p className={styles.onboardingNote}>
            ניתן להשתמש ללא הרשמה · חינם לגמרי · נשמר אוטומטית · גרסת בטא מוקדמת
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
            <span className={styles.statLabel}>מקומות</span>
          </div>
          {/* The seating figure is the number a host opens this screen for —
              it carries the blush ground so the eye has somewhere to land. */}
          <div className={[styles.statTile, styles.statPrimary].join(" ")}>
            <span className={[styles.statValue, stats.seatedPct === 100 ? styles.statValueGreen : ""].filter(Boolean).join(" ")}>
              {stats.seatedPct}%
            </span>
            <span className={styles.statLabel}>שובצו</span>
          </div>
          <div className={styles.statTile}>
            <span className={[styles.statValue, stats.totalViols > 0 ? styles.statValueWarn : ""].filter(Boolean).join(" ")}>
              {stats.totalViols}
            </span>
            <span className={styles.statLabel}>{stats.totalViols === 1 ? "הפרה" : "הפרות"}</span>
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
              {m.severity === "ok" ? <Icon name="check" size={12} /> : <Icon name="dot" size={9} />} {m.text}
            </span>
          ))}
        </div>
      )}

      {/* ── Event list ── */}
      {hasEvents && (
        <section>
          <h2 className={styles.sectionHead}>האירועים שלי ({events.length})</h2>
          <div className={styles.eventGrid}>
            {orderedEvents.map(ev => {
              const h    = eventHealth(ev);
              const cap  = ev.tables.reduce((s, t) => s + t.capacity, 0);
              const feat = ev.id === featuredId && events.length > 0;
              const days = daysUntil(ev.date);
              return (
                <div
                  key={ev.id}
                  className={[
                    styles.eventCard,
                    feat ? styles.eventCardFeatured : "",
                    h.needsAttention ? styles.eventCardAttention : "",
                  ].filter(Boolean).join(" ")}
                >
                {/* The featured card is the one thing on this page with any
                    size to it. Everything else on a dashboard is a list; this
                    is the event, drawn — a number that means something and the
                    tables underneath it, on the blush ground the system uses
                    when something has to be looked at without spending the
                    accent. */}
                {feat && (
                  <div className={styles.featPanel} aria-hidden="true">
                    {days != null && days >= 0 ? (
                      <>
                        <span className={styles.featBig}>{days}</span>
                        <span className={styles.featCaption}>
                          {days === 0 ? "האירוע היום" : days === 1 ? "יום לאירוע" : "ימים לאירוע"}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={styles.featBig}>{Math.round(h.pct * 100)}<span className={styles.featPct}>%</span></span>
                        <span className={styles.featCaption}>מהמקומות שובצו</span>
                      </>
                    )}
                    {ev.tables.length > 0 && (
                      <div className={styles.featGlyphs}>
                        {ev.tables.slice(0, 8).map(t => (
                          <TableGlyph
                            key={t.id}
                            shape={t.shape}
                            capacity={t.capacity}
                            taken={ev.guests.reduce(
                              (n, g) => n + (ev.seating?.[g.id] === t.id ? (g.count || 1) : 0), 0)}
                            size={38}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className={styles.eventCardBody}>

                  <div className={styles.eventCardTop}>
                    <span className={styles.eventType}>{ev.type}</span>
                    <div className={styles.eventCardTopRight}>
                      {h.needsAttention && (
                        <span className={styles.attentionDot} title="דורש טיפול" />
                      )}
                      <button
                        className={styles.deleteBtn}
                        title="מחקו אירוע"
                        onClick={async () => {
                          const details = [];
                          if (ev.tables.length > 0) details.push(ev.tables.length + " שולחנות");
                          if (ev.guests.length > 0) details.push(ev.guests.length + " רשומות");
                          const dataNote = details.length > 0
                            ? "\n\nיימחקו: " + details.join(" ו-") + " וכל ההושבה."
                            : "";
                          if (!await confirm(
                            "למחוק לצמיתות את \"" + (ev.name || "אירוע ללא שם") + "\"?" +
                            dataNote + "\n\nפעולה זו אינה ניתנת לביטול.",
                            { danger: true, confirmLabel: "מחקו לצמיתות" }
                          )) return;
                          onDeleteEvent(ev.id);
                        }}
                      ><Icon name="close" size={14} /></button>
                    </div>
                  </div>

                  <div className={styles.eventName}>
                    {ev.name || <span className={styles.eventNameEmpty}>ללא שם</span>}
                  </div>

                  {(ev.date || ev.venue) && (
                    <div className={styles.eventMeta}>
                      {ev.date && <span><Icon name="calendar" size={13} /> {fmtDate(ev.date)}</span>}
                      {ev.date && ev.venue && <span className={styles.metaSep}>·</span>}
                      {ev.venue && <span><Icon name="pin" size={13} /> {ev.venue}</span>}
                    </div>
                  )}

                  {(ev.tables.length > 0 || cap > 0 || ev.guests.length > 0) && (
                    <div className={styles.eventChips}>
                      {ev.tables.length > 0 && <Chip icon={<Icon name="hexagon" size={13} />} label={ev.tables.length + " שולחנות"} />}
                      {cap > 0 && <Chip icon={<Icon name="chair" size={13} />} label={cap + " מקומות"} />}
                      {ev.guests.length > 0 && <Chip icon={<Icon name="users" size={13} />} label={ev.guests.length + " רשומות"} />}
                    </div>
                  )}

                  {/* The event as a picture. A row of numbers tells you the
                      totals; this tells you the SHAPE of the problem — which
                      tables are full, which are still empty, which overflowed —
                      in the half second before anyone reads a label. */}
                  {ev.tables.length > 0 && (
                    <div className={styles.tableStrip} aria-hidden="true">
                      {ev.tables.slice(0, 14).map(t => (
                        <TableGlyph
                          key={t.id}
                          shape={t.shape}
                          capacity={t.capacity}
                          taken={ev.guests.reduce(
                            (n, g) => n + (ev.seating?.[g.id] === t.id ? (g.count || 1) : 0), 0)}
                          size={26}
                        />
                      ))}
                      {ev.tables.length > 14 && (
                        <span className={styles.tableStripMore}>+{ev.tables.length - 14}</span>
                      )}
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
                      פתחו לניהול <Icon name="arrowLeft" size={14} />
                    </button>
                    <button className={styles.duplicateBtn} onClick={() => onDuplicateEvent(ev.id)}>
                      שכפלו אירוע
                    </button>
                  </div>
                </div>

                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Demo checklist ── */}
      <div className={styles.demoCard}>
        <button className={styles.demoToggle} onClick={() => setShowDemo(v => !v)}>
          <span className={styles.demoToggleStart}>
            <span className={styles.demoIcon}><Icon name="compass" size={22} /></span>
            <span className={styles.demoTitle}>מדריך התחלה</span>
            {doneSteps.size > 0 && (
              <span className={doneSteps.size === DEMO_STEPS.length ? styles.demoBadgeDone : styles.demoBadge}>
                {doneSteps.size}/{DEMO_STEPS.length}
              </span>
            )}
          </span>
          <span className={styles.demoChevron}><Icon name={showDemo ? "chevronUp" : "chevronDown"} size={14} /></span>
        </button>

        {showDemo && (
          <div className={styles.demoBody}>
            <p className={styles.demoSubtitle}>
              סיור מודרך להכרת המערכת — לא התקדמות אמיתית של אירוע.
              סמנו כל צעד אחרי שהתנסיתם בו.
            </p>
            <ol className={styles.demoList}>
              {DEMO_STEPS.map((step, i) => {
                const done = doneSteps.has(i);
                return (
                  <li key={i}>
                    <button
                      className={[styles.demoStep, done ? styles.demoStepDone : ""].filter(Boolean).join(" ")}
                      onClick={() => toggleStep(i)}
                    >
                      <span className={[styles.demoCheck, done ? styles.demoCheckDone : ""].filter(Boolean).join(" ")}>
                        {done ? <Icon name="check" size={11} /> : (i + 1)}
                      </span>
                      <span className={styles.demoStepText}>
                        <span className={styles.demoStepLabel}>{step.label}</span>
                        <span className={styles.demoStepHint}>{step.hint}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {doneSteps.size === DEMO_STEPS.length && (
              <p className={styles.demoComplete}>
                <Icon name="check" size={14} /> כל השלבים הושלמו — המערכת עובדת מצוין!
              </p>
            )}
          </div>
        )}
      </div>

      {showTemplates && (
        <div className={styles.tmplOverlay} onClick={() => setShowTemplates(false)}>
          <div className={styles.tmplPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.tmplPanelHead}>
              <span className={styles.tmplPanelTitle}>באיזה אירוע מדובר?</span>
              <button className={styles.tmplCloseBtn} onClick={() => setShowTemplates(false)} aria-label="סגירה"><Icon name="close" size={15} /></button>
            </div>

            {templateLoading
              ? <Loading rows={3} label="טוען תבניות…" />
              : (
                <div className={styles.tmplGrid}>
                  {mainTemplates.map(tpl => (
                    <button key={tpl.id} className={styles.tmplCard} onClick={() => openTemplate(tpl)}>
                      <span className={styles.tmplIcon}><Icon name={tpl.icon} size={22} /></span>
                      <span className={styles.tmplLabel}>{tpl.label}</span>
                      <span className={styles.tmplDesc}>{tpl.desc}</span>
                    </button>
                  ))}
                </div>
              )
            }

            <div className={styles.tmplSep} />

            <button className={styles.tmplEmptyBtn} onClick={() => openTemplate(emptyTemplate)}>
              <span><Icon name={emptyTemplate.icon} size={16} /> {emptyTemplate.label}</span>
              <span className={styles.tmplEmptyDesc}>{emptyTemplate.desc}</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
