import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchEventByToken } from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { getSiteTheme, getSiteFont } from "../data/eventSiteTemplates.js";
import { normalizeAnnouncement } from "../data/announcementTemplates.js";
import { buildEventIcs, icsFileName, downloadIcs } from "../utils/calendarFile.js";
import { fmtDate } from "../utils/dateFormat.js";
import styles from "./AnnouncementScreen.module.css";
import Icon from "../components/ui/Icon.jsx";

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

function useCountdown(date) {
  const target = useMemo(() => {
    if (!date) return null;
    const t = new Date(date + "T18:00:00").getTime();
    return Number.isNaN(t) ? null : t;
  }, [date]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const diff = target - now;
  if (diff <= 0) return null;
  return Math.ceil(diff / 86_400_000);
}

export default function AnnouncementScreen({ kind, localEvent }) {
  const { token } = useParams();
  // Host preview: rendered inside the app from local data, so the host can see
  // the page before it is published — and before the event ever reaches the
  // cloud. Without this the preview iframe would 404 on a fresh event.
  const isPreview = !!localEvent;
  const [event, setEvent] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error

  useEffect(() => {
    if (localEvent) {
      setEvent({
        name: localEvent.name, date: localEvent.date, venue: localEvent.venue,
        type: localEvent.type,
        brideName: localEvent.brideName, groomName: localEvent.groomName,
        celebrantName: localEvent.celebrantName,
        organizationName: localEvent.organizationName,
        rsvpToken: localEvent.tokens?.rsvp, inviteToken: localEvent.tokens?.invite,
        announcements: localEvent.announcements,
      });
      setState("ready");
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await fetchEventByToken("invite", token);
      if (cancelled) return;
      if (data) { setEvent(data); setState("ready"); }
      else if (!isSupabaseConfigured) { setEvent(MOCK); setState("ready"); }
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
    return <div className={styles.state}><span className={styles.star}>✦</span><p>טוען…</p></div>;
  }
  if (state === "error") {
    return (
      <div className={styles.state}>
        <span className={styles.star}>✦</span>
        <p>הדף לא נמצא</p>
        <p className={styles.stateSub}>הקישור אינו תקף או שפג תוקפו</p>
      </div>
    );
  }

  // The host may not have published this one yet — say so plainly rather than
  // rendering a half-empty page that looks broken.
  if (!ann.enabled && !isPreview) {
    return (
      <div className={styles.state}>
        <span className={styles.star}>✦</span>
        <p>הדף עדיין לא פורסם</p>
        <p className={styles.stateSub}>בעלי האירוע עדיין עובדים עליו — נסו שוב מאוחר יותר</p>
      </div>
    );
  }

  const names = [event.brideName, event.groomName].filter(Boolean).join(" ♥ ")
             || event.celebrantName || event.organizationName || "";

  const addToCalendar = () => {
    const ics = buildEventIcs({
      name: event.name, date: event.date, venue: event.venue,
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
          {ann.subheadline && <p className={styles.eyebrow}>{ann.subheadline}</p>}

          {names && <h1 className={styles.names}>{names}</h1>}

          <h2 className={styles.headline}>{ann.headline}</h2>

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

          {ann.message && <p className={styles.message}>{ann.message}</p>}

          <div className={styles.actions}>
            {event.date && (
              <button type="button" className={styles.btnGhost} onClick={addToCalendar}>
                <Icon name="calendar" /> הוסיפו ליומן
              </button>
            )}
            {ann.showRsvp && event.rsvpToken && (
              <a className={styles.btnPrimary} href={`/rsvp/${event.rsvpToken}`}>
                אישור הגעה ←
              </a>
            )}
            {ann.showSite && event.inviteToken && (
              <a className={styles.btnGhost} href={`/invite/${event.inviteToken}`}>
                לאתר האירוע ←
              </a>
            )}
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <Link to="/" className={styles.brand}>
          <span aria-hidden="true">✦</span> נבנה בכוכב השולחן
        </Link>
      </footer>
    </div>
  );
}
