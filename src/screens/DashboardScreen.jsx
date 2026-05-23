import { useMemo } from "react";
import { computeViolations } from "../logic/seating.js";
import { fmtDate } from "../utils/dateFormat.js";
import Chip from "../components/ui/Chip.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./DashboardScreen.module.css";

export default function DashboardScreen({ events, onCreateEvent, onOpenEvent, onDeleteEvent }) {
  const eventStatus = (ev) => {
    const seated = Object.keys(ev.seating || {}).length;
    const total  = ev.guests.length;
    const viols  = computeViolations(ev.guests, ev.tables, ev.constraints, ev.seating).length;
    if (total === 0)    return { label: "טרם נוספו אורחים",                       color: "var(--muted)",  pct: 0 };
    if (seated === 0)   return { label: "ממתין לסידור הושבה",                      color: "var(--warn)",   pct: 0 };
    if (seated < total) return { label: seated + " מתוך " + total + " שובצו",     color: "var(--accent)", pct: seated / total };
    if (viols > 0)      return { label: "הושבה מלאה — יש הפרות",                  color: "var(--warn)",   pct: 1 };
    return                     { label: "הושבה מלאה ✓",                           color: "var(--green)",  pct: 1 };
  };

  const hasEvents = events.length > 0;

  return (
    <div className={base.page}>
      {hasEvents ? (
        <div className={styles.heroBar}>
          <div>
            <span className={styles.logoMark}>✦</span>
            <span className={styles.logoName}>כוכב השולחן</span>
            <span className={styles.heroBarSub}>ניהול הושבה לאירועים</span>
          </div>
          <button className={styles.heroCta} onClick={onCreateEvent}>+ אירוע חדש</button>
        </div>
      ) : (
        <div className={styles.hero}>
          <p className={styles.heroEye}>ניהול הושבה חכם לאירועים</p>
          <h1 className={styles.heroTitle}>כוכב השולחן</h1>
          <p className={styles.heroSub}>הכלי המקצועי לסידור הושבה לחתונות ואירועים בישראל.</p>
          <button className={styles.heroCta} onClick={onCreateEvent}>+ צור אירוע חדש</button>
        </div>
      )}

      {hasEvents && (
        <section>
          <h2 className={styles.sectionHead}>האירועים שלי ({events.length})</h2>
          <div className={styles.eventGrid}>
            {events.map(ev => {
              const st  = eventStatus(ev);
              const cap = ev.tables.reduce((s, t) => s + t.capacity, 0);
              return (
                <div key={ev.id} className={styles.eventCard}>
                  <div className={styles.eventCardTop}>
                    <span className={styles.eventType}>{ev.type}</span>
                    <button
                      className={styles.deleteBtn}
                      title="מחק אירוע"
                      onClick={() => onDeleteEvent(ev.id)}
                    >✕</button>
                  </div>

                  <div className={styles.eventName}>
                    {ev.name || <span className={styles.eventNameEmpty}>ללא שם</span>}
                  </div>

                  {(ev.date || ev.venue) && (
                    <div className={styles.eventDate}>
                      {ev.date && <span>📅 {fmtDate(ev.date)}</span>}
                      {ev.date && ev.venue && <span style={{ opacity: 0.4 }}> · </span>}
                      {ev.venue && <span>📍 {ev.venue}</span>}
                    </div>
                  )}

                  {ev.guests.length > 0 && (
                    <div className={styles.eventProgress}>
                      <div
                        className={styles.eventProgressFill}
                        style={{ width: (st.pct * 100) + "%", background: st.color }}
                      />
                    </div>
                  )}

                  <div className={styles.eventFooter}>
                    <span className={styles.eventStatusLabel} style={{ color: st.color }}>{st.label}</span>
                    <div className={styles.eventChips}>
                      {ev.tables.length > 0 && <Chip icon="⬡" label={ev.tables.length + " שולחנות"} />}
                      {cap > 0 && <Chip icon="💺" label={cap + " מקומות"} />}
                      {ev.guests.length > 0 && <Chip icon="👥" label={ev.guests.length + " אורחים"} />}
                    </div>
                  </div>

                  <button className={styles.eventOpenBtn} onClick={() => onOpenEvent(ev.id)}>
                    פתח אירוע ←
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!hasEvents && (
        <div className={styles.emptyHero}>
          <div className={styles.emptyHeroIcon}>🎉</div>
          <h3 className={styles.emptyHeroTitle}>ברוכים הבאים</h3>
          <p className={styles.emptyHeroSub}>צור את האירוע הראשון שלך וסדר את ההושבה בקלות.</p>
          <button className={styles.heroCta} onClick={onCreateEvent}>+ צור אירוע ראשון</button>
        </div>
      )}
    </div>
  );
}
