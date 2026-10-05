import { useId, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./PackagePicker.module.css";
import {
  GUESTS_MIN, GUESTS_MAX, GUESTS_STEP, GUEST_PRESETS,
  snapGuests, priceFor, formatShekel, PACKAGES, PRICING_RULES,
} from "../../data/pricingCurve.js";

/**
 * "כמה מוזמנים יש לכם?" → the two self-serve packages at YOUR price (136).
 * The owner, on DIGINET's version: the price changes as you choose, so it
 * reads as trustworthy instead of "a general high price, and work out the
 * extras yourself".
 */
export default function PackagePicker({ initial = 300 }) {
  const [guests, setGuests] = useState(snapGuests(initial));
  const [draft, setDraft] = useState(null);       // what is being typed
  const id = useId();

  const step = (d) => { setDraft(null); setGuests(g => snapGuests(g + d)); };
  const commit = () => { if (draft != null) { setGuests(snapGuests(draft)); setDraft(null); } };

  return (
    <div className={styles.wrap}>
      <div className={styles.picker} role="group" aria-labelledby={`${id}-q`}>
        <p className={styles.q} id={`${id}-q`}>כמה מוזמנים יש לכם?</p>
        <div className={styles.stepper}>
          <button type="button" className={styles.stepBtn} onClick={() => step(GUESTS_STEP)}
                  disabled={guests >= GUESTS_MAX} aria-label={`הוספת ${GUESTS_STEP} מוזמנים`}>+</button>
          <label className={styles.count}>
            <input
              id={`${id}-n`}
              className={styles.countInput}
              type="number" inputMode="numeric"
              min={GUESTS_MIN} max={GUESTS_MAX} step={GUESTS_STEP}
              value={draft ?? guests}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === "Enter") commit(); }}
              aria-describedby={`${id}-u`}
            />
            <span className={styles.unit} id={`${id}-u`}>מוזמנים</span>
          </label>
          <button type="button" className={styles.stepBtn} onClick={() => step(-GUESTS_STEP)}
                  disabled={guests <= GUESTS_MIN} aria-label={`הורדת ${GUESTS_STEP} מוזמנים`}>−</button>
        </div>
        <div className={styles.presets}>
          {GUEST_PRESETS.map(n => (
            <button key={n} type="button" aria-pressed={guests === n}
                    className={[styles.preset, guests === n ? styles.presetOn : ""].join(" ")}
                    onClick={() => { setDraft(null); setGuests(n); }}>{n}</button>
          ))}
        </div>
        <p className={styles.rules}>{PRICING_RULES.join(" · ")}</p>
      </div>

      <div className={styles.cards} aria-live="polite">
        {PACKAGES.map(p => {
          const price = formatShekel(priceFor(p.key, guests));
          return (
            <article key={p.key} className={[styles.card, p.highlight ? styles.cardHi : ""].join(" ")}>
              {/* h2: the picker sits right under /pricing's h1 (servicePages caught
                  1→3 here). */}
              <h2 className={styles.name}>{p.name}</h2>
              <p className={styles.lead}>{p.lead}</p>
              <p className={styles.price}>
                <span className={styles.amount}>{price}</span>
                <span className={styles.per}>ל-{guests} מוזמנים</span>
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
      <p className={styles.over}>
        יותר מ-{GUESTS_MAX.toLocaleString("en-US")} מוזמנים? <a href="#human">דברו איתנו</a>
      </p>
    </div>
  );
}
