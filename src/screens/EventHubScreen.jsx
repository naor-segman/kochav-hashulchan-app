import { useMemo, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AREAS, BUILD_STEPS } from "../data/eventAreas.js";
import { fmtDate, daysUntil } from "../utils/dateFormat.js";
import { useAuth } from "../hooks/useAuth.js";
import Icon from "../components/ui/Icon.jsx";
import SectionMark from "../components/ui/SectionMark.jsx";
import TableGlyph from "../components/ui/TableGlyph.jsx";
import PhotoRetentionNotice from "../components/feedback/PhotoRetentionNotice.jsx";
import EventPlanCard from "../components/billing/EventPlanCard.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./EventHubScreen.module.css";
import { makeOpenScreen, isNameGated } from "../utils/eventNameGate.js";
import { seatingTotals } from "../utils/eventHelpers.js";
import { markDraftCarry } from "../utils/draftCarry.js";

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
  // Back from checkout (?checkout=success|cancelled): the package card goes to
  // the top, where its "התשלום התקבל" / "לא חויבתם" line is seen. Read once —
  // the card strips the parameter as it reads it.
  const location = useLocation();
  const [fromCheckout] = useState(() => /[?&]checkout=/.test(location.search));
  // Just created (App.jsx startEvent): the one-time moment below. Read once,
  // then cleared from the history entry, so Back-then-Forward or a reload
  // does not congratulate the host a second time.
  const navigate = useNavigate();
  const [justCreated] = useState(() => !!location.state?.created);
  useEffect(() => {
    if (location.state?.created) {
      // The LIVE search, not this render's: EventPlanCard (a child, so its
      // effect runs first) may just have stripped ?checkout=, and this
      // render's copy would put it back (review 6.10).
      navigate(location.pathname + window.location.search, { replace: true, state: null });
    }
  }, [location, navigate]);

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
    // PEOPLE who confirmed, for the big number — `confirmed` above counts rows
    // and stays for the item line ("N אישרו מתוך N" is pinned in rows).
    const confirmedPeople = guests
      .filter(g => g?.rsvp === "confirmed")
      .reduce((n, g) => n + Math.max(1, Number(g.count) || 1), 0);
    // EVERYONE invited, the declined included — that is what "מוזמנים" means.
    // The big number showed `seats` (the declined left out) under that word,
    // so 300 invited with 50 declined read "250 מוזמנים" (review 6.10).
    const invitedPeople = guests.reduce((n, g) => n + Math.max(1, Number(g?.count) || 1), 0);
    const answered  = guests.filter(g => g.rsvp && g.rsvp !== "pending").length;
    const tasks     = ev.tasks || [];
    const tasksDone = tasks.filter(t => t.status === "done").length;
    return {
      guests: guests.length, active: totals.totalRecords, declined, seats, tables: tables.length, cap, seated,
      pct: seats > 0 ? Math.round((seated / seats) * 100) : 0,
      confirmed, answered, confirmedPeople, invitedPeople,
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

  /* 136 stage D (owner, 5.10): "המשיכו מכאן" first, not a disabled purchase
     card; the names, the countdown and big numbers on the first screen. It
     opened (measured at 390) on the package card — a disabled ₪ button — with
     "המשיכו מכאן" at the fold and the areas below it. */
  const planCard = <EventPlanCard ev={ev} />;

  return (
    <div className={base.pageWide}>
      <header className={styles.head} data-tour="hub.head">
        <p className={styles.eyebrow}>{ev.type || "אירוע"}</p>
        <h1 className={styles.title}>{ev.name || "אירוע חדש"}</h1>
        <p className={styles.meta}>
          {ev.date && <span><Icon name="calendar" size={14} /> {fmtDate(ev.date)}</span>}
          {ev.date && ev.venue && <span className={styles.metaSep}>·</span>}
          {ev.venue && <span><Icon name="pin" size={14} /> {ev.venue}</span>}
          {!ev.date && !ev.venue && <span>עוד אין תאריך ואולם — אפשר להשלים בפרטי האירוע</span>}
        </p>

        {/* The four numbers the host comes back for, at the size of an answer.
            People, not rows (a row is a family): the item lines below keep
            their row counts. */}
        {/* Not on an empty event with no date: four zeros say nothing, and
            they were the first thing a host saw on the day they started. */}
        {(stats.guests > 0 || (daysUntil(ev.date) ?? -1) >= 0) && (
        <dl className={styles.numbers}>
          <HubCountdown date={ev.date} />
          <div className={styles.num}>
            <dt className={styles.numLabel}>מוזמנים</dt>
            <dd className={styles.numBig}>{stats.invitedPeople}</dd>
          </div>
          <div className={styles.num}>
            <dt className={styles.numLabel}>אישרו הגעה</dt>
            <dd className={styles.numBig}>{stats.confirmedPeople}</dd>
          </div>
          <div className={styles.num}>
            <dt className={styles.numLabel}>שובצו</dt>
            <dd className={styles.numBig}>{stats.pct}<span className={styles.numUnit}>%</span></dd>
          </div>
        </dl>
        )}
      </header>

      {/* Above the fold on the screen the host actually lands on. A warning
          about a deletion is only a warning if it is seen before the deletion,
          and the event site editor is a place they may not open for weeks. */}
      <PhotoRetentionNotice ev={ev} patchEvent={patchEvent} showToast={showToast} />

      {fromCheckout && planCard}

      {justCreated && <CreatedMoment ev={ev} done={done} />}

      {/* Through the gate, like every tile below it. This button called `go`
          directly, so on an unnamed event it opened the screen the tiles refuse
          to open — the exact nav-vs-hub divergence eventNameGate.js exists to
          prevent, on the same screen, two hundred lines apart. Latent rather
          than live (both name inputs trim), which is why nothing caught it. */}
      {nextStep && (
        <button className={styles.resume} onClick={() => openItem(nextStep.id)} data-tour="hub.resume">
          <span className={styles.resumeText}>
            <span className={styles.resumeLabel}>המשיכו מכאן</span>
            <span className={styles.resumeStep}>
              שלב {nextStep.num} — {nextStep.label}
            </span>
            <span className={styles.resumeHint}>{nextStep.hint}</span>
          </span>
          <span className={styles.resumeGo}>פתחו <Icon name="arrowLeft" size={16} /></span>
        </button>
      )}

      {!user && (
        <p data-tour="hub.account" className={styles.guestNote}>
          <Icon name="cloud" size={14} />{" "}
          האירוע הזה שמור רק בדפדפן הזה. פתיחת חשבון מגבה אותו, מסנכרנת לטלפון ומאפשרת לשתף קישורים עם האורחים.{" "}
          {/* Inside the draft, so signing up carries it (33d, draftCarry.js). */}
          <Link to="/signup" className={styles.guestLink} onClick={() => markDraftCarry()}>פתחו חשבון חינם</Link>
        </p>
      )}

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

      <div className={styles.areaGrid} data-tour="hub.areas">
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

      {/* The event's package, and the only place it can be bought — a purchase
          unlocks ONE event, so the checkout has to be opened from inside one.
          Last on the page now (136 stage D): it led the page, as a disabled
          button, above what the host came to do. Back from checkout it is at
          the top instead (fromCheckout). */}
      {!fromCheckout && <div className={styles.planSlot}>{planCard}</div>}
    </div>
  );
}

