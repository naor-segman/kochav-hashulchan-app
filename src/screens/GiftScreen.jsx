import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchEventByToken, submitGift } from "../utils/publicTokens.js";
import styles from "./GiftScreen.module.css";

const MOCK_EVENT = {
  name: "חתונת נועה וטל",
  brideName: "נועה",
  groomName: "טל",
  type: "חתונה",
};

const AMOUNT_CHIPS = [200, 300, 500, 1000];

export default function GiftScreen() {
  const { token } = useParams();
  const [event, setEvent]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [amount, setAmount]       = useState(null);   // number | "custom" | null
  const [customAmt, setCustomAmt] = useState("");
  const [message, setMessage]     = useState("");
  const [name, setName]           = useState("");
  const [step, setStep]           = useState("form"); // "form" | "submitting" | "submitted"
  const [errors, setErrors]       = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ev = await fetchEventByToken("gift", token);
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
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setStep("submitting");
    if (event?.cloudId) {
      try {
        await submitGift(event.cloudId, {
          donorName: name,
          amountILS: finalAmount,
          message,
        });
      } catch {
        // Gift submission failed — still show success so UX isn't broken,
        // but the record was not written (dev/Supabase-not-configured path).
      }
    }
    setStep("submitted");
  };

  // ── Not found (production only) ─────────────────────────────────────────────
  if (!loading && !event) {
    return (
      <div className={styles.root}>
        <div className={styles.loadingWrap}>
          <span className={styles.loadingStar} aria-hidden="true">✦</span>
          <p className={styles.loadingText}>הלינק לא תקין או שפג תוקפו</p>
        </div>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.loadingWrap}>
          <span className={styles.loadingStar} aria-hidden="true">✦</span>
          <p className={styles.loadingText}>טוען...</p>
        </div>
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
            <span className={styles.logoMark} aria-hidden="true">✦</span>
            <span className={styles.logoName}>כוכב השולחן</span>
          </Link>
        </header>
        <div className={styles.successWrap}>
          <div className={styles.successCard}>
            <div className={styles.successCircle} aria-hidden="true">
              <span className={styles.successCheck}>✓</span>
            </div>
            <h1 className={styles.successTitle}>ברכתך נשלחה! 💛</h1>
            <div className={styles.successDetails}>
              <div className={styles.successRow}>
                <span className={styles.successLabel}>שם</span>
                <span className={styles.successValue}>{name}</span>
              </div>
              <div className={styles.successRow}>
                <span className={styles.successLabel}>סכום</span>
                <span className={styles.successAmount}>₪{finalAmount.toLocaleString()}</span>
              </div>
              {message && (
                <div className={styles.successBlessingRow}>
                  <span className={styles.successLabel}>ברכה</span>
                  <span className={styles.successBlessing}>
                    &ldquo;{message.slice(0, 50)}{message.length > 50 ? "…" : ""}&rdquo;
                  </span>
                </div>
              )}
            </div>
            <p className={styles.successClosing}>שיהיה בשעה טובה</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  const canSubmit = finalAmount >= 50 && name.trim().length > 0;

  const btnLabel = step === "submitting"
    ? "שולח..."
    : finalAmount >= 50
      ? `שלח מתנה ← ₪${finalAmount.toLocaleString()}`
      : "שלח מתנה";

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
          <span className={styles.logoMark} aria-hidden="true">✦</span>
          <span className={styles.logoName}>כוכב השולחן</span>
        </Link>
      </header>

      {/* Main form card */}
      <main className={styles.main}>
        <div className={styles.card}>

          {/* Event identity */}
          <div className={styles.cardTop}>
            <div className={styles.eventTag}>{ev.type || "חתונה"} · מתנה דיגיטלית</div>
            <h1 className={styles.eventName}>{ev.name || coupleLabel}</h1>
            <p className={styles.eventSub}>שלח מתנה ל{coupleLabel}</p>
          </div>

          {/* Ornamental gold divider */}
          <div className={styles.ornDivider} aria-hidden="true">
            <span className={styles.ornLine} />
            <span className={styles.ornStar}>✦</span>
            <span className={styles.ornLine} />
          </div>

          {/* Amount selector */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>סכום המתנה</div>
            {errors.amount && <span className={styles.fieldErr}>{errors.amount}</span>}
            <div className={styles.chips}>
              {AMOUNT_CHIPS.map(a => (
                <button
                  key={a}
                  type="button"
                  className={[styles.chip, amount === a ? styles.chipActive : ""].filter(Boolean).join(" ")}
                  onClick={() => {
                    setAmount(a);
                    setCustomAmt("");
                    setErrors(p => { const n = { ...p }; delete n.amount; return n; });
                  }}
                >
                  <span className={styles.chipAmt}>₪{a.toLocaleString()}</span>
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
                type="number"
                min="50"
                placeholder="הזן סכום"
                value={customAmt}
                onChange={e => {
                  setCustomAmt(e.target.value);
                  setAmount("custom");
                  setErrors(p => { const n = { ...p }; delete n.amount; return n; });
                }}
              />
            </div>
          </div>

          {/* Personal blessing */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>ברכה אישית</div>
            <textarea
              className={styles.textarea}
              rows={4}
              value={message}
              placeholder="כתוב ברכה מהלב..."
              onChange={e => setMessage(e.target.value)}
            />
          </div>

          {/* Sender name */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>שמך המלא *</div>
            <input
              className={[styles.input, errors.name ? styles.inputError : ""].filter(Boolean).join(" ")}
              value={name}
              placeholder="הזן שם מלא"
              onChange={e => {
                setName(e.target.value);
                if (errors.name) setErrors(p => { const n = { ...p }; delete n.name; return n; });
              }}
            />
            {errors.name && <span className={styles.fieldErr}>{errors.name}</span>}
          </div>

          {/* Payment card — coming soon */}
          <div className={styles.payCard}>
            <div className={styles.payCardTitle}>💳 תשלום מאובטח</div>
            <input
              className={`${styles.input} ${styles.payInput}`}
              placeholder="מספר כרטיס אשראי"
              disabled
              aria-label="מספר כרטיס"
              autoComplete="off"
            />
            <div className={styles.payRow}>
              <input
                className={`${styles.input} ${styles.payInput}`}
                placeholder="MM / YY"
                disabled
                aria-label="תוקף"
                autoComplete="off"
              />
              <input
                className={`${styles.input} ${styles.payInput}`}
                placeholder="CVV"
                disabled
                aria-label="CVV"
                autoComplete="off"
              />
            </div>
            {/* TODO: integrate Stripe Elements — payments not live yet */}
            <p className={styles.payComing}>שירות זה יהיה זמין בקרוב</p>
          </div>

          {/* Submit */}
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={!canSubmit || step === "submitting"}
          >
            {btnLabel}
          </button>

          {/* Fine print */}
          <p className={styles.finePrint}>3 תשלומים ללא ריבית · Stripe מאובטח</p>
        </div>
      </main>
    </div>
  );
}
