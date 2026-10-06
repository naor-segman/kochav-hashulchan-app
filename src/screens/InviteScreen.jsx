import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import QRCode from "qrcode";
import { fetchEventByToken, UNREACHABLE_TEXT, INVALID_LINK_TEXT } from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { readGuestCardParams, guestScanPayload } from "../utils/guestCard.js";
import { tableLabel } from "../components/seating/tableLabel.js";
import { prefixed } from "../utils/hebrewPrefix.js";
import styles from "./InviteScreen.module.css";
import Logo from "../components/brand/Logo.jsx";
import Icon from "../components/ui/Icon.jsx";
import { COMPANY } from "../data/company.js";
import { guestHosts } from "../utils/guestRoutes.js";
import { useGuestTitle, DEAD_LINK_TAB, OFFLINE_TAB } from "../hooks/useGuestTitle.js";
import HebrewDate from "../components/guest/HebrewDate.jsx";

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
  const [unreachable, setUnreachable] = useState(false);
  useGuestTitle(event ? `הזמנה · ${guestHosts(event)}` : unreachable ? OFFLINE_TAB : notFound && DEAD_LINK_TAB);
  const [copied,   setCopied]   = useState(false);
  const [qrUrl,    setQrUrl]    = useState("");

  /* "name ✦ name" on one line when it fits, and a stack of three when it
     does not. Left to flex-wrap, a long pair broke anywhere it liked: the ✦
     rode at the end of the first name's line or led the second's, a stray
     mark beside one name — on 7 of 12 measured name/width pairs (audit 3.10,
     P2-9). CSS cannot ask "did this wrap", so the row's natural width is
     measured against the heading's: in both layouts each item is its own
     content width, so the answer does not flip-flop. A ref callback with a
     cleanup (React 19), because the heading only exists once the event has
     loaded; the observer also fires when the serif font arrives and widens
     the names. */
  const [namesStacked, setNamesStacked] = useState(false);
  const namesRef = useCallback((h) => {
    if (!h || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      const kids = [...h.children];
      const gap = parseFloat(getComputedStyle(h).columnGap) || 0;
      const row = kids.reduce((s, k) => s + k.getBoundingClientRect().width, 0) + gap * (kids.length - 1);
      setNamesStacked(row > h.clientWidth + 0.5);
    });
    ro.observe(h);
    for (const k of h.children) ro.observe(k);
    return () => ro.disconnect();
  }, []);

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
      let data;
      try {
        data = await fetchEventByToken("invite", token);
      } catch {
        if (!cancelled) { setUnreachable(true); setLoading(false); }
        return;
      }
      if (cancelled) return;
      if (data) {
        setEvent(data);
      } else if (import.meta.env.DEV && !isSupabaseConfigured) {
        // Dev only: Supabase not configured — use mock so the UI can be
        // previewed. A deploy with no env (a branch preview) is NOT dev, and
        // showed every visitor a made-up wedding (106).
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
          // prefixed(), not `ל${…}`. This is the text a guest FORWARDS to other
          // guests, and an event called "החתונה של דנה" went out of it as
          // "מוזמנים להחתונה של דנה" — the doubled article renderTemplate
          // already knew how to avoid.
          text:  `אתם מוזמנים ${prefixed("ל", event?.name) || "לאירוע"}`,
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
        <main className={styles.stateCenter}>
          <span className={styles.loadingStar} aria-hidden="true">✦</span>
          <p className={styles.stateText} role="status">טוען הזמנה…</p>
        </main>
      </div>
    );
  }

  if (unreachable) {
    return (
      <div className={styles.root}>
        <main className={styles.stateCenter}>
          <span className={styles.notFoundStar} aria-hidden="true">✦</span>
          <h1 className={styles.stateText}>{UNREACHABLE_TEXT.title}</h1>
          <p className={styles.stateSub}>{UNREACHABLE_TEXT.body}</p>
        </main>
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className={styles.root}>
        <main className={styles.stateCenter}>
          <span className={styles.notFoundStar} aria-hidden="true">✦</span>
          <h1 className={styles.stateText}>{INVALID_LINK_TEXT.title}</h1>
          <p className={styles.stateSub}>{INVALID_LINK_TEXT.body}</p>
          <Link to="/" className={styles.stateLink}>לדף הבית</Link>
        </main>
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
          <Logo tone="dark" className={styles.logoArt} title={COMPANY.name} />
        </Link>
      </header>

      {/* Invitation card */}
      <main className={styles.main}>
        <article className={styles.card}>
          {/* Event type tag */}
          {/* "אחר" is a real, selectable event type, and "הזמנה לאחר" is not a
              sentence. TasksScreen:114 and announcementTemplates already guard
              this value; four guest-facing surfaces did not. */}
          <div className={styles.tag}>
            {eventType && eventType !== "אחר" ? `הזמנה ל${eventType}` : "הזמנה לאירוע"}
          </div>

          {/* Hosts — a couple, a single celebrant, or nothing at all */}
          {isCouple ? (
            <h1 ref={namesRef} className={[styles.names, namesStacked && styles.namesStacked].filter(Boolean).join(" ")}>
              <span className={styles.coupleName}>{brideName}</span>
              <span className={styles.nameSep} aria-hidden="true">✦</span>
              <span className={styles.coupleName}>{groomName}</span>
            </h1>
          ) : soloName ? (
            <h1 className={styles.names}>
              <span className={styles.coupleName}>{soloName}</span>
            </h1>
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
              <span className={styles.detailText}>{formattedDate}<HebrewDate date={event.date} event={event} /></span>
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
              {/* tableLabel, not `שולחן {name}`. The default names from
                  nextTableNames() already ARE "שולחן 1", "שולחן 2", so this
                  line printed "שולחן שולחן 2" — the exact bug tableLabel.js
                  was written to remove from six other call sites, surviving in
                  the one place a stranger reads it. The WhatsApp message that
                  carries this link gets it right, one tap earlier. */}
              {personal.table
                ? <p className={styles.personalTable}><b>{tableLabel({ name: personal.table })}</b></p>
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
