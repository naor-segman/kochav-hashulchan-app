import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
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
  inviteToken: "bbbbbbbb",
  giftToken: "cccccccc",
  site: { rsvpMessage: "היי, כאן נועה וטל — כיף שאתם באים לחגוג איתנו! 💛", coverPhoto: null },
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
  const [answer, setAnswer] = useState(null); // "yes" | "maybe" | "no"

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

  const handleYesClick   = () => { setAnswer("yes");   setStep("details"); };
  const handleMaybeClick = () => { setAnswer("maybe"); setStep("details"); };
  const handleNoClick    = () => { setAnswer("no");    setStep("no-confirm"); };

  // Submit for "yes" / "maybe" (both collect name + count).
  const handleSubmitDetails = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      if (event.cloudId) {
        await submitRSVP(event.cloudId, {
          name: name.trim(),
          phone: phone.trim() || null,
          status: answer,
          attending: answer === "yes",
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
          name: name.trim(),
          phone: null,
          status: "no",
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
                <button className={styles.btnMaybe} onClick={handleMaybeClick}>
                  <span className={styles.choiceBtnIcon} aria-hidden="true">🤔</span>
                  עדיין לא בטוח/ה
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

  // ── Details (yes / maybe) ───────────────────────────────────────────────────
  if (step === "details") {
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

            <h2 className={styles.formTitle}>{answer === "maybe" ? "נשמח לדעת מי אתם" : "פרטי ההגעה"}</h2>

            <form onSubmit={handleSubmitDetails} className={styles.form} noValidate>
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
                {submitting ? "שולח…" : (answer === "maybe" ? "שלח תשובה ←" : "שלח אישור הגעה ←")}
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
              <h2 className={styles.noConfirmTitle}>חבל שלא תוכל/י להגיע</h2>
              <p className={styles.noConfirmBody}>נשמח אם תשאיר/י שם, כדי שנדע לעדכן את הרשימה.</p>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="rsvp-no-name">שם מלא *</label>
              <input
                id="rsvp-no-name"
                className={styles.input}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="ישראל ישראלי"
                autoComplete="name"
                disabled={submitting}
              />
            </div>

            {submitError && (
              <p className={styles.submitError} role="alert">{submitError}</p>
            )}

            <button
              className={styles.btnSubmitNo}
              onClick={handleSubmitNo}
              disabled={submitting || !name.trim()}
            >
              {submitting ? "שולח…" : "שלח"}
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
  const site = event.site;
  const titleByAnswer = {
    yes:   "תודה! אישור ההגעה נשלח 🎉",
    maybe: "קיבלנו — תודה שהודעת 🤔",
    no:    "תודה שהודעת 💛",
  };
  const bodyByAnswer = {
    yes:   "מחכים לראותך ולחגוג יחד!",
    maybe: "נשמח אם תעדכן/י אותנו ברגע שתדע/י בוודאות.",
    no:    "חבל שלא תוכל/י להגיע — נשמח לראותך בשמחה הבאה.",
  };
  const inviteUrl = event.inviteToken ? "/invite/" + event.inviteToken : null;
  const giftUrl   = event.giftToken   ? "/gift/"   + event.giftToken   : null;

  return (
    <div className={styles.page}>
      <PageHeader />
      <div className={styles.cardWrap}>
        <div className={styles.card}>
          <div className={styles.successBlock}>
            {site?.coverPhoto && (
              <div className={styles.successPhoto} style={{ backgroundImage: `url(${site.coverPhoto})` }} aria-hidden="true" />
            )}
            <div className={styles.checkCircle} aria-hidden="true">
              <span className={styles.checkMark}>{answer === "no" ? "💛" : "✓"}</span>
            </div>
            <h2 className={styles.successTitle}>{titleByAnswer[answer] || "תגובתך נשלחה"}</h2>
            <p className={styles.successBody}>{bodyByAnswer[answer]}</p>

            {site?.rsvpMessage && (
              <p className={styles.successPersonal}>"{site.rsvpMessage}"</p>
            )}

            {(inviteUrl || giftUrl) && (
              <div className={styles.successActions}>
                {inviteUrl && (
                  <Link to={inviteUrl} className={styles.successBtnPrimary}>← לאתר האירוע</Link>
                )}
                {giftUrl && answer !== "no" && (
                  <Link to={giftUrl} className={styles.successBtnGhost}>שליחת מתנה 💝</Link>
                )}
                {giftUrl && answer === "no" && (
                  <Link to={giftUrl} className={styles.successBtnGhost}>גם אם לא מגיעים — אפשר לשמח במתנה 💝</Link>
                )}
              </div>
            )}

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
