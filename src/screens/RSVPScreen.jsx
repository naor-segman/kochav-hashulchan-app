import { useState, useEffect } from "react";
import Icon from "../components/ui/Icon.jsx";
import { useParams, Link } from "react-router-dom";
import { fetchEventByToken, submitRSVP } from "../utils/publicTokens.js";
import { MEAL_OPTIONS } from "../data/constants.js";
import { COMPANION_NAME_HINT, missingCompanionSeats } from "../utils/guestForm.js";
import { buildEventIcs, icsFileName, downloadIcs } from "../utils/calendarFile.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import styles from "./RSVPScreen.module.css";
import { COMPANY } from "../data/company.js";

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
  site: {
    rsvpMessage: "היי, כאן נועה וטל — כיף שאתם באים לחגוג איתנו! 💛",
    coverPhoto: null,
    // Shuttles in the dev fixture so the pickup picker is exercisable locally.
    sections: { shuttles: true },
    shuttles: [
      { id: "mock-s1", place: "תל אביב — רכבת סבידור", time: "19:00", direction: "הלוך" },
      { id: "mock-s2", place: "חיפה — מרכזית המפרץ",   time: "18:15", direction: "הלוך" },
    ],
  },
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
      <span className={styles.headerName}>{COMPANY.name}</span>
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
  const [companions, setCompanions] = useState([]);
  const [shuttleId, setShuttleId] = useState("");
  const [meal, setMeal] = useState("");
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
        await submitRSVP(token, {
          name: name.trim(),
          phone: phone.trim() || null,
          status: answer,
          attending: answer === "yes",
          guestsCount: Number(guestsCount),
          companions: answer === "yes"
            ? companions.slice(0, Math.max(0, guestsCount - 1)).map(c => (c || "").trim()).filter(Boolean)
            : [],
          shuttleId,
          meal: answer === "yes" ? meal : "",
        });
      } else if (isSupabaseConfigured) {
        // Production with no cloud target — don't fake success and lose the RSVP.
        setSubmitError("לא ניתן לשלוח כרגע. אנא פנו לבעלי האירוע לקבלת קישור מעודכן.");
        setSubmitting(false);
        return;
      }
      setStep("submitted");
    } catch {
      setSubmitError("אירעה שגיאה בשליחה. אנא נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitNo = async () => {
    setSubmitError("");
    setSubmitting(true);
    try {
      if (event.cloudId) {
        await submitRSVP(token, {
          name: name.trim(),
          phone: null,
          status: "no",
          attending: false,
          guestsCount: 0,
        });
      } else if (isSupabaseConfigured) {
        setSubmitError("לא ניתן לשלוח כרגע. אנא פנו לבעלי האירוע לקבלת קישור מעודכן.");
        setSubmitting(false);
        return;
      }
      setStep("submitted");
    } catch {
      setSubmitError("אירעה שגיאה בשליחה. אנא נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    setSubmitError("");
    setStep("choice");
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  // Shuttles the host published, if the section is switched on. Available to
  // the form (further down `site` is only bound inside the submitted branch).
  const shuttles = (event?.site?.sections?.shuttles && Array.isArray(event?.site?.shuttles))
    ? event.site.shuttles.filter(sh => sh && sh.id)
    : [];

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
              <span className={styles.errorIcon} aria-hidden="true"><Icon name="link" size={26} /></span>
              <h1 className={styles.errorTitle}>הלינק לא תקין או שפג תוקפו</h1>
              <p className={styles.errorBody}>
                ייתכן שהקישור פג תוקף, שגוי, או שהאירוע בוטל.
                <br />אנא פנו לבעלי האירוע לקבלת לינק מעודכן.
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
                  <span className={styles.detailIcon} aria-hidden="true"><Icon name="calendar" size={18} /></span>
                  {formattedDate}
                </p>
              )}
              {event.venue && (
                <p className={styles.eventDetail}>
                  <span className={styles.detailIcon} aria-hidden="true"><Icon name="pin" size={18} /></span>
                  {event.venue}
                </p>
              )}
            </div>

            <div className={styles.divider} role="separator" />

            <div className={styles.questionBlock}>
              <h2 className={styles.questionTitle}>האם תגיע/י לאירוע?</h2>
              {/* One control, three options — so it is a real pressed-state
                  group. `aria-pressed` was missing entirely: a screen reader
                  had no way to know which answer was chosen, and sighted users
                  were told by a green fill that "yes" was ALREADY selected
                  before anything was clicked. All three now rest identically
                  and only the chosen one takes the colour. */}
              <div className={styles.choiceButtons}>
                <button
                  type="button"
                  className={[styles.choiceBtn, styles.btnYes, answer === "yes" && styles.choiceBtnOn].filter(Boolean).join(" ")}
                  aria-pressed={answer === "yes"}
                  onClick={handleYesClick}
                >
                  <span className={styles.choiceBtnIcon} aria-hidden="true"><Icon name="check" size={20} /></span>
                  כן, אגיע בשמחה
                </button>
                <button
                  type="button"
                  className={[styles.choiceBtn, styles.btnMaybe, answer === "maybe" && styles.choiceBtnOn].filter(Boolean).join(" ")}
                  aria-pressed={answer === "maybe"}
                  onClick={handleMaybeClick}
                >
                  <span className={styles.choiceBtnIcon} aria-hidden="true"><Icon name="question" size={20} /></span>
                  עדיין לא בטוח/ה
                </button>
                <button
                  type="button"
                  className={[styles.choiceBtn, styles.btnNo, answer === "no" && styles.choiceBtnOn].filter(Boolean).join(" ")}
                  aria-pressed={answer === "no"}
                  onClick={handleNoClick}
                >
                  <span className={styles.choiceBtnIcon} aria-hidden="true"><Icon name="close" size={20} /></span>
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
                  maxLength={200}
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
                  maxLength={40}
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

              {/* Every extra seat should carry a name (12.8) — but this form is
                  NOT where that is enforced, and that is a decision, not an
                  oversight.

                  Everywhere else the person typing knows the answer: the host
                  is building their own list, and the relative filling in the
                  shared table invited these people. Here the person is a
                  stranger on a phone who opened a WhatsApp link, and who may
                  genuinely not know yet who is coming with them. A hard block
                  turns "I'll fill it in later" into a closed tab, and a refused
                  RSVP is not a corrected RSVP — it is a lost one, and the host
                  is then missing the whole party rather than one name.

                  So: ask properly, offer the words that make it answerable
                  ("בעל", "אישה", "חבר"), show which boxes are still empty, and
                  accept whatever comes back. A missing name here costs a "+1"
                  on a seating chart the host can fix in their own form, which
                  DOES block. Losing the RSVP costs the head count itself. */}
              {answer === "yes" && guestsCount > 1 && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>מי מגיע איתכם?</label>
                  <p className={styles.fieldHelp}>
                    {COMPANION_NAME_HINT}. כך נושיב אתכם יחד, ובכניסה יזהו את כולם בלי לחפש.
                  </p>
                  {Array.from({ length: guestsCount - 1 }).map((_, i) => (
                    <input
                      key={i}
                      className={styles.input}
                      style={{ marginBottom: 8 }}
                      value={companions[i] || ""}
                      placeholder={`שם ${i + 1} — או ״בעל״ / ״חבר״`}
                      aria-label={`שם המצטרף ${i + 1}`}
                      disabled={submitting}
                      onChange={e => {
                        const arr = [...companions];
                        arr[i] = e.target.value;
                        setCompanions(arr);
                      }}
                    />
                  ))}
                  {/* role="status", not "alert": this is a reminder of what is
                      still open, not an error the guest committed. The submit
                      button stays enabled underneath it. */}
                  {missingCompanionSeats(companions, guestsCount).length > 0 && (
                    <p className={styles.fieldHelp} role="status">
                      {missingCompanionSeats(companions, guestsCount).length === guestsCount - 1
                        ? "אפשר גם לשלוח בלי השמות — נשמח להשלים אותם אחר כך."
                        : "נשארו מקומות בלי שם — אפשר לשלוח כך, ולהשלים אחר כך."}
                    </p>
                  )}
                </div>
              )}

              {/* The meal question belongs to the guest, not to the host.
                  It used to be settable ONLY on the host's guest list, so the
                  host was guessing who is vegan for people they had not spoken
                  to yet. Asked here, once, on the form the guest is already
                  filling in. Only for "yes" — "אולי" is not a catering number,
                  and someone who is not coming does not eat. */}
              {answer === "yes" && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="rsvp-meal">מנה מיוחדת?</label>
                  <p className={styles.fieldHelp}>אופציונלי — כדי שנעביר לאולם את ההזמנה הנכונה.</p>
                  <select
                    id="rsvp-meal"
                    className={styles.input}
                    value={meal}
                    disabled={submitting}
                    onChange={e => setMeal(e.target.value)}
                  >
                    <option value="">רגיל — בלי בקשה מיוחדת</option>
                    {MEAL_OPTIONS.filter(m => m.value !== "regular").map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Shuttle pick — only when the host actually published shuttles.
                  Riding on the RSVP means the host gets head counts without the
                  guest filling in a second form. */}
              {shuttles.length > 0 && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="rsvp-shuttle">מצטרפים להסעה?</label>
                  <p className={styles.fieldHelp}>אופציונלי — כדי שנדע כמה מקומות להזמין.</p>
                  <select
                    id="rsvp-shuttle"
                    className={styles.input}
                    value={shuttleId}
                    disabled={submitting}
                    onChange={e => setShuttleId(e.target.value)}
                  >
                    <option value="">לא מצטרפים / נגיע עצמאית</option>
                    {shuttles.map(sh => (
                      <option key={sh.id} value={sh.id}>
                        {[sh.place, sh.time, sh.direction].filter(Boolean).join(" · ")}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {submitError && (
                <p className={styles.submitError} role="alert">{submitError}</p>
              )}

              <button
                type="submit"
                className={styles.btnSubmitYes}
                disabled={submitting || !name.trim()}
              >
                {submitting ? "שולח…" : (answer === "maybe" ? "שלחו תשובה ←" : "שלחו אישור הגעה ←")}
              </button>
            </form>

            <button
              type="button"
              className={styles.backBtn}
              onClick={goBack}
              disabled={submitting}
            >
              → חזרו
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
                <Icon name="alert" size={30} />
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
              {submitting ? "שולח…" : "שלחו"}
            </button>

            <button
              type="button"
              className={styles.backBtn}
              onClick={goBack}
              disabled={submitting}
            >
              → חזרו — שיניתי את דעתי
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
    maybe: "קיבלנו — תודה שהודעתם",
    no:    "תודה שהודעתם 💛",
  };
  const bodyByAnswer = {
    yes:   "מחכים לראותכם ולחגוג יחד!",
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
              <span className={styles.checkMark}>{answer === "no" ? <Icon name="heart" size={26} /> : "✓"}</span>
            </div>
            <h2 className={styles.successTitle}>{titleByAnswer[answer] || "תגובתכם נשלחה"}</h2>
            <p className={styles.successBody}>{bodyByAnswer[answer]}</p>

            {site?.rsvpMessage && (
              <p className={styles.successPersonal}>"{site.rsvpMessage}"</p>
            )}

            {/* The moment a guest confirms is exactly when they want the date
                in their calendar — not a screen later. */}
            {answer !== "no" && event.date && (
              <button
                type="button"
                className={styles.calendarBtn}
                onClick={() => {
                  const ics = buildEventIcs({
                    name:  event.name,
                    date:  event.date,
                    venue: event.venue,
                    startTime: (site?.schedule || [])[0]?.time,
                    url:   event.inviteToken ? window.location.origin + "/invite/" + event.inviteToken : null,
                  });
                  if (ics) downloadIcs(ics, icsFileName(event.name));
                }}
              ><Icon name="calendar" /> הוסיפו את התאריך ליומן</button>
            )}

            {(inviteUrl || giftUrl) && (
              <div className={styles.successActions}>
                {inviteUrl && (
                  <Link to={inviteUrl} className={styles.successBtnPrimary}>← לאתר האירוע</Link>
                )}
                {giftUrl && answer !== "no" && (
                  <Link to={giftUrl} className={styles.successBtnGhost}>שליחת מתנה</Link>
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

            {/* Tasteful, opt-in growth CTA — appears only after the guest is done */}
            <Link to="/signup" className={styles.successPromo}>
              <span className={styles.successPromoTitle}>מתכננים אירוע בקרוב?</span>
              <span className={styles.successPromoText}>בנו אתר אירוע כזה, נהלו אישורי הגעה וסידור הושבה — בחינם →</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
