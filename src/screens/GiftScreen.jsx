import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchEventByToken, submitGift, guestWriteError, UNREACHABLE_TEXT, INVALID_LINK_TEXT } from "../utils/publicTokens.js";
import { uid } from "../utils/uid.js";
import { track, EVENTS, amountBand } from "../lib/analytics.js";
import styles from "./GiftScreen.module.css";
import Logo from "../components/brand/Logo.jsx";
import { prefixed } from "../utils/hebrewPrefix.js";
import { COMPANY } from "../data/company.js";
import { guestHosts, guestEventType } from "../utils/guestRoutes.js";
import { useGuestTitle, DEAD_LINK_TAB, OFFLINE_TAB } from "../hooks/useGuestTitle.js";
import GuestPrivacyNote from "../components/guest/GuestPrivacyNote.jsx";

const MOCK_EVENT = {
  name: "חתונת נועה וטל",
  brideName: "נועה",
  groomName: "טל",
  type: "חתונה",
};

const AMOUNT_CHIPS = [200, 300, 500, 1000];
/** The blessing's length limit on this page — in CHARACTERS (code points),
 *  the unit the server's left(message, 600) cuts in. `maxLength` and
 *  `.length` count UTF-16 units, where an emoji is two: a blessing of
 *  hearts stopped at 300 and the counter said 600 (106). */
const MESSAGE_MAX = 600;
const chars = (s) => [...String(s ?? "")].length;
const clipChars = (s, n) => { const a = [...String(s ?? "")]; return a.length > n ? a.slice(0, n).join("") : String(s ?? ""); };

// Every other money render in the app pins the locale. A bare toLocaleString()
// on a PUBLIC page hands the grouping to whatever the guest's device is set to
// — ₪1.200 on de-DE, ₪١٬٢٠٠ on ar-EG — for a shekel amount the host has to
// reconcile against a bank transfer.
const shekels = (n) => Number(n || 0).toLocaleString("he-IL");

const GIFT_MAX_ILS = 100000;   // = the SQL range, 10,000,000 agorot

