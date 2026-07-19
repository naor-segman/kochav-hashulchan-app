import { useState, useRef, useCallback } from "react";
import { EVENT_TYPES } from "../data/constants.js";
import { getEventPersonalConfig, getEventNamePlaceholder } from "../utils/eventHelpers.js";
import Banner from "../components/feedback/Banner.jsx";
import Divider from "../components/ui/Divider.jsx";
import Field from "../components/ui/Field.jsx";
import NextStep from "../components/ui/NextStep.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./EventSetupScreen.module.css";

const SHARE_LINKS = [
  { key: "rsvp",    label: "RSVP אישור הגעה",  path: "/rsvp/",    icon: "📋" },
  { key: "invite",  label: "הזמנה דיגיטלית",   path: "/invite/",  icon: "💌" },
  { key: "gift",    label: "מתנה דיגיטלית",    path: "/gift/",    icon: "💛" },
  { key: "hostess", label: "מצב דיילות",        path: "/hostess/", icon: "🏷" },
];

export default function EventSetupScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const [form, setForm] = useState({
    name:             ev.name             || "",
    type:             ev.type             || "חתונה",
    date:             ev.date             || "",
    venue:            ev.venue            || "",
    brideName:        ev.brideName        || "",
    groomName:        ev.groomName        || "",
    celebrantName:    ev.celebrantName    || "",
    organizationName: ev.organizationName || "",
    contactName:      ev.contactName      || "",
    ownerName:        ev.ownerName        || "",
  });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);
  const nameRef = useRef(null);

  const copyLink = useCallback(async (key, url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => k === key ? null : k), 2000);
    } catch {
      showToast("לא ניתן להעתיק — העתק ידנית", "err");
    }
  }, [showToast]);

  const set = (k, v) => {
    setForm(p => Object.assign({}, p, { [k]: v }));
    setDirty(true);
    setSaved(false);
    if (errors[k]) setErrors(p => { const n = { ...p }; delete n[k]; return n; });
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "יש להזין שם לאירוע";
    setErrors(errs);
    if (errs.name) {
      showToast("יש להזין שם לאירוע", "err");
      nameRef.current?.focus();
    }
    return Object.keys(errs).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    patchEvent(form);
    setDirty(false);
    setSaved(true);
    showToast("פרטי האירוע נשמרו ✓");
  };

  const goNext = () => {
    if (!validate()) return;
    if (dirty) patchEvent(form);
    go("tables");
  };

  const saveAndNext = () => {
    if (!validate()) return;
    if (dirty) patchEvent(form);
    setDirty(false);
    setSaved(true);
    go("tables");
  };

  const BASE_URL        = window.location.origin;
  const personal        = getEventPersonalConfig(form.type);
  const namePlaceholder = getEventNamePlaceholder(form.type);
  const isNew           = !ev.name;

  return (
    <div className={base.page}>
      <PageHeader
        title={isNew ? "אירוע חדש" : "פרטי האירוע"}
        icon="✦"
        sub={isNew
          ? "הזן שם לאירוע — שדה חובה לפני המשך. שאר הפרטים אפשר להשלים בכל עת."
          : "עדכן את פרטי האירוע. תוכל לשנות הכל בכל שלב."
        }
      />

      <div className={styles.stepGuide}>
        <span className={styles.stepBadge}>שלב 1 מתוך 5 — פרטי האירוע</span>
        <span className={styles.stepText}>לאחר השמירה תוכלו להמשיך: שולחנות ← אורחים ← אילוצים ← הושבה</span>
      </div>

      {dirty && (
        <Banner variant="warn">
          יש שינויים שלא נשמרו —
          <button
            className={[base.btnSm].join(" ")}
            style={{ marginInlineEnd: 10, marginInlineStart: 4 }}
            onClick={save}
          >שמור עכשיו</button>
        </Banner>
      )}
      {saved && !dirty && <Banner variant="ok">הפרטים נשמרו ✓</Banner>}

      <div className={[base.card, dirty ? base.cardDirty : ""].filter(Boolean).join(" ")}>
        <SectionLabel>פרטי האירוע</SectionLabel>
        <p className={styles.requiredNote}>* שדה חובה — נדרש לפני המעבר לשלב הבא</p>

        <div className={base.grid2}>
          <Field label="שם האירוע" required hint="ישמש לזיהוי לאורך כל המערכת">
            <input
              ref={nameRef}
              className={[base.input, errors.name ? base.inputError : ""].filter(Boolean).join(" ")}
              value={form.name}
              placeholder={namePlaceholder}
              autoFocus={isNew}
              onChange={e => set("name", e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") save(); }}
            />
            {errors.name && <span className={styles.fieldError}>{errors.name}</span>}
          </Field>
          <Field label="סוג האירוע">
            <select className={base.select} value={form.type} onChange={e => set("type", e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="תאריך האירוע">
            <input className={base.input} type="date" value={form.date} onChange={e => set("date", e.target.value)} />
          </Field>
          <Field label="שם האולם">
            <input
              className={base.input}
              value={form.venue}
              placeholder="לדוגמה: אולמי גן עדן, תל אביב"
              onChange={e => set("venue", e.target.value)}
            />
          </Field>
        </div>

        {/* ── Personal fields — adaptive by event type ── */}

        {personal.kind === "wedding" && (
          <>
            <Divider label={personal.divider} />
            <p className={base.fieldHint} style={{ marginBottom: 12 }}>
              ישמשו לתיוג אורחים ("צד כלה" / "צד חתן") לאורך כל המערכת.
            </p>
            <div className={base.grid2}>
              <Field label="שם הכלה">
                <input
                  className={base.input}
                  value={form.brideName}
                  placeholder="לדוגמה: נועה"
                  onChange={e => set("brideName", e.target.value)}
                />
              </Field>
              <Field label="שם החתן">
                <input
                  className={base.input}
                  value={form.groomName}
                  placeholder="לדוגמה: טל"
                  onChange={e => set("groomName", e.target.value)}
                />
              </Field>
            </div>
          </>
        )}

        {(personal.kind === "bar" || personal.kind === "bat") && (
          <>
            <Divider label={personal.divider} />
            <p className={base.fieldHint} style={{ marginBottom: 12 }}>
              ישמש לזיהוי האירוע ולתיוג האורחים לאורך כל המערכת.
            </p>
            <div className={base.grid2}>
              <Field label={personal.label}>
                <input
                  className={base.input}
                  value={form.celebrantName}
                  placeholder={personal.placeholder}
                  onChange={e => set("celebrantName", e.target.value)}
                />
              </Field>
            </div>
          </>
        )}

        {personal.kind === "business" && (
          <>
            <Divider label={personal.divider} />
            <p className={base.fieldHint} style={{ marginBottom: 12 }}>
              ישמשו לזיהוי האירוע ולתיוג בכל המערכת.
            </p>
            <div className={base.grid2}>
              <Field label="שם הארגון / חברה">
                <input
                  className={base.input}
                  value={form.organizationName}
                  placeholder='לדוגמה: חברת כוכב בע"מ'
                  onChange={e => set("organizationName", e.target.value)}
                />
              </Field>
              <Field label="שם איש הקשר">
                <input
                  className={base.input}
                  value={form.contactName}
                  placeholder="לדוגמה: יוסי כהן"
                  onChange={e => set("contactName", e.target.value)}
                />
              </Field>
            </div>
          </>
        )}

        {personal.kind === "owner" && (
          <>
            <Divider label={personal.divider} />
            <p className={base.fieldHint} style={{ marginBottom: 12 }}>
              ישמש לזיהוי האירוע ולתיוג בכל המערכת.
            </p>
            <div className={base.grid2}>
              <Field label={personal.label}>
                <input
                  className={base.input}
                  value={form.ownerName}
                  placeholder={personal.placeholder}
                  onChange={e => set("ownerName", e.target.value)}
                />
              </Field>
            </div>
          </>
        )}

        <div className={base.formActions}>
          <button className={base.btnPrimary} onClick={saveAndNext}>
            שמור והמשך לשולחנות ←
          </button>
          <button className={base.btnSecondary} onClick={save}>
            {dirty ? "שמור בלבד" : (saved ? "נשמר ✓" : "שמור פרטים")}
          </button>
          {saved && !dirty && (
            <span className={styles.savedNote}>עודכן בהצלחה</span>
          )}
        </div>
      </div>

      {/* ── Sharing links card ── */}
      <div className={base.card}>
        <SectionLabel>שיתוף האירוע</SectionLabel>
        <p className={base.fieldHint} style={{ marginBottom: 14 }}>
          לינקים ייחודיים לשיתוף עם האורחים
        </p>
        {SHARE_LINKS.map(sl => {
          const url = BASE_URL + sl.path + (ev.tokens?.[sl.key] || "");
          return (
            <div key={sl.key} className={styles.shareRow}>
              <span className={styles.shareLabel}>{sl.icon} {sl.label}</span>
              <div className={styles.shareInputRow}>
                <input
                  className={[base.input, styles.shareInput].join(" ")}
                  readOnly
                  value={url}
                />
                <button
                  className={[base.btnSm, styles.copyBtn].join(" ")}
                  onClick={() => copyLink(sl.key, url)}
                  type="button"
                >
                  {copiedKey === sl.key ? "הועתק ✓" : "העתק"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <NextStep
        label="המשך להגדרת שולחנות"
        hint={ev.tables.length > 0 ? (ev.tables.length + " שולחנות מוגדרים") : "עדיין לא הוגדרו שולחנות"}
        onClick={goNext}
      />
    </div>
  );
}
