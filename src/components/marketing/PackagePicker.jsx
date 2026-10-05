import { useId, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./PackagePicker.module.css";
import {
  GUESTS_MIN, GUESTS_MAX, GUESTS_STEP, GUEST_PRESETS,
  snapGuests, stepFor, priceFor, formatShekel, PACKAGES, PRICING_RULES,
} from "../../data/pricingCurve.js";
import { COMPANY } from "../../data/company.js";

/**
 * "כמה מוזמנים יש לכם?" → the two self-serve packages at YOUR price (136).
 * The owner, on DIGINET's version: the price changes as you choose, so it
 * reads as trustworthy instead of "a general high price, and work out the
 * extras yourself".
 */
export default function PackagePicker({ initial = 300 }) {
  const [guests, setGuests] = useState(snapGuests(initial));
  const [draft, setDraft] = useState(null);       // what is being typed
  const [over, setOver] = useState(null);         // a typed number above the top step
  const id = useId();

  /* A typed number is priced the way the event's own card prices a list: rounded
     UP to the step that covers it (stepFor), and above the top step there is no
     price, only a quote. It was rounded to the NEAREST step and capped at 1,000,
     so 320 showed ₪349 "ל-300" here and ₪399 on the event — and 5,000 showed
     the 1,000 price with a live button. Priced while typing, not on blur. */
  const typed = draft == null || String(draft).trim() === "" ? NaN : Number(draft);
  const current = draft != null
    ? (Number.isFinite(typed) ? stepFor(typed) : guests)
    : (over != null ? null : guests);

  const step = (d) => {
    const next = snapGuests(guests + d);
    if (next === guests && over == null) return;  // at a bound: nothing, focus stays
    setDraft(null); setOver(null); setGuests(next);
  };
  const commit = () => {
    if (draft == null) return;
    if (Number.isFinite(typed)) {
      const s = stepFor(typed);
      if (s == null) setOver(Math.round(typed));
      else { setOver(null); setGuests(s); }
    }
    setDraft(null);
  };
  const atMax = over == null && guests >= GUESTS_MAX;
  const atMin = over == null && guests <= GUESTS_MIN;

  return (
    <div className={styles.wrap}>
      <div className={styles.picker} role="group" aria-labelledby={`${id}-q`}>
        <p className={styles.q} id={`${id}-q`}>כמה מוזמנים יש לכם?</p>
        <div className={styles.stepper}>
          {/* aria-disabled, not disabled: a keyboard user pressing + up to the
              top had the focused button disabled under them, and focus fell to
              <body>. */}
          <button type="button" className={styles.stepBtn} onClick={() => step(GUESTS_STEP)}
                  aria-disabled={atMax || undefined} aria-label={`הוספת ${GUESTS_STEP} מוזמנים`}>+</button>
          <label className={styles.count}>
            <input
              id={`${id}-n`}
              className={styles.countInput}
              type="number" inputMode="numeric"
              min={GUESTS_MIN} max={GUESTS_MAX} step={GUESTS_STEP}
              value={draft ?? over ?? guests}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === "Enter") commit(); }}
              aria-describedby={`${id}-u`}
            />
            <span className={styles.unit} id={`${id}-u`}>מוזמנים</span>
          </label>
          <button type="button" className={styles.stepBtn} onClick={() => step(-GUESTS_STEP)}
                  aria-disabled={atMin || undefined} aria-label={`הורדת ${GUESTS_STEP} מוזמנים`}>−</button>
        </div>
        <div className={styles.presets}>
          {GUEST_PRESETS.map(n => (
            <button key={n} type="button" aria-pressed={current === n}
                    className={[styles.preset, current === n ? styles.presetOn : ""].join(" ")}
                    onClick={() => { setDraft(null); setOver(null); setGuests(n); }}>{n}</button>
          ))}
        </div>
        <p className={styles.rules}>{PRICING_RULES.join(" · ")}</p>
      </div>

      {/* What a screen reader hears on each change: the number and the two
          prices. aria-live sat on both whole cards and re-read ~540 characters
          on every press. */}
      <p className="sr-only" aria-live="polite">
        {current != null
          ? `עד ${current} מוזמנים: ${PACKAGES.map(p => `${p.name} ${formatShekel(priceFor(p.key, current))}`).join(", ")}`
          : `מעל ${GUESTS_MAX.toLocaleString("en-US")} מוזמנים — המחיר בהצעה`}
      </p>

      {current == null ? (
        <div className={styles.quote}>
          <p className={styles.quoteText}>
            מעל {GUESTS_MAX.toLocaleString("en-US")} מוזמנים המחיר בהצעה — כתבו לנו ונחזור אליכם עם מחיר לאירוע שלכם.
          </p>
          <a
            className={[styles.cta, styles.ctaHi].join(" ")}
            href={`https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(`היי, אשמח להצעת מחיר לאירוע של ${over ?? typed} מוזמנים`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            הצעת מחיר בוואטסאפ
          </a>
        </div>
      ) : (
      <div className={styles.cards}>
        {PACKAGES.map(p => {
          const price = formatShekel(priceFor(p.key, current));
          return (
            <article key={p.key} className={[styles.card, p.highlight ? styles.cardHi : ""].join(" ")}>
              {/* h2: the picker sits right under /pricing's h1 (servicePages caught
                  1→3 here). */}
              <h2 className={styles.name}>{p.name}</h2>
              <p className={styles.lead}>{p.lead}</p>
              <p className={styles.price}>
                <span className={styles.amount}>{price}</span>
                <span className={styles.per}>עד {current} מוזמנים</span>
              </p>
              <Link to="/signup" className={[styles.cta, p.highlight ? styles.ctaHi : ""].join(" ")}>
                בחירת חבילה · {price}
              </Link>
              <ul className={styles.lines}>
                {p.lines.map(l => (
                  <li key={l.t} className={l.ok ? styles.yes : styles.no}>
                    <span className={styles.mark} aria-hidden="true">{l.ok ? "✓" : "✕"}</span>
                    <span>{l.ok ? "" : <span className="sr-only">לא כלול: </span>}{l.t}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
      )}
      <p className={styles.over}>
        יותר מ-{GUESTS_MAX.toLocaleString("en-US")} מוזמנים? <a href="#human">דברו איתנו</a>
      </p>
    </div>
  );
}
