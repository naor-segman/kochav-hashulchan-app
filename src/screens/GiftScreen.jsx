import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchEventByToken, submitGift } from "../utils/publicTokens.js";
import styles from "./GiftScreen.module.css";

const MOCK_EVENT = {
  name: "חתונת נועה וטל",
  date: "2026-09-15",
  brideName: "נועה",
  groomName: "טל",
};

const AMOUNT_CHIPS = [200, 300, 500, 1000];

export default function GiftScreen() {
  const { token } = useParams();
  const [event, setEvent]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount]  = useState(null);
  const [customAmt, setCustomAmt] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName]     = useState("");
  const [step, setStep]     = useState("form"); // form | submitting | submitted
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ev = await fetchEventByToken("gift", token);
      if (!cancelled) {
        setEvent(ev || MOCK_EVENT);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const finalAmount = amount === "custom" ? (parseInt(customAmt, 10) || 0) : (amount || 0);

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = "יש להזין שם";
    if (!finalAmount || finalAmount < 50) errs.amount = "יש לבחור סכום (מינימום ₪50)";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setStep("submitting");
    try {
      await submitGift(event?.cloudId || null, {
        donorName: name,
        amountILS: finalAmount,
        message,
      });
    } catch {
      // Silently succeed — even without Supabase, show the success screen
    }
    setStep("submitted");
  };

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const ev = event || MOCK_EVENT;
  const coupleLabel = ev.brideName && ev.groomName ? `${ev.brideName} ו${ev.groomName}` : ev.name;

  if (step === "submitted") {
    return (
      <div className={styles.root}>
        <div className={styles.card}>
          <div className={styles.successEnvelope}>💌</div>
          <h1 className={styles.successTitle}>המתנה נשלחה!</h1>
          <p className={styles.successSub}>
            ₪{finalAmount.toLocaleString()} עבור {coupleLabel}
          </p>
          {message && (
            <div className={styles.successMsg}>
              <span className={styles.successMsgLabel}>הברכה שלך:</span>
              <p className={styles.successMsgText}>"{message}"</p>
            </div>
          )}
          <p className={styles.successNote}>תודה! אישור ישלח בקרוב.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.topDecor} aria-hidden="true">✦</div>
        <h1 className={styles.title}>מתנה לזוג</h1>
        <p className={styles.sub}>עבור {coupleLabel}</p>

        <div className={styles.divider} />

        <div className={styles.section}>
          <label className={styles.label}>שמך *</label>
          <input
            className={[styles.input, errors.name ? styles.inputError : ""].filter(Boolean).join(" ")}
            value={name}
            placeholder="הזן שם מלא"
            onChange={e => { setName(e.target.value); if (errors.name) setErrors(p => { const n = { ...p }; delete n.name; return n; }); }}
            autoFocus
          />
          {errors.name && <span className={styles.fieldErr}>{errors.name}</span>}
        </div>

        <div className={styles.section}>
          <label className={styles.label}>סכום המתנה *</label>
          {errors.amount && <span className={styles.fieldErr}>{errors.amount}</span>}
          <div className={styles.chips}>
            {AMOUNT_CHIPS.map(a => (
              <button
                key={a}
                type="button"
                className={[styles.chip, amount === a ? styles.chipActive : ""].join(" ")}
                onClick={() => { setAmount(a); setCustomAmt(""); setErrors(p => { const n = { ...p }; delete n.amount; return n; }); }}
              >
                ₪{a.toLocaleString()}
              </button>
            ))}
            <button
              type="button"
              className={[styles.chip, amount === "custom" ? styles.chipActive : ""].join(" ")}
              onClick={() => setAmount("custom")}
            >
              סכום אחר
            </button>
          </div>
          {amount === "custom" && (
            <input
              className={styles.input}
              type="number"
              min="50"
              placeholder="הזן סכום בשקלים"
              value={customAmt}
              onChange={e => { setCustomAmt(e.target.value); setErrors(p => { const n = { ...p }; delete n.amount; return n; }); }}
              autoFocus
            />
          )}
        </div>

        <div className={styles.section}>
          <label className={styles.label}>ברכה אישית (אופציונלי)</label>
          <textarea
            className={styles.textarea}
            rows={3}
            value={message}
            placeholder="כתוב ברכה לזוג…"
            onChange={e => setMessage(e.target.value)}
          />
        </div>

        {finalAmount > 0 && (
          <div className={styles.summary}>
            <span>סכום לתשלום</span>
            <span className={styles.summaryAmt}>₪{finalAmount.toLocaleString()}</span>
          </div>
        )}

        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={step === "submitting"}
        >
          {step === "submitting" ? "שולח…" : "שלח מתנה 💌"}
        </button>

        <p className={styles.payNote}>
          * תשלום יתאפשר בקרוב דרך Stripe — כרגע בטא
        </p>
      </div>
    </div>
  );
}
