import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { fetchEventByToken, submitRSVP } from "../utils/publicTokens.js";
import styles from "./RSVPScreen.module.css";

// DEV-only preview fallback — used only when import.meta.env.DEV and Supabase
// returns no event, so the page can be designed without a live token.
const MOCK_EVENT = {
  id: null,
  cloudId: null,
  name: "חתונת נועה וטל",
  date: "2026-09-15",
  venue: "אולמי הגן, רחובות",
  brideName: "נועה",
  groomName: "טל",
  type: "חתונה",
};

function formatHebrewDate(isoDate) {
  if (!isoDate) return "";
  try {
    const [year, month, day] = isoDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const weekday = date.toLocaleDateString("he-IL", { weekday: "long" });
    const monthName = date.toLocaleDateString("he-IL", { month: "long" });
    return `${weekday}, ${day} ב${monthName} ${year}`;
  } catch {
    return isoDate;
  }
}

function PageHeader() {
  return (
    <header className={styles.header} role="banner">
      <span className={styles.headerMark} aria-hidden="true">✦</span>
      <span className={styles.headerName}>כוכב השולחן</span>
    </header>
  );
}

export default function RSVPScreen() {
  const { token } = useParams();

  const [event, setEvent] = useState(null);
  const [loadState, setLoadState] = useState("loading"); // "loading" | "error" | "ready"
  const [step, setStep] = useState("choice"); // "choice" | "yes-details" | "no-confirm" | "submitted"

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [guestsCount, setGuestsCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [attending, setAttending] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchEventByToken("rsvp", token);
      if (cancelled) return;
      if (result) {
        setEvent(result);
        setLoadState("ready");
      } else if (import.meta.env.DEV) {
        // Development fallback — shows the page with mock data before Supabase is wired.
        setEvent(MOCK_EVENT);
        setLoadState("ready");
      } else {
        setLoadState("error");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token]);

  const handleYesClick = () => {
    setAttending(true);
    setStep("yes-details");
  };

  const handleNoClick = () => {
    setAttending(false);
    setStep("no-confirm");
  };

  const handleSubmitYes = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      if (event.cloudId) {
        await submitRSVP(event.cloudId, {
          name: name.trim(),
          phone: phone.trim() || null,
          attending: true,
          guestsCount: Number(guestsCount),
        });
      }
      setStep("submitted");
    } catch {
      setSubmitError("אירעה שגיאה בשליחה. אנא נסה שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitNo = async () => {
    setSubmitError("");
    setSubmitting(true);
    try {
      if (event.cloudId) {
        await submitRSVP(event.cloudId, {
          name: "",
          phone: null,
          attending: false,
          guestsCount: 0,
        });
      }
      setStep("submitted");
    } catch {
      setSubmitError("אירעה שגיאה בשליחה. אנא נסה שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    setSubmitError("");
    setStep("choice");
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <div className={styles.page}>
        <PageHeader />
        <div className={styles.loadingWrap}>
          <span className={styles.spinner} aria-hidden="true">✦</span>
          <p className={styles.loadingText}>טוען פרטי אירוע…</p>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (loadState === "error") {
    return (
      <div className={styles.page}>
        <PageHeader />
        <div className={styles.cardWrap}>
          <div className={styles.card}>
            <div className={styles.errorState}>
              <span className={styles.errorIcon} aria-hidden="true">🔗</span>
              <h1 className={styles.errorTitle}>הלינק לא תקין או שפג תוקפו</h1>
              <p className={styles.errorBody}>
                ייתכן שהקישור פג תוקף, שגוי, או שהאירוע בוטל.
                <br />אנא פנה לבעלי האירוע לקבלת לינק מעודכן.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const formattedDate = formatHebrewDate(event.date);

  // ── Choice ──────────────────────────────────────────────────────────────────
  if (step === "choice") {
    return (
      <div className={styles.page}>
        <PageHeader />
        <div className={styles.cardWrap}>
          <div className={styles.card}>

            <div className={styles.eventInfo}>
              {event.type && (
                <span className={styles.eventTypePill}>{event.type}</span>
              )}
              <h1 className={styles.eventName}>{event.name}</h1>
              {formattedDate && (
                <p className={styles.eventDetail}>
                  <span className={styles.detailIcon} aria-hidden="true">📅</span>
                  {formattedDate}
                </p>
              )}
              {event.venue && (
                <p className={styles.eventDetail}>
                  <span className={styles.detailIcon} aria-hidden="true">📍</span>
                  {event.venue}
                </p>
              )}
            </div>

            <div className={styles.divider} role="separator" />

            <div className={styles.questionBlock}>
              <h2 className={styles.questionTitle}>האם תגיע/י לאירוע?</h2>
              <div className={styles.choiceButtons}>
                <button className={styles.btnYes} onClick={handleYesClick}>
                  <span className={styles.choiceBtnIcon} aria-hidden="true">✓</span>
                  כן, אגיע בשמחה
                </button>
                <button className={styles.btnNo} onClick={handleNoClick}>
                  <span className={styles.choiceBtnIcon} aria-hidden="true">✗</span>
                  לא אוכל להגיע
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // ── Yes Details ─────────────────────────────────────────────────────────────
  if (step === "yes-details") {
    return (
      <div className={styles.page}>
        <PageHeader />
        <div className={styles.cardWrap}>
          <div className={styles.card}>

            <div className={styles.eventBanner}>
              <span className={styles.eventBannerMark} aria-hidden="true">✦</span>
              <span className={styles.eventBannerName}>{event.name}</span>
              {formattedDate && (
                <span className={styles.eventBannerDate}>{formattedDate}</span>
              )}
            </div>

            <h2 className={styles.formTitle}>פרטי ההגעה</h2>

            <form onSubmit={handleSubmitYes} className={styles.form} noValidate>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="rsvp-name">
                  שם מלא *
                </label>
                <input
                  id="rsvp-name"
                  className={styles.input}
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="ישראל ישראלי"
                  autoComplete="name"
                  required
                  disabled={submitting}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="rsvp-phone">
                  טלפון (אופציונלי)
                </label>
                <input
                  id="rsvp-phone"
                  className={styles.input}
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="050-0000000"
                  dir="ltr"
                  autoComplete="tel"
                  disabled={submitting}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="rsvp-count">
                  כמה מגיעים?
                </label>
                <input
                  id="rsvp-count"
                  className={`${styles.input} ${styles.inputNumber}`}
                  type="number"
                  min={1}
                  max={20}
                  value={guestsCount}
                  onChange={e =>
                    setGuestsCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                  }
                  dir="ltr"
                  disabled={submitting}
                />
              </div>

              {submitError && (
                <p className={styles.submitError} role="alert">{submitError}</p>
              )}

              <button
                type="submit"
                className={styles.btnSubmitYes}
                disabled={submitting || !name.trim()}
              >
                {submitting ? "שולח…" : "שלח אישור הגעה ←"}
              </button>
            </form>

            <button
              type="button"
              className={styles.backBtn}
              onClick={goBack}
              disabled={submitting}
            >
              ← חזור
            </button>

          </div>
        </div>
      </div>
    );
  }

  // ── No Confirm ──────────────────────────────────────────────────────────────
  if (step === "no-confirm") {
    return (
      <div className={styles.page}>
        <PageHeader />
        <div className={styles.cardWrap}>
          <div className={styles.card}>

            <div className={styles.eventBanner}>
              <span className={styles.eventBannerMark} aria-hidden="true">✦</span>
              <span className={styles.eventBannerName}>{event.name}</span>
            </div>

            <div className={styles.noConfirmBlock}>
              <span
                className={styles.sadEmoji}
                role="img"
                aria-label="עצוב"
              >
                😔
              </span>
              <h2 className={styles.noConfirmTitle}>תודה שהודעת</h2>
              <p className={styles.noConfirmBody}>נשמח לראותך בהזדמנות הבאה.</p>
            </div>

            {submitError && (
              <p className={styles.submitError} role="alert">{submitError}</p>
            )}

            <button
              className={styles.btnSubmitNo}
              onClick={handleSubmitNo}
              disabled={submitting}
            >
              {submitting ? "שולח…" : "שלח אי-הגעה"}
            </button>

            <button
              type="button"
              className={styles.backBtn}
              onClick={goBack}
              disabled={submitting}
            >
              ← חזור — שיניתי את דעתי
            </button>

          </div>
        </div>
      </div>
    );
  }

  // ── Submitted ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <PageHeader />
      <div className={styles.cardWrap}>
        <div className={styles.card}>
          <div className={styles.successBlock}>
            <div className={styles.checkCircle} aria-hidden="true">
              <span className={styles.checkMark}>✓</span>
            </div>
            <h2 className={styles.successTitle}>
              {attending
                ? "תודה! אישור ההגעה נשלח בהצלחה"
                : "תגובתך נשלחה בהצלחה"}
            </h2>
            <p className={styles.successBody}>
              {attending
                ? "מחכים לראותך! 🎉"
                : "תודה שהודעת. נשמח לראותך בהזדמנות הבאה."}
            </p>
            <div className={styles.eventTag}>
              <span className={styles.eventTagMark} aria-hidden="true">✦</span>
              {event.name}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
