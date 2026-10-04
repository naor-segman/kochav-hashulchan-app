import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchEventByToken, UNREACHABLE_TEXT, INVALID_LINK_TEXT } from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { getSiteTheme, getSiteFont } from "../data/eventSiteTemplates.js";
import { normalizeAnnouncement } from "../data/announcementTemplates.js";
import { buildEventIcs, icsFileName, downloadIcs, knownStartTime } from "../utils/calendarFile.js";
import { fmtDate, daysUntilIsrael } from "../utils/dateFormat.js";
import styles from "./AnnouncementScreen.module.css";
import Icon from "../components/ui/Icon.jsx";
import { COMPANY } from "../data/company.js";
import { guestHosts } from "../utils/guestRoutes.js";
import { useGuestTitle } from "../hooks/useGuestTitle.js";

/**
 * Public Save-the-Date / designed invitation.
 *
 * One component renders both: they are the same page at two moments in the
 * run-up, so sharing it keeps them visually part of the same event and means a
 * theme change lands on both instead of them drifting apart.
 *
 * Resolves through the existing invite token — no new token type, no migration.
 */

// `type` is one of the HEBREW strings in constants.js EVENT_TYPES — there are no
// English keys anywhere in this field. This fixture said "wedding", which
// matches nothing in announcementTemplates.js and fell silently through to the
// "אחר" headline, so the dev preview of the wedding invitation has never once
// shown the wedding copy. (CLAUDE.md bug class 1.)
const MOCK = {
  name: "חתונת נועה וטל", date: "2026-09-15", venue: "אולמי הגן, רחובות",
  brideName: "נועה", groomName: "טל", type: "חתונה",
  rsvpToken: "aaaa", inviteToken: "bbbb",
  announcements: null,
};

/* Days until the event, on the page every guest opens.
 *
 * THE BUG: this used to be `Math.ceil((target - now) / 86_400_000)` over a raw
 * duration, and it was the ONLY "days until" in the product that did not go
 * through `daysUntil()` — the dashboard and the hub both do. Two failures came
 * out of that, and both were measured at TZ=Asia/Jerusalem against the app's
 * own helper as the oracle:
 *
 *   • `ceil` on a duration overcounts at any hour other than the event's own.
 *     On the morning before a wedding the invitation said "2 ימים לאירוע", and
 *     ON THE MORNING OF THE WEDDING it said "1 יום לאירוע" — telling the guests
 *     the wedding is tomorrow, on the day.
 *   • fixed-millisecond arithmetic breaks across a DST change. Two dates 48
 *     calendar hours apart at the same wall-clock time read as 3 days across
 *     Israel's 2026-10-25 fall-back.
 *
 * `daysUntil` counts CALENDAR days from local midnight to local midnight, which
 * is what "ימים לאירוע" means. The interval stays: the page can sit open past
 * midnight and the number has to change when the date does.
 *
 * Midnight IN ISRAEL (daysUntilIsrael, T5): a guest abroad is on a different
 * date for part of every day, and the event's date is Israel's.
 */
function useCountdown(date) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!date) return;
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, [date]);
  if (!date) return null;
  const days = daysUntilIsrael(date);
  // null on an unparseable date; nothing on the day itself or after it, which
  // is where the page switches to its own "today" copy.
  if (days === null || days <= 0) return null;
  return days;
}

