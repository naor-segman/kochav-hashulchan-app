import { useMemo } from "react";
import Icon from "../ui/Icon.jsx";
import {
  editImportRow, removeImportRow, importSummary, readyImportRows, IMPORT_WARNINGS,
} from "../../utils/importReview.js";
import base from "../../styles/screenBase.module.css";
import styles from "./ImportReview.module.css";

/**
 * "This is what I understood" — the step between pasting a list and having it.
 *
 * The owner's objection to the paste feature was that if it cannot match a main
 * name to a main name, companions to companions and the phone to the phone,
 * then importing a list is irrelevant and only makes a mess. The parser is now
 * measured at 19 of 19 realistic lines, up from 8 — but a parser on free text
 * is never 100%, because Israeli guest lists have no format. They are a
 * WhatsApp thread, a spreadsheet column, a note typed one-handed.
 *
 * So this screen is the actual answer. A wrong guess stops being a mess the
 * host discovers a week before the event and becomes two seconds of typing,
 * because they see it while the list is still in their hands. It also means we
 * never have to ask anyone to reformat a list they already have — which is the
 * request that would have killed the feature outright.
 *
 * A card per row rather than a table: this is read on a phone, and four columns
 * at 390px is four unreadable columns.
 */
export default function ImportReview({ rows, existingGuests, onChange, onConfirm, onCancel, disabled }) {
  const summary = useMemo(() => importSummary(readyImportRows(rows)), [rows]);

  const edit   = (id, patch) => onChange(editImportRow(rows, id, patch, existingGuests));
  // existingGuests here too: removing the first of two identical rows has to
  // clear the duplicate flag from the second, and that means re-deriving the
  // warnings against the same baseline the build used.
  const remove = (id)        => onChange(removeImportRow(rows, id, existingGuests));

  if (!rows.length) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h3 className={styles.title}>ככה הבנתי את הרשימה</h3>
        <p className={styles.sub}>
          עברו ותקנו מה שצריך — שום דבר לא נכנס לרשימת האורחים עד שתאשרו.
          {summary.flagged > 0 && (
            <> {" "}<strong className={styles.flagged}>{summary.flagged} שורות מסומנות</strong> — כדאי להסתכל עליהן.</>
          )}
        </p>
      </div>

      <ul className={styles.rows}>
        {rows.map((r, i) => {
          const loud = (r.warnings || []).filter(w => IMPORT_WARNINGS[w]?.tone === "warn");
          return (
            <li key={r.id} className={[styles.row, loud.length ? styles.rowWarn : ""].filter(Boolean).join(" ")}>
              <div className={styles.rowTop}>
                <span className={styles.num} aria-hidden="true">{i + 1}</span>
                <input
                  className={[base.input, styles.nameInput].join(" ")}
                  value={r.name}
                  placeholder="שם האורח"
                  aria-label={`שם, שורה ${i + 1}`}
                  onChange={e => edit(r.id, { name: e.target.value })}
                />
                <button
                  type="button"
                  className={styles.removeBtn}
                  aria-label={`הסירו את ${r.name || "השורה"} מהייבוא`}
                  onClick={() => remove(r.id)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>

              <div className={styles.rowFields}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>טלפון</span>
                  <input
                    className={[base.input, styles.smallInput].join(" ")}
                    value={r.phone}
                    inputMode="tel"
                    placeholder="—"
                    onChange={e => edit(r.id, { phone: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>מקומות</span>
                  <input
                    className={[base.input, styles.seatsInput].join(" ")}
                    value={r.count}
                    inputMode="numeric"
                    onChange={e => edit(r.id, { count: e.target.value })}
                  />
                </label>
                <label className={[styles.field, styles.fieldWide].join(" ")}>
                  <span className={styles.fieldLabel}>
                    שמות המצטרפים
                    {r.count > 1 && <span className={styles.fieldHint}> · {r.count - 1} מקומות</span>}
                  </span>
                  <input
                    className={[base.input, styles.smallInput].join(" ")}
                    value={(r.companions || []).join(", ")}
                    placeholder={r.count > 1 ? "מופרדים בפסיק" : "אין"}
                    disabled={r.count < 2}
                    onChange={e => edit(r.id, { companions: e.target.value.split(",") })}
                  />
                </label>
              </div>

              {loud.length > 0 && (
                <div className={styles.flags}>
                  {loud.map(w => (
                    <span key={w} className={styles.flag}>
                      <Icon name="alert" size={12} /> {IMPORT_WARNINGS[w].label}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className={base.formActions}>
        <button
          className={[base.btnPrimary, base.btnWrap].join(" ")}
          onClick={onConfirm}
          disabled={disabled || summary.rows === 0}
        >
          + הוסיפו {summary.rows} אורחים
          {summary.seats > summary.rows ? ` · ${summary.seats} מקומות` : ""}
          {summary.withPhone > 0 ? ` · ${summary.withPhone} עם טלפון` : ""}
        </button>
        <button className={base.btnSecondary} onClick={onCancel}>חזרה לרשימה</button>
      </div>
    </div>
  );
}
