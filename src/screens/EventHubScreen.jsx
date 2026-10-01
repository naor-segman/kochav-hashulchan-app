import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AREAS, BUILD_STEPS } from "../data/eventAreas.js";
import { fmtDate, daysUntil } from "../utils/dateFormat.js";
import { useAuth } from "../hooks/useAuth.js";
import Icon from "../components/ui/Icon.jsx";
import SectionMark from "../components/ui/SectionMark.jsx";
import TableGlyph from "../components/ui/TableGlyph.jsx";
import Orientation from "../components/onboarding/Orientation.jsx";
import { useOrientation } from "../components/onboarding/useOrientation.js";
import PhotoRetentionNotice from "../components/feedback/PhotoRetentionNotice.jsx";
import EventPlanCard from "../components/billing/EventPlanCard.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./EventHubScreen.module.css";
import { makeOpenScreen, isNameGated } from "../utils/eventNameGate.js";
import { seatingTotals } from "../utils/eventHelpers.js";

/* ── The event's own front page ───────────────────────────────────────────────
 *
 * Opening an event used to drop you straight onto the details form with a rail
 * of fourteen tools above it, and nothing anywhere said what the other thirteen
 * were for or when they mattered. This is the page that answers that: the three
 * areas, what is in each one, and — the part the flat rail could never say —
 * WHEN each one is your problem.
 *
 * It is also the honest place for "continue where you left off", because that
 * is a fact about this event and not a fact about the product.
 * ──────────────────────────────────────────────────────────────────────────── */

