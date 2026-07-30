import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import base from "../../styles/screenBase.module.css";
import styles from "./ConfirmDialog.module.css";

/**
 * In-product confirm / prompt — see useConfirm.jsx for the calling API.
 *
 * Thirteen destructive actions and two creation flows went through the native
 * `confirm()` / `prompt()`, which renders the browser's own chrome — on the dev
 * host literally "127.0.0.1:5188 says". A paid product asking "delete 14 guest
 * records?" through the URL bar's dialog is the single loudest signal that the
 * thing was assembled rather than built.
 *
 * The wording of every message is carried over EXACTLY as it was: these are
 * the sentences that stop someone from deleting an evening's work, and they
 * were not the defect.
 */
export default function ConfirmDialog({
  mode = "confirm",
  message,
  danger = false,
  confirmLabel,
  cancelLabel = "ביטול",
  placeholder = "",
  defaultValue = "",
  onClose,
}) {
  const [value, setValue] = useState(defaultValue);
  const cardRef = useRef(null);
  const firstRef = useRef(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(mode === "prompt" ? null : false); return; }
      if (e.key !== "Tab") return;
      // Keep the keyboard inside the dialog — a modal the user can tab out of
      // behind is worse than no modal at all for a screen-reader user.
      const focusables = cardRef.current?.querySelectorAll(
        'button, input, [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  const submit = () => onClose(mode === "prompt" ? value : true);
  const cancel = () => onClose(mode === "prompt" ? null : false);

  // The message keeps its original line breaks — several of them are a
  // headline plus the consequence plus how to undo it, and collapsing that to
  // one paragraph loses the shape that makes it readable at a glance.
  const lines = String(message || "").split("\n");
  const title = lines[0];
  const rest  = lines.slice(1).filter(l => l.trim() !== "");

  return (
    <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) cancel(); }}>
      <div
        className={styles.card}
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <button className={styles.close} onClick={cancel} aria-label="סגירה">
          <Icon name="close" size={16} />
        </button>

        <div className={[styles.mark, danger ? styles.markDanger : ""].filter(Boolean).join(" ")}>
          <Icon name={danger ? "alert" : mode === "prompt" ? "edit" : "bulb"} size={20} />
        </div>

        <h2 className={styles.title}>{title}</h2>
        {rest.length > 0 && (
          <div className={styles.body}>
            {rest.map((l, i) => <p key={i} className={styles.line}>{l}</p>)}
          </div>
        )}

        {mode === "prompt" && (
          <input
            ref={firstRef}
            className={[base.input, styles.field].join(" ")}
            value={value}
            placeholder={placeholder}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
          />
        )}

        <div className={styles.actions}>
          <button
            ref={mode === "prompt" ? undefined : firstRef}
            className={[base.btnPrimary, danger ? styles.confirmDanger : ""].filter(Boolean).join(" ")}
            onClick={submit}
            disabled={mode === "prompt" && !value.trim()}
          >
            {confirmLabel || (mode === "prompt" ? "הוסיפו" : danger ? "כן, המשיכו" : "אישור")}
          </button>
          <button className={[base.btnSecondary].join(" ")} onClick={cancel}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}