export default function AnnouncementScreen({ kind, localEvent }) {
  const { token } = useParams();
  // Host preview: rendered inside the app from local data, so the host can see
  // the page before it is published — and before the event ever reaches the
  // cloud. Without this the preview iframe would 404 on a fresh event.
  const isPreview = !!localEvent;
  const [event, setEvent] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error
  useGuestTitle(!localEvent && event && `${kind === "saveTheDate" ? "שמרו את התאריך" : "הזמנה"} · ${guestHosts(event)}`);

  useEffect(() => {
    if (localEvent) {
      setEvent({
        name: localEvent.name, date: localEvent.date, venue: localEvent.venue,
        type: localEvent.type,
        brideName: localEvent.brideName, groomName: localEvent.groomName,
        celebrantName: localEvent.celebrantName,
        organizationName: localEvent.organizationName,
        ownerName: localEvent.ownerName,
        rsvpToken: localEvent.tokens?.rsvp, inviteToken: localEvent.tokens?.invite,
        announcements: localEvent.announcements,
        site: localEvent.eventSite ?? null,
      });
      setState("ready");
      return;
    }
    let cancelled = false;
    (async () => {
      let data;
      try {
        data = await fetchEventByToken("invite", token);
      } catch {
        if (!cancelled) setState("unreachable");
        return;
      }
      if (cancelled) return;
      if (data) { setEvent(data); setState("ready"); }
      // Dev only — a deploy with no env showed a made-up event (106).
      else if (import.meta.env.DEV && !isSupabaseConfigured) { setEvent(MOCK); setState("ready"); }
      else setState("error");
    })();
    return () => { cancelled = true; };
  }, [token, localEvent]);

  const ann = useMemo(
    () => normalizeAnnouncement(event?.announcements?.[kind], kind, event?.type),
    [event, kind],
  );
  const theme = useMemo(() => getSiteTheme(ann.themeKey), [ann.themeKey]);
  const font  = useMemo(() => getSiteFont(ann.fontKey), [ann.fontKey]);
  const days  = useCountdown(event?.date);

  const vars = useMemo(() => ({
    "--a-bg": theme.bg, "--a-surface": theme.surface, "--a-ink": theme.ink,
    "--a-muted": theme.muted, "--a-accent": theme.accent,
    "--a-accent-soft": theme.accentSoft, "--a-line": theme.line,
    "--a-on-accent": theme.onAccent, "--a-font": font.stack,
  }), [theme, font]);

  if (state === "loading") {
    // Every state is the page's one <main> (38a), as the loaded page is.
    return <main className={styles.state}><span className={styles.star} aria-hidden="true">✦</span><p role="status">טוען…</p></main>;
  }
  if (state === "error") {
    return (
      <main className={styles.state}>
        <span className={styles.star} aria-hidden="true">✦</span>
        <h1 className={styles.stateTitle}>{INVALID_LINK_TEXT.title}</h1>
        <p className={styles.stateSub}>{INVALID_LINK_TEXT.body}</p>
        <Link to="/" className={styles.homeLink}>לדף הבית</Link>
      </main>
    );
  }
  if (state === "unreachable") {
    return (
      <main className={styles.state}>
        <span className={styles.star}>✦</span>
        <h1 className={styles.stateTitle}>{UNREACHABLE_TEXT.title}</h1>
        <p className={styles.stateSub}>{UNREACHABLE_TEXT.body}</p>
      </main>
    );
  }

  // The host may not have published this one yet — say so plainly rather than
  // rendering a half-empty page that looks broken.
  if (!ann.enabled && !isPreview) {
    return (
      <main className={styles.state}>
        <span className={styles.star}>✦</span>
        <h1 className={styles.stateTitle}>הדף עדיין לא פורסם</h1>
        <p className={styles.stateSub}>בעלי האירוע עדיין עובדים עליו — נסו שוב מאוחר יותר</p>
        <Link to="/" className={styles.homeLink}>לדף הבית</Link>
      </main>
    );
  }

  const names = [event.brideName, event.groomName].filter(Boolean).join(" ♥ ")
             || event.celebrantName || event.organizationName
             // ברית, בריתה, יום הולדת, אירוע משפחתי and אחר keep their one
             // name here — without it a birthday invitation named nobody and
             // the page had no h1 at all (second review, סב20).
             || event.ownerName || "";

  /* After the day (Israel's date), the page stops announcing. It went on
     saying "שמרו את התאריך" with "הוסיפו ליומן" under it about a date that
     had passed (audit 3.10, P2-7). The same rule as the RSVP page (36h):
     from the day after, say the event took place, drop the calendar and the
     RSVP, keep the way to the site — which is where the album lives. The
     host's eyebrow and message go too: both were written to announce it. */
  const daysLeft = event.date ? daysUntilIsrael(event.date) : null;
  const passed = daysLeft !== null && daysLeft < 0;

  const addToCalendar = () => {
    // The same start time as the site and the RSVP page. Without it this
    // button wrote 19:00 while the site's said 21:00 — the two-answers bug
    // WORKPLAN ס closed everywhere else (29.9 review). The invite token only
    // carries the site once it is published; before that there is no time to
    // give, and the file is an all-day entry rather than an invented 19:00.
    const ics = buildEventIcs({
      name: event.name, date: event.date, venue: event.venue,
      startTime: knownStartTime(event.site?.schedule),
      url: window.location.href,
    });
    if (ics) downloadIcs(ics, icsFileName(event.name));
  };

  return (
    <div className={[styles.root, styles["layout_" + ann.layout]].join(" ")} style={vars}>
      {ann.photo && (
        <div className={styles.photo} style={{ backgroundImage: `url(${ann.photo})` }} aria-hidden="true" />
      )}
      <div className={styles.scrim} aria-hidden="true" />

      <main className={styles.content}>
        <div className={styles.card}>
          {ann.subheadline && !passed && <p className={styles.eyebrow}>{ann.subheadline}</p>}

          {names && <h1 className={styles.names}>{names}</h1>}

          <h2 className={styles.headline}>{passed ? "האירוע התקיים" : ann.headline}</h2>

          {event.date && (
            <p className={styles.date}>{fmtDate(event.date)}</p>
          )}

          {ann.showLocation && event.venue && (
            <p className={styles.venue}>{event.venue}</p>
          )}

          {ann.showCountdown && days != null && (
            <p className={styles.countdown}>
              <b>{days}</b> {days === 1 ? "יום" : "ימים"} לאירוע
            </p>
          )}

          {passed
            ? <p className={styles.message}>תודה לכל מי שחגג איתנו!</p>
            : ann.message && <p className={styles.message}>{ann.message}</p>}

          <div className={styles.actions}>
            {event.date && !passed && (
              <button type="button" className={styles.btnGhost} onClick={addToCalendar}>
                <Icon name="calendar" /> הוסיפו ליומן
              </button>
            )}
            {ann.showRsvp && event.rsvpToken && !passed && (
              <a className={styles.btnPrimary} href={`/rsvp/${event.rsvpToken}`}>
                אישור הגעה ←
              </a>
            )}
            {/* Only to a site that is up: `showSite` is on by default, and the
                button led every guest to "האתר בהכנה" (second review, סב36) —
                the same rule rsvpSuccessLinks already applies. */}
            {ann.showSite && event.inviteToken && event.site?.enabled && (
              <a className={styles.btnGhost} href={`/invite/${event.inviteToken}`}>
                לאתר האירוע ←
              </a>
            )}
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <Link to="/" className={styles.brand}>
          <span aria-hidden="true">✦</span> נבנה עם {COMPANY.name}
        </Link>
      </footer>
    </div>
  );
}