export default function GiftScreen() {
  const { token } = useParams();
  const [event, setEvent]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  useGuestTitle(event ? `מתנה וברכה · ${guestHosts(event)}` : unreachable ? OFFLINE_TAB : !loading && DEAD_LINK_TAB);
  const [amount, setAmount]       = useState(null);   // number | "custom" | null
  const [customAmt, setCustomAmt] = useState("");
  const [message, setMessage]     = useState("");
  const [name, setName]           = useState("");
  const [step, setStep]           = useState("form"); // "form" | "submitting" | "submitted"
  const [errors, setErrors]       = useState({});
  // One key per filled-in form: a double tap or a retry sends the same one and
  // is stored once; a second gift from this page gets a new one (29.9 review).
  const formKey = useRef(uid());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let ev;
      try {
        ev = await fetchEventByToken("gift", token);
      } catch {
        if (!cancelled) { setUnreachable(true); setLoading(false); }
        return;
      }
      if (!cancelled) {
        if (!ev && !import.meta.env.DEV) {
          setEvent(null);
        } else {
          setEvent(ev || MOCK_EVENT);
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const finalAmount = amount === "custom"
    ? (parseInt(customAmt, 10) || 0)
    : (amount || 0);

  const validate = () => {
    const errs = {};
    if (!name.trim())                    errs.name   = "יש להזין שם מלא";
    if (!finalAmount || finalAmount < 50) errs.amount = "יש לבחור סכום (מינימום ₪50)";
    // The server's ceiling (10,000,000 agorot), said here: above it the send
    // failed with "נסו שוב", which could never succeed (second review, סב36).
    else if (finalAmount > GIFT_MAX_ILS) errs.amount = "הסכום המרבי הוא ₪100,000";
    setErrors(errs);
    // To the field, not just a message: on a phone the amount's message sits
    // far above the send button, and pressing it changed nothing on screen
    // (sixth review 30.9, measured at 390px). Focusing scrolls it into view.
    const first = errs.amount ? "gift-amount" : errs.name ? "gift-name" : null;
    if (first) document.getElementById(first)?.focus();
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setStep("submitting");
    if (event?.cloudId) {
      try {
        await submitGift(token, {
          donorName: name,
          amountILS: finalAmount,
          message,
          clientKey: formKey.current,
        });
      } catch (err) {
        setStep("form");
        setErrors({ submit: guestWriteError(err, "אירעה שגיאה בשמירת המתנה. אנא נסו שוב.") });
        return;
      }
      /* Fired only after the server accepted it, and on the GUEST's device —
         so no name, no message, no token, and the amount as a band. Until 28.9
         the page that is meant to become the revenue feature sent nothing at
         all (WORKPLAN מ2). */
      track(EVENTS.GIFT_DECLARED, { amount_band: amountBand(finalAmount), with_message: !!message.trim() });
    }
    formKey.current = uid();
    setStep("submitted");
  };

  if (unreachable) {
    return (
      <div className={styles.root}>
        <main className={styles.loadingWrap}>
          <span className={styles.loadingStar} aria-hidden="true">✦</span>
          <h1 className={styles.loadingText}>{UNREACHABLE_TEXT.title}</h1>
          <p className={styles.loadingText}>{UNREACHABLE_TEXT.body}</p>
        </main>
      </div>
    );
  }

  // ── Not found (production only) ─────────────────────────────────────────────
  if (!loading && !event) {
    return (
      <div className={styles.root}>
        <main className={styles.loadingWrap}>
          <span className={styles.loadingStar} aria-hidden="true">✦</span>
          <h1 className={styles.loadingText}>{INVALID_LINK_TEXT.title}</h1>
          <p className={styles.loadingText}>{INVALID_LINK_TEXT.body}</p>
          <Link to="/" className={styles.homeLink}>לדף הבית</Link>
        </main>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.root}>
        <main className={styles.loadingWrap}>
          <span className={styles.loadingStar} aria-hidden="true">✦</span>
          <p className={styles.loadingText} role="status">טוען…</p>
        </main>
      </div>
    );
  }

  const ev           = event || MOCK_EVENT;
  const coupleLabel  = ev.brideName && ev.groomName
    ? `${ev.brideName} ו${ev.groomName}`
    : ev.name;

  // ── Success ─────────────────────────────────────────────────────────────────
  if (step === "submitted") {
    return (
      <div className={styles.root}>
        <header className={styles.header}>
          <Link to="/" className={styles.logo}>
            <Logo tone="dark" className={styles.logoArt} title={COMPANY.name} />
          </Link>
        </header>
        <main className={styles.successWrap}>
          <div className={styles.successCard}>
            <div className={styles.successCircle} aria-hidden="true">
              <span className={styles.successCheck}>✓</span>
            </div>
            <h1 className={styles.successTitle}>ברכתכם נשלחה! 💛</h1>
            <div className={styles.successDetails}>
              <div className={styles.successRow}>
                <span className={styles.successLabel}>שם</span>
                <span className={styles.successValue}>{name}</span>
              </div>
              <div className={styles.successRow}>
                <span className={styles.successLabel}>סכום</span>
                <span className={styles.successAmount}>₪{shekels(finalAmount)}</span>
              </div>
              {message && (
                <div className={styles.successBlessingRow}>
                  <span className={styles.successLabel}>ברכה</span>
                  {/* In full. This is the guest's OWN blessing being read back
                      to them as confirmation of what was sent — cutting it at
                      50 characters made the confirmation unable to confirm the
                      thing it exists to confirm. The textarea is capped instead,
                      so the page stays bounded at the source. */}
                  <span className={styles.successBlessing}>
                    &ldquo;{message}&rdquo;
                  </span>
                </div>
              )}
            </div>

            {/* No bit / PayBox route here, by decision (11.8): a peer-to-peer
                transfer app charges the HOST the fee on money the product just
                collected on their behalf. The page's job is the blessing and
                the declared amount; the gift itself changes hands at the event.
                The stored giftBitPhone / giftPayboxLink fields are untouched —
                they round-trip through the cloud mappers. */}
            <p className={styles.successClosing}>את המתנה עצמה אפשר להעניק ביום האירוע</p>
            <p className={styles.successClosing}>שיהיה בשעה טובה</p>
          </div>
        </main>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  const btnLabel = step === "submitting"
    ? "שולח..."
    : finalAmount >= 50
      ? `שלחו מתנה ← ₪${shekels(finalAmount)}`
      : "שלחו מתנה";

  return (
    <div className={styles.root}>
      {/* Decorative background stars */}
      <div className={styles.decor} aria-hidden="true">
        <span className={`${styles.decorStar} ${styles.ds1}`}>✦</span>
        <span className={`${styles.decorStar} ${styles.ds2}`}>✦</span>
        <span className={`${styles.decorStar} ${styles.ds3}`}>✦</span>
      </div>

      {/* Small dark header */}
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <Logo tone="dark" className={styles.logoArt} title={COMPANY.name} />
        </Link>
      </header>

      {/* Main form card */}
      <main className={styles.main}>
        <div className={styles.card}>

          {/* Event identity */}
          <div className={styles.cardTop}>
            {/* Not "מתנה דיגיטלית" any more — the page does not move money,
                and a tag that says it does is a promise the screen breaks. */}
            {/* "אחר" is not a word to show a guest (106); with no type the tag
                is just what the page is. It printed the raw "אחר · ברכה ומתנה"
                (29.9 review) — the one guest page 45d6e9f missed. */}
            <div className={styles.eventTag}>
              {[guestEventType(ev.type || "חתונה"), "ברכה ומתנה"].filter(Boolean).join(" · ")}
            </div>
            <h1 className={styles.eventName}>{ev.name || coupleLabel}</h1>
            <p className={styles.eventSub}>שלחו מתנה {prefixed("ל", coupleLabel)}</p>
          </div>

          {/* Ornamental gold divider */}
          <div className={styles.ornDivider} aria-hidden="true">
            <span className={styles.ornLine} />
            <span className={styles.ornStar}>✦</span>
            <span className={styles.ornLine} />
          </div>

          {/* Amount selector */}
          <div className={styles.section}>
            <label className={styles.sectionLabel} htmlFor="gift-amount">סכום המתנה</label>
            <div className={styles.chips}>
              {AMOUNT_CHIPS.map(a => (
                <button
                  key={a}
                  type="button"
                  className={[styles.chip, amount === a ? styles.chipActive : ""].filter(Boolean).join(" ")}
                  // The chosen amount was told by colour only (סב89).
                  aria-pressed={amount === a}
                  onClick={() => {
                    setAmount(a);
                    setCustomAmt("");
                    setErrors(p => { const n = { ...p }; delete n.amount; return n; });
                  }}
                >
                  <span className={styles.chipAmt}>₪{shekels(a)}</span>
                </button>
              ))}
            </div>
            <div className={styles.customRow}>
              <span className={styles.customLabel}>סכום אחר:</span>
              <input
                className={[
                  styles.input,
                  styles.customInput,
                  amount === "custom" ? styles.inputActive : "",
                ].filter(Boolean).join(" ")}
                id="gift-amount"
                type="number"
                min="50"
                max={GIFT_MAX_ILS}
                // The minimum was stated only in the error after pressing send
                // (106). Said up front, where the amount is typed.
                placeholder="₪50 ומעלה"
                aria-describedby={errors.amount ? "gift-amount-err" : undefined}
                value={customAmt}
                onChange={e => {
                  setCustomAmt(e.target.value);
                  setAmount("custom");
                  setErrors(p => { const n = { ...p }; delete n.amount; return n; });
                }}
              />
            </div>
            {/* Under the field, not above the chips: on a phone the amount's
                message sat above the screen when the send button was pressed
                (sixth review 30.9, measured at 390px). */}
            {errors.amount && (
              <span className={styles.fieldErr} id="gift-amount-err" role="alert">{errors.amount}</span>
            )}
          </div>

          {/* Personal blessing */}
          <div className={styles.section}>
            <label className={styles.sectionLabel} htmlFor="gift-message">ברכה אישית</label>
            <textarea
              id="gift-message"
              className={styles.textarea}
              rows={4}
              value={message}
              placeholder="כתבו ברכה מהלב..."
              onChange={e => setMessage(clipChars(e.target.value, MESSAGE_MAX))}
              aria-describedby={chars(message) >= MESSAGE_MAX - 100 ? "gift-message-count" : undefined}
            />
            {/* The field stopped taking text at the limit with no sign why
                (106). Shown only near the end, with a Hebrew word between the
                numbers so bidi keeps them in reading order (bug class 7). */}
            {chars(message) >= MESSAGE_MAX - 100 && (
              <span id="gift-message-count" className={styles.counter}>
                {chars(message)} מתוך {MESSAGE_MAX} תווים
              </span>
            )}
          </div>

          {/* Sender name */}
          <div className={styles.section}>
            <label className={styles.sectionLabel} htmlFor="gift-name">שמכם המלא *</label>
            <input
              id="gift-name"
              maxLength={200}
              aria-describedby={errors.name ? "gift-name-err" : undefined}
              className={[styles.input, errors.name ? styles.inputError : ""].filter(Boolean).join(" ")}
              value={name}
              placeholder="הזינו שם מלא"
              onChange={e => {
                setName(e.target.value);
                if (errors.name) setErrors(p => { const n = { ...p }; delete n.name; return n; });
              }}
            />
            {errors.name && <span className={styles.fieldErr} id="gift-name-err" role="alert">{errors.name}</span>}
          </div>

          {/* What happens when you press the button — said before you press it,
              so nobody expects a payment screen and doesn't get one. */}
          <div className={styles.payCard}>
            <div className={styles.payCardTitle}>מה קורה עכשיו?</div>
            <p className={styles.payComing}>
              {/* "הברכה והסכום … מופיעים בקיר" was false: the wall shows the
                  name and the blessing, never an amount (28.9 audit). */}
              הברכה נרשמת ומופיעה בקיר הברכות של האירוע. הסכום נשמר רק אצל בעלי האירוע.
              את המתנה עצמה מעניקים ביום האירוע.
            </p>
          </div>

          {/* Submit */}
          {errors.submit && <p className={styles.fieldErr} role="alert">{errors.submit}</p>}
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            // Not disabled for a missing name or an amount under ₪50: a greyed
            // button with ₪30 typed gave no reason at all (fifth review 30.9,
            // סב88). Pressed, it says which field and why.
            disabled={step === "submitting"}
          >
            {btnLabel}
          </button>
          <GuestPrivacyNote text="השם, הברכה והסכום נשמרים אצל בעלי האירוע. הסכום לא מוצג לאף אחד אחר." />

          {/* The "what happens now" card above already says where the blessing
              goes; repeating it here was the same sentence twice on one card. */}
        </div>
      </main>
    </div>
  );
}