/* The moment the event exists (136 stage D, "רגעים"). It said nothing: the
 * wizard closed onto a page of zeros. One block, once, between the numbers and
 * "המשיכו מכאן": that this is a beginning, what the road is, and that nothing
 * has to be done today. Not a modal — the hub's own tour opens on this visit
 * too, and a dialog over a dialog is a wall. No confetti (owner: nothing that
 * pops). "מזל טוב" only where it is said: not to a company event, and not to
 * "אחר", which may be anything. */
const COUNT_WORD = { 2: "שני צעדים", 3: "שלושה צעדים", 4: "ארבעה צעדים", 5: "חמישה צעדים" };
/* An allowlist, not a denylist: an admin template can carry any free-text
   type ("אזכרה"), and a default of "מזל טוב" is wrong for some of them. */
const MAZAL_TOV = new Set(["חתונה", "בר מצווה", "בת מצווה", "ברית", "בריתה", "חינה", "אירוס", "אירוע משפחתי", "יום הולדת"]);
/* The one step that is not required — said where the road is listed. */
const OPTIONAL_STEP = "constraints";

function CreatedMoment({ ev, done }) {
  const left = BUILD_STEPS.filter(s => !done(s.id)).length;
  const celebrate = MAZAL_TOV.has(ev.type);
  return (
    <section className={styles.created} aria-labelledby="hub-created-title">
      <h2 id="hub-created-title" className={styles.createdTitle}>
        {celebrate ? "מזל טוב — האירוע נפתח" : "האירוע נפתח"}
      </h2>
      <p className={styles.createdText}>
        {left === 1
          ? "נשאר עוד צעד אחד, ובסופו לכל אורח יש מקום. "
          : left
          ? `נשארו עוד ${COUNT_WORD[left] || left + " צעדים"}, ובסופם לכל אורח יש מקום. `
          : ""}
        הכל נשמר תוך כדי — אפשר לעצור ולחזור מתי שרוצים.
      </p>
      <ol className={styles.createdPath}>
        {BUILD_STEPS.map(s => {
          const isDone = done(s.id);
          return (
            <li key={s.id} className={isDone ? styles.createdDone : undefined}>
              <span className={styles.createdNum} aria-hidden="true">
                {isDone ? <Icon name="check" size={12} /> : s.num}
              </span>
              {s.label}
              {s.id === OPTIONAL_STEP && <span className={styles.createdOptional}>(לא חובה)</span>}
              {isDone && <span className="sr-only"> — בוצע</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* Days to the event. It was computed once per render of the hub, so a hub
 * left open overnight — the screen a host keeps open — still said "1 יום
 * לאירוע" on the morning of the event (T5). It re-reads the date every minute,
 * in its own component so the tick re-renders the number and not the page. */
function HubCountdown({ date }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!date) return;
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, [date]);
  const days = daysUntil(date);
  if (days == null || days < 0) return null;
  return (
    <div className={[styles.num, styles.numDays].join(" ")}>
      {/* On the day: "האירוע" over a big "היום", not "האירוע היום" over a 0. */}
      <dt className={styles.numLabel}>
        {days === 0 ? "האירוע" : days === 1 ? "יום לאירוע" : "ימים לאירוע"}
      </dt>
      <dd className={styles.numBig}>{days === 0 ? "היום" : days}</dd>
    </div>
  );
}