export default function EventHubScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  // The same guard the rail applies, now literally the same function. Without
  // it the identical click was blocked from the nav and allowed from the hub —
  // which is how this got written twice in the first place.
  const openItem = makeOpenScreen(ev, { go, showToast });
  const { user } = useAuth();
  const orientation = useOrientation();

  const stats = useMemo(() => {
    const guests = ev.guests || [];
    const tables = ev.tables || [];
    // Declined guests are not coming, so they need no seat. This tile summed
    // them anyway, and the hub said "60 מקומות · 28% שובצו" for an event the
    // seating screen called 48 seats and 35% (browser audit 28.9). One rule,
    // the one the seating screen uses.
    const totals = seatingTotals(guests, ev.seating);
    const seats  = totals.totalSeats;
    const seated = totals.assignedSeats;
    const declined = guests.length - totals.totalRecords;
    const cap    = tables.reduce((s, t) => s + (t.capacity || 0), 0);
    const confirmed = guests.filter(g => g.rsvp === "confirmed").length;
    const answered  = guests.filter(g => g.rsvp && g.rsvp !== "pending").length;
    const tasks     = ev.tasks || [];
    const tasksDone = tasks.filter(t => t.status === "done").length;
    return {
      guests: guests.length, active: totals.totalRecords, declined, seats, tables: tables.length, cap, seated,
      pct: seats > 0 ? Math.round((seated / seats) * 100) : 0,
      confirmed, answered,
      constraints: (ev.constraints || []).length,
      tasks: tasks.length, tasksDone,
      vendors: (ev.vendors || []).length,
    };
  }, [ev]);

  // "Done" is deliberately generous — it means "there is something here", not
  // "this is finished". Nothing in this product is ever finished until the day.
  const done = (id) => {
    // `isNameGated` and not `!!ev.name`: a fourth statement of the same rule was
    // what let the two originals drift, and "   " is not a name. The gate module
    // owns the question; this asks it.
    if (id === "setup")       return !isNameGated(ev, "guests");
    if (id === "guests")      return stats.guests > 0;
    if (id === "tables")      return stats.tables > 0;
    if (id === "constraints") return stats.constraints > 0;
    if (id === "seating")     return stats.seated > 0;
    if (id === "rsvps")       return stats.answered > 0;
    if (id === "site")        return !!ev.eventSite?.enabled;
    if (id === "tasks")       return stats.tasks > 0;
    if (id === "vendors")     return stats.vendors > 0;
    return false;
  };

  const state = (id) => {
    switch (id) {
      case "setup":       return ev.date ? fmtDate(ev.date) : "עוד אין תאריך";
      case "guests":      return stats.active
        ? `${stats.active} רשומות · ${stats.seats} מקומות${stats.declined ? ` · ${stats.declined} לא מגיעים` : ""}`
        : stats.declined ? `${stats.declined} לא מגיעים` : "הרשימה ריקה";
      case "tables":      return stats.tables ? `${stats.tables} שולחנות · ${stats.cap} מקומות` : "עוד לא הוגדרו";
      case "constraints": return stats.constraints ? `${stats.constraints} אילוצים` : "אין אילוצים";
      case "seating":     return stats.seated ? `${stats.pct}% מהמקומות שובצו` : "עוד לא חושבה";
      case "rsvps":       return stats.answered ? `${stats.confirmed} אישרו מתוך ${stats.guests}` : "עוד לא נשלחו";
      case "tasks":       return stats.tasks ? `${stats.tasksDone} מתוך ${stats.tasks} בוצעו` : null;
      case "vendors":     return stats.vendors ? `${stats.vendors} ספקים` : null;
      case "site":        return ev.eventSite?.enabled ? "פורסם" : null;
      default:            return null;
    }
  };

  // The one thing to do next: the earliest step in the default order that has
  // nothing in it yet. It is a suggestion, not a gate — every other step stays
  // one click away, because some venues fix the table count in the contract.
  const nextStep = BUILD_STEPS.find(s => !done(s.id)) || null;
  const days = daysUntil(ev.date);

  return (
    <div className={base.pageWide}>
      <header className={styles.head}>
        <div className={styles.headMain}>
          <p className={styles.eyebrow}>{ev.type || "אירוע"}</p>
          <h1 className={styles.title}>{ev.name || "אירוע חדש"}</h1>
          <p className={styles.meta}>
            {ev.date && <span><Icon name="calendar" size={13} /> {fmtDate(ev.date)}</span>}
            {ev.date && ev.venue && <span className={styles.metaSep}>·</span>}
            {ev.venue && <span><Icon name="pin" size={13} /> {ev.venue}</span>}
            {!ev.date && !ev.venue && <span>עוד אין תאריך ואולם — אפשר להשלים בפרטי האירוע</span>}
          </p>
        </div>

        <div className={styles.headSide}>
          {days != null && days >= 0 && (
            <div className={styles.countdown}>
              <span className={styles.countBig}>{days}</span>
              <span className={styles.countCaption}>
                {days === 0 ? "האירוע היום" : days === 1 ? "יום לאירוע" : "ימים לאירוע"}
              </span>
            </div>
          )}
          {!orientation.open && (
            <button className={styles.howBtn} onClick={orientation.show}>
              <Icon name="question" size={14} /> איך זה עובד
            </button>
          )}
        </div>
      </header>

      {/* Under the event's name, not above it: above, its h2 came before the
          page's h1 and at 390px pushed the name below the fold (WORKPLAN 108).
          The button that reopens it is in the header, so it opens right under
          the button. */}
      {orientation.open && (
        <Orientation onDismiss={orientation.dismiss} onGo={go} />
      )}

      {/* Above the fold on the screen the host actually lands on. A warning
          about a deletion is only a warning if it is seen before the deletion,
          and the event site editor is a place they may not open for weeks. */}
      <PhotoRetentionNotice ev={ev} patchEvent={patchEvent} showToast={showToast} />

      {/* The event's package, and the only place it can be bought — a purchase
          unlocks ONE event, so the checkout has to be opened from inside one.
          It cannot hang off a gate: PLAN_GATES_ENFORCED is false, so nothing
          refuses anyone today and a CTA shown on refusal would never show. */}
      <EventPlanCard ev={ev} />

      {/* The tables as they stand, drawn. A row of numbers says how many; this
          says the SHAPE of the problem before a single label is read. */}
      {stats.tables > 0 && (
        <div className={styles.glyphStrip} aria-hidden="true">
          {(ev.tables || []).slice(0, 16).map(t => (
            <TableGlyph
              key={t.id}
              shape={t.shape}
              capacity={t.capacity}
              taken={(ev.guests || []).reduce((n, g) => n + (ev.seating?.[g.id] === t.id ? (g.count || 1) : 0), 0)}
              size={30}
            />
          ))}
          {stats.tables > 16 && <span className={styles.glyphMore}>+{stats.tables - 16}</span>}
        </div>
      )}

      {/* Through the gate, like every tile below it. This button called `go`
          directly, so on an unnamed event it opened the screen the tiles refuse
          to open — the exact nav-vs-hub divergence eventNameGate.js exists to
          prevent, on the same screen, two hundred lines apart. Latent rather
          than live (both name inputs trim), which is why nothing caught it. */}
      {nextStep && (
        <button className={styles.resume} onClick={() => openItem(nextStep.id)}>
          <span className={styles.resumeText}>
            <span className={styles.resumeLabel}>המשיכו מכאן</span>
            <span className={styles.resumeStep}>
              שלב {nextStep.num} — {nextStep.label}
            </span>
            <span className={styles.resumeHint}>{nextStep.hint}</span>
          </span>
          <span className={styles.resumeGo}>פתחו <Icon name="arrowLeft" size={15} /></span>
        </button>
      )}

      {!user && (
        <p className={styles.guestNote}>
          <Icon name="cloud" size={14} />{" "}
          האירוע הזה שמור רק בדפדפן הזה. פתיחת חשבון מגבה אותו, מסנכרנת לטלפון ומאפשרת לשתף קישורים עם האורחים.{" "}
          <Link to="/signup" className={styles.guestLink}>פתחו חשבון חינם</Link>
        </p>
      )}

      <div className={styles.areaGrid}>
        {AREAS.map(a => (
          <section key={a.id} className={styles.area} aria-label={a.label}>
            <header className={styles.areaHead}>
              <SectionMark name={a.mark} size={26} tile />
              <div className={styles.areaHeadText}>
                <h2 className={styles.areaName}>{a.label}</h2>
                <p className={styles.areaSub}>{a.sub}</p>
              </div>
              <span className={styles.areaWhen}>{a.when}</span>
            </header>

            <ul className={styles.itemList}>
              {a.items.map(it => {
                const isDone = done(it.id);
                const st = state(it.id);
                return (
                  <li key={it.id}>
                    <button className={styles.item} onClick={() => openItem(it.id)}>
                      <span className={[styles.itemDot, isDone && styles.itemDotDone].filter(Boolean).join(" ")}>
                        {it.num
                          ? (isDone ? <Icon name="check" size={11} /> : it.num)
                          : <SectionMark name={it.mark} size={16} />}
                      </span>
                      <span className={styles.itemText}>
                        <span className={styles.itemLabel}>{it.label}</span>
                        <span className={styles.itemHint}>{st || it.hint}</span>
                      </span>
                      <Icon name="arrowLeft" size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
