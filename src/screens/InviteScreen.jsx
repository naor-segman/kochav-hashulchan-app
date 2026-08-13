import { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import QRCode from "qrcode";
import { fetchEventByToken } from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { readGuestCardParams, guestScanPayload } from "../utils/guestCard.js";
import styles from "./InviteScreen.module.css";
import Icon from "../components/ui/Icon.jsx";

// Development fallback — displayed when Supabase is not configured locally
const MOCK_EVENT = {
  name: "חתונת נועה וטל",
  date: "2026-09-15",
  venue: "אולמי הגן, רחובות",
  brideName: "נועה",
  groomName: "טל",
  type: "חתונה",
};

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const HEBREW_MONTHS = [
  "בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני",
  "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר",
];

function formatHebrewDate(dateStr) {
  if (!dateStr) return "";
  // Parse at noon local time to avoid timezone off-by-one issues
  const date = new Date(dateStr + "T12:00:00");
  if (isNaN(date.getTime())) return dateStr;
  const dayName = HEBREW_DAYS[date.getDay()];
  const day     = date.getDate();
  const month   = HEBREW_MONTHS[date.getMonth()];
  const year    = date.getFullYear();
  return `יום ${dayName}, ה-${day} ${month} ${year}`;
}

export default function InviteScreen() {
  const { token } = useParams();
  const location  = useLocation();
  // `?g=` turns the shared invitation into one guest's personal entry card.
  const personal  = readGuestCardParams(location.search);

  const [event,    setEvent]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [qrUrl,    setQrUrl]    = useState("");

  // Personal card → QR carries the guest id, which is what the entrance
  // scanner reads. Plain invitation → QR opens the RSVP page (using the RSVP
  // token, not the card token; the /rsvp page matches on rsvp_token).
  useEffect(() => {
    const payload = personal
      ? guestScanPayload(personal.guestId)
      : (event?.rsvpToken ? window.location.origin + "/rsvp/" + event.rsvpToken : null);
    if (!payload) { setQrUrl(""); return; }
    QRCode.toDataURL(payload, { width: 260, margin: 1 })
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
  }, [event, personal]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setNotFound(false);
      const data = await fetchEventByToken("invite", token);
      if (cancelled) return;
      if (data) {
        setEvent(data);
      } else if (!isSupabaseConfigured) {
        // Dev: Supabase not configured — use mock so the UI can be previewed
        setEvent(MOCK_EVENT);
      } else {
        // Production: token not found in database
        setNotFound(true);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [token]);

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: event?.name ?? "הזמנה לאירוע",
          text:  `אתם מוזמנים ל${event?.name ?? "האירוע"}`,
          url,
        });
      } catch {
        // User dismissed the native share sheet — no action needed
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.stateCenter}>
          <span className={styles.loadingStar} aria-hidden="true">✦</span>
          <p className={styles.stateText}>טוען הזמנה...</p>
        </div>
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className={styles.root}>
        <div className={styles.stateCenter}>
          <span className={styles.notFoundStar} aria-hidden="true">✦</span>
          <p className={styles.stateText}>ההזמנה לא נמצאה</p>
          <p className={styles.stateSub}>קישור זה אינו תקף או שפג תוקפו</p>
          <Link to="/" className={styles.stateLink}>חזרה לדף הבית</Link>
        </div>
      </div>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const brideName     = event.brideName || "";
  const groomName     = event.groomName || "";
  const eventType     = event.type      || "חתונה";

  // A couple is only one of nine event types. Without this, a bar mitzvah card
  // rendered two empty name spans either side of a ✦ and then invited the guest
  // to "שמחת חתונתנו" — the boy's name appeared nowhere on his own invitation.
  const isCouple = Boolean(brideName && groomName);
  const soloName = event.celebrantName || event.organizationName || event.ownerName || "";

  // The formal line, in the possessive form each event actually uses.
  const OCCASION = {
    "חתונה":        "את שמחת חתונתנו",
    "אירוס":        "את שמחת אירוסינו",
    "חינה":         "את שמחת החינה שלנו",
    "בר מצווה":     soloName ? `את שמחת בר המצווה של ${soloName}` : "את שמחת בר המצווה",
    "בת מצווה":     soloName ? `את שמחת בת המצווה של ${soloName}` : "את שמחת בת המצווה",
    "ברית":         soloName ? `את שמחת הברית של ${soloName}`     : "את שמחת הברית",
    "בריתה":        soloName ? `את שמחת הבריתה של ${soloName}`    : "את שמחת הבריתה",
    "יום הולדת":    soloName ? `את יום ההולדת של ${soloName}`     : "את יום ההולדת",
    "אירוע משפחתי": "את האירוע המשפחתי שלנו",
    "אירוע עסקי":   "את האירוע שלנו",
    "אחר":          "את השמחה שלנו",
  };
  const occasionLine = OCCASION[eventType] || OCCASION["אחר"];
  const formattedDate = formatHebrewDate(event.date);

  // ── Invitation ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {/* Decorative background stars */}
      <div className={styles.decor} aria-hidden="true">
        <span className={`${styles.decorStar} ${styles.ds1}`}>✦</span>
        <span className={`${styles.decorStar} ${styles.ds2}`}>✦</span>
        <span className={`${styles.decorStar} ${styles.ds3}`}>✦</span>
        <span className={`${styles.decorStar} ${styles.ds4}`}>✦</span>
      </div>

      {/* Small logo */}
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true">✦</span>
          <span className={styles.logoName}>כוכב השולחן</span>
        </Link>
      </header>

      {/* Invitation card */}
      <main className={styles.main}>
        <article className={styles.card}>
          {/* Event type tag */}
          <div className={styles.tag}>הזמנה ל{eventType}</div>

          {/* Hosts — a couple, a single celebrant, or nothing at all */}
          {isCouple ? (
            <div className={styles.names}>
              <span className={styles.coupleName}>{brideName}</span>
              <span className={styles.nameSep} aria-hidden="true">✦</span>
              <span className={styles.coupleName}>{groomName}</span>
            </div>
          ) : soloName ? (
            <div className={styles.names}>
              <span className={styles.coupleName}>{soloName}</span>
            </div>
          ) : null}

          {/* Ornamental gold divider */}
          <div className={styles.divider} aria-hidden="true">
            <span className={styles.dividerLine} />
            <span className={styles.dividerStar}>✦</span>
            <span className={styles.dividerLine} />
          </div>

          {/* Formal Hebrew invitation text */}
          <p className={styles.inviteText}>
            מתכבדים להזמינכם לחגוג עמנו<br />
            {occasionLine}
          </p>

          {/* Date */}
          {formattedDate && (
            <div className={styles.detailRow}>
              <span className={styles.detailIcon} aria-hidden="true"><Icon name="calendar" size={17} /></span>
              <span className={styles.detailText}>{formattedDate}</span>
            </div>
          )}

          {/* Venue */}
          {event.venue && (
            <div className={styles.detailRow}>
              <span className={styles.detailIcon} aria-hidden="true"><Icon name="pin" size={17} /></span>
              <span className={`${styles.detailText} ${styles.detailMuted}`}>{event.venue}</span>
            </div>
          )}

          {/* Actions */}
          <div className={styles.actions}>
            <Link to={`/rsvp/${event?.rsvpToken || token}`} className={styles.btnPrimary}>
              אשרו הגעה ←
            </Link>
            <button
              type="button"
              className={styles.btnOutline}
              onClick={handleShare}
            >
              {copied ? "הועתק ✓" : "שתפו הזמנה"}
            </button>
          </div>

          {/* Personal entry card — name, table, and the QR the door scans */}
          {personal && (
            <div className={styles.personalBox}>
              {personal.name && <p className={styles.personalName}>{personal.name}</p>}
              {personal.table
                ? <p className={styles.personalTable}>שולחן <b>{personal.table}</b></p>
                : <p className={styles.personalTableNone}>מספר השולחן יעודכן בהמשך</p>}
            </div>
          )}

          {/* QR — personal card: the guest id for the entrance scanner.
              Plain invitation: a link to the RSVP page. */}
          {qrUrl && (
            <div className={styles.qrSection}>
              <div className={[styles.qrBox, personal ? styles.qrBoxLarge : ""].filter(Boolean).join(" ")}>
                <img
                  className={styles.qrImg}
                  src={qrUrl}
                  alt={personal ? "קוד כניסה אישי" : "QR קוד לאישור הגעה"}
                  width={personal ? "170" : "110"}
                  height={personal ? "170" : "110"}
                />
              </div>
              <p className={styles.qrCaption}>
                {personal ? "הציגו את הקוד בכניסה לאירוע" : "סרקו לאישור הגעה"}
              </p>
            </div>
          )}
        </article>
      </main>
    </div>
  );
}
