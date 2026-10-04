import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchEventByToken, fetchGiftWall, UNREACHABLE_TEXT, INVALID_LINK_TEXT } from "../utils/publicTokens.js";
import styles from "./GiftWallScreen.module.css";
import Icon from "../components/ui/Icon.jsx";
import { COMPANY } from "../data/company.js";
import { guestHosts } from "../utils/guestRoutes.js";
import { useGuestTitle, DEAD_LINK_TAB, OFFLINE_TAB } from "../hooks/useGuestTitle.js";

// DEV-only preview blessings — shown only when no live event resolves in dev.
const MOCK_GIFTS = [
  { id: "1", donor_name: "משפחת כהן", message: "מזל טוב! שתבנו בית נאמן", created_at: new Date(Date.now() - 600000).toISOString() },
  { id: "2", donor_name: "אבי ורות לוי", message: "ברכות חמות לזוג המאושר", created_at: new Date(Date.now() - 500000).toISOString() },
  { id: "3", donor_name: "יוסי שלמה", message: "שיהיה בשעה טובה ומוצלחת!", created_at: new Date(Date.now() - 400000).toISOString() },
  { id: "4", donor_name: "צוות המשרד", message: "מכל הלב — הצלחה בדרך החדשה", created_at: new Date(Date.now() - 300000).toISOString() },
  { id: "5", donor_name: "סבתא מרים", message: "נחת ושמחה מהילדים", created_at: new Date(Date.now() - 200000).toISOString() },
  { id: "6", donor_name: "חברי הצבא", message: "לזוג האהוב — בהצלחה בדרך החדשה!", created_at: new Date(Date.now() - 100000).toISOString() },
];

const POLL_MS = 30000;

// Hebrew has a dual form and a distinct singular. "לפני 1 דקות" on a two-metre
// screen in front of 300 Hebrew speakers is the kind of detail that reads as
// unfinished.
function agoLabel(n, one, two, many) {
  if (n === 1) return `לפני ${one}`;
  if (n === 2) return `לפני ${two}`;
  return `לפני ${n} ${many}`;
}

function timeAgo(isoString) {
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 60) return "עכשיו";
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return agoLabel(minutes, "דקה", "שתי דקות", "דקות");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return agoLabel(hours, "שעה", "שעתיים", "שעות");
  const days = Math.floor(hours / 24);
  return agoLabel(days, "יום", "יומיים", "ימים");
}

export default function GiftWallScreen() {
  const { token } = useParams();
  const [event, setEvent] = useState(null);
  const [gifts, setGifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  useGuestTitle(event ? `קיר ברכות · ${guestHosts(event)}` : unreachable ? OFFLINE_TAB : !loading && DEAD_LINK_TAB);

  useEffect(() => {
    let cancelled = false;
    let retry;
    const loadEvent = async () => {
      let ev;
      try {
        ev = await fetchEventByToken("gift", token);
      } catch {
        if (cancelled) return;
        setUnreachable(true); setLoading(false);
        // Keep trying. The wall is opened on the venue's laptop, often before
        // the wifi is up, and it is not touched again all evening: one failed
        // first load left "אין חיבור כרגע" on the projector until someone
        // noticed and refreshed — measured, still there two minutes after the
        // server was back (second review, סב21).
        retry = setTimeout(loadEvent, POLL_MS);
        return;
      }
      if (!cancelled) {
        setUnreachable(false);
        setEvent(ev || null);
        setGifts(!ev && import.meta.env.DEV ? MOCK_GIFTS : []);
        setLoading(false);
      }
    };
    loadEvent();
    return () => { cancelled = true; clearTimeout(retry); };
  }, [token]);

  // Poll the blessing wall — realtime can't deliver rows RLS hides from anon.
  useEffect(() => {
    if (!event?.cloudId) return;
    let cancelled = false;
    const load = async () => {
      // A failed poll keeps the wall as it is. It used to come back as [] and
      // blank a wall projected in front of the whole hall until the next
      // successful poll (28.9 audit).
      try {
        const rows = await fetchGiftWall(token);
        if (!cancelled) setGifts(rows);
      } catch { /* keep what is on the screen */ }
    };
    load();
    const tid = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(tid); };
  }, [event?.cloudId, token]);

  // No placeholder couple here. This page is projected on a screen at the
  // venue: when the wifi dropped or the token was regenerated, `event` came
  // back null and 300 guests read a different, fictional couple's name above
  // their own blessing wall. An empty header is honest; a wrong one is not.
  let eventName = "";
  if (event) {
    if (event.brideName && event.groomName) {
      eventName = `${event.brideName} ו${event.groomName}`;
    } else {
      eventName = event.celebrantName || event.organizationName || event.name || "";
    }
  }

  if (loading) {
    return (
      <main className={styles.root}>
        <div className={styles.spinner} aria-hidden="true" />
        {/* A spinner says nothing to a screen reader (סב89). */}
        <p className="sr-only" role="status">טוען את קיר הברכות…</p>
      </main>
    );
  }

  // Previously a failed lookup fell through to the normal wall with a
  // placeholder couple's name on it. Say what happened instead.
  if (!event && gifts.length === 0) {
    return (
      <div className={styles.root}>
        <header className={styles.topBar}>
          <span className={styles.logo} aria-label={COMPANY.name}>✦ {COMPANY.name}</span>
        </header>
        <main className={styles.content}>
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true"><Icon name="alert" size={30} /></span>
            {/* Two different answers. A link that resolves to nothing is not a
                connection problem, and telling the venue to check its wifi
                for a wrong link sends them chasing the wrong fault. */}
            {unreachable ? <>
              <h1 className={styles.stateTitle}>{UNREACHABLE_TEXT.title}</h1>
              <p>{UNREACHABLE_TEXT.body}</p>
            </> : <>
              <h1 className={styles.stateTitle}>{INVALID_LINK_TEXT.title}</h1>
              <p>{INVALID_LINK_TEXT.body}</p>
              <Link to="/" className={styles.homeLink}>לדף הבית</Link>
            </>}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.topBar}>
        <span className={styles.logo} aria-label={COMPANY.name}>
          ✦ {COMPANY.name}
        </span>
        <h1 className={styles.eventName}>{eventName}</h1>
        <span className={styles.wallLabel}>קיר ברכות</span>
      </header>

      <main className={styles.content}>
        {gifts.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true"><Icon name="mail" size={30} /></span>
            <p className={styles.emptyText}>ממתין לברכות…</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {gifts.map((g) => (
              <article key={g.id} className={styles.giftCard}>
                <div className={styles.giftName}>{g.donor_name}</div>
                {g.message && (
                  <p className={styles.giftMsg}>"{g.message}"</p>
                )}
                <time className={styles.giftTime} dateTime={g.created_at}>
                  {timeAgo(g.created_at)}
                </time>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className={styles.bottomBar}>
        <p className={styles.totalLine}>
          {gifts.length > 0
            // "1 ברכות התקבלו" was the first line of the evening on the big
            // screen (WORKPLAN ל2).
            ? (gifts.length === 1 ? "ברכה אחת התקבלה 💛" : `${gifts.length} ברכות התקבלו 💛`)
            : `${COMPANY.name} ✦`}
        </p>
      </footer>
    </div>
  );
}
