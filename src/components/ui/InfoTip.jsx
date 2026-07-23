import { useState } from "react";
import styles from "./InfoTip.module.css";

// Small contextual-help marker: an ⓘ button that toggles a short explanation.
// Use next to any label a first-time host might not understand.
export default function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.btn}
        aria-label="הסבר"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
             strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" />
        </svg>
      </button>
      {open && (
        <span className={styles.bubble} role="tooltip">
          {text}
          <button className={styles.close} onClick={() => setOpen(false)} aria-label="סגרו">✕</button>
        </span>
      )}
    </span>
  );
}
