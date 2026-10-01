import styles from "./Toast.module.css";

/* A live region that is ALWAYS in the page, with the message inside it when
 * there is one (third review 30.9, סב54). The toast used to be mounted only
 * while it showed, with no role at all: 106 calls, 34 of them errors, and a
 * screen reader heard none of them — "טל כהן נוסף/ה לרשימה ✓" and "the guest
 * was not saved" alike. A region has to exist BEFORE its text changes for the
 * change to be announced reliably, hence the empty wrapper. Errors interrupt
 * (assertive); everything else waits its turn (polite). */
export default function Toast({ msg, variant }) {
  return (
    <div role="status" aria-live={variant === "err" ? "assertive" : "polite"} aria-atomic="true">
      {msg && (
        <div className={[
          styles.toast,
          variant === "err"  && styles.err,
          variant === "warn" && styles.warn,
        ].filter(Boolean).join(" ")}>
          {msg}
        </div>
      )}
    </div>
  );
}
