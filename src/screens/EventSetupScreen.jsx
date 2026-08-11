import { useState, useRef, useCallback } from "react";
import InfoTip from "../components/ui/InfoTip.jsx";
import { EVENT_TYPES } from "../data/constants.js";
import { BUILD_STEP_COUNT, stepChainAfter, nextBuildStep } from "../data/eventAreas.js";
import { useShareGate } from "../components/share/useShareGate.jsx";
import { getEventPersonalConfig, getEventNamePlaceholder, getSideLabels, COUPLE_TYPES } from "../utils/eventHelpers.js";
import Banner from "../components/feedback/Banner.jsx";
import Divider from "../components/ui/Divider.jsx";
import Icon from "../components/ui/Icon.jsx";
import Field from "../components/ui/Field.jsx";
import NextStep from "../components/ui/NextStep.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import QrCode from "../components/ui/QrCode.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import base from "../styles/screenBase.module.css";
import SectionMark from "../components/ui/SectionMark.jsx";
import styles from "./EventSetupScreen.module.css";

const SHARE_LINKS = [
  { key: "rsvp",    label: "RSVP אישור הגעה",  path: "/rsvp/",    mark: "rsvp" },
  { key: "invite",  label: "הזמנה דיגיטלית",   path: "/invite/",  mark: "invite" },
  { key: "card",    tokenKey: "invite", label: "כרטיס הזמנה + QR", path: "/card/", mark: "nameTags" },
  { key: "gift",    label: "מתנה דיגיטלית",    path: "/gift/",    mark: "gifts" },
  { key: "hostess", label: "מצב דיילות",        path: "/hostess/", mark: "hostess" },
  { key: "collab",  label: "הוספת אורחים (למשפחה)", path: "/collab/", mark: "collab" },
];

export default function EventSetupScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const [form, setForm] = useState({
    name:             ev.name             || "",
    type:             ev.type             || "חתונה",
    date:             ev.date             || "",
    venue:            ev.venue            || "",
    brideName:        ev.brideName        || "",
    groomName:        ev.groomName        || "",
    coupleType:       ev.coupleType       || "bride-groom",
    sideLabels: (ev.sideLabels && ev.sideLabels.bride && ev.sideLabels.groom)
      ? { bride: ev.sideLabels.bride, groom: ev.sideLabels.groom }
      : { bride: "", groom: "" },
    celebrantName:    ev.celebrantName    || "",
    organizationName: ev.organizationName || "",
    contactName:      ev.contactName      || "",
    ownerName:        ev.ownerName        || "",
    // No bit / PayBox fields. The gift page no longer moves money — collecting
    // through them would take a cut of every gift at the host's expense — so a
    // form that still asks for them is asking for something nothing reads. The
    // two keys are deliberately NOT removed from storage: this screen simply
    // stops writing them, so an event that already has them keeps them.
  });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);
  const nameRef = useRef(null);
  // Sharing is the moment guest mode stops being free — see useShareGate.
  const { guard, gate, isGuest } = useShareGate();

  const copyLink = useCallback(async (key, url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => k === key ? null : k), 2000);
    } catch {
      showToast("לא ניתן להעתיק — העתיקו ידנית", "err");
    }
  }, [showToast]);

  const set = (k, v) => {
    setForm(p => Object.assign({}, p, { [k]: v }));
    setDirty(true);
    setSaved(false);
    if (errors[k]) setErrors(p => { const n = { ...p }; delete n[k]; return n; });
  };

  const setSideLabel = (which, v) => {
    setForm(p => Object.assign({}, p, { sideLabels: { ...p.sideLabels, [which]: v } }));
    setDirty(true);
    setSaved(false);
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

  // The step that follows comes from the build model, not from a string in
  // this file — the default order changed once (guests moved ahead of tables)
  // and every hardcoded "go('tables')" in the product was a place it could
  // silently disagree with the numbers on screen.
  const next = nextBuildStep("setup");

  const goNext = () => {
    if (!validate()) return;
    if (dirty) patchEvent(form);
    go(next.id);
  };

  const saveAndNext = () => {
    if (!validate()) return;
    if (dirty) patchEvent(form);
    setDirty(false);
    setSaved(true);
    go(next.id);
  };

  const BASE_URL        = window.location.origin;
  const personal        = getEventPersonalConfig(form.type);
  const namePlaceholder = getEventNamePlaceholder(form.type);
  const isNew           = !ev.name;
  const coupleCfg       = COUPLE_TYPES.find(c => c.value === form.coupleType) || COUPLE_TYPES[0];
  // Effective labels the guests/lists will show — used as live placeholders so
  // the host sees what each side is called before overriding it.
  const effectiveLabels = getSideLabels({ ...form, sideLabels: null });

  return (
    <div className={base.page}>
      <PageHeader
        title={isNew ? "אירוע חדש" : "פרטי האירוע"}
        mark="setup"
        sub={isNew
          ? "הזינו שם לאירוע — שדה חובה לפני המשך. שאר הפרטים אפשר להשלים בכל עת."
          : "עדכנו את פרטי האירוע. תוכלו לשנות הכל בכל שלב."
        }
      />

      <div className={base.stepGuide}>
        <span className={base.stepBadge}>שלב 1 מתוך {BUILD_STEP_COUNT} — פרטי האירוע</span>
        <span className={base.stepText}>לאחר השמירה תוכלו להמשיך: {stepChainAfter("setup")}</span>
      </div>

      {dirty && <Banner variant="warn">יש שינויים שלא נשמרו — שמרו בכפתור למטה.</Banner>}
      {saved && !dirty && <Banner variant="ok">הפרטים נשמרו <Icon name="check" size={15} /></Banner>}

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
            <Field label="בני הזוג" hint="נתאים את התיוג בכל המערכת בהתאם">
              <div className={base.seg}>
                {COUPLE_TYPES.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    className={[base.segBtn, form.coupleType === c.value ? base.segActive : ""].filter(Boolean).join(" ")}
                    onClick={() => set("coupleType", c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </Field>
            <p className={[base.fieldHint, base.fieldHintSep].join(" ")}>
              ישמשו לתיוג אורחים ("{effectiveLabels.bride}" / "{effectiveLabels.groom}") לאורך כל המערכת.
            </p>
            <div className={base.grid2}>
              <Field label={coupleCfg.brideLabel}>
                <input
                  className={base.input}
                  value={form.brideName}
                  placeholder="לדוגמה: נועה"
                  onChange={e => set("brideName", e.target.value)}
                />
              </Field>
              <Field label={coupleCfg.groomLabel}>
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
            <p className={[base.fieldHint, base.fieldHintSep].join(" ")}>
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
            <p className={[base.fieldHint, base.fieldHintSep].join(" ")}>
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
            <p className={[base.fieldHint, base.fieldHintSep].join(" ")}>
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

        {/* ── Custom side names — available for every event type ── */}
        <Divider label="שמות הצדדים (אופציונלי)" />
        <p className={[base.fieldHint, base.fieldHintSep].join(" ")}>
          כל אורח משויך לאחד משני "צדדים" — כך המערכת מאזנת את ההושבה בין שני הצדדים.
          כאן אפשר לתת לצדדים שם משלכם (למשל "צד הכלה" / "צד החתן"). השאירו ריק כדי להשתמש
          בברירת המחדל שרואים בשדות למטה.
        </p>
        <div className={base.grid2}>
          <Field label={<>צד ראשון <InfoTip text="כל אורח משויך לאחד משני צדדים כדי שההושבה תתאזן ביניהם. השאירו ריק לשימוש בברירת המחדל." /></>}>
            <input
              className={base.input}
              value={form.sideLabels.bride}
              placeholder={effectiveLabels.bride}
              onChange={e => setSideLabel("bride", e.target.value)}
            />
          </Field>
          <Field label="צד שני">
            <input
              className={base.input}
              value={form.sideLabels.groom}
              placeholder={effectiveLabels.groom}
              onChange={e => setSideLabel("groom", e.target.value)}
            />
          </Field>
        </div>

        <div className={base.formActions}>
          <button className={base.btnPrimary} onClick={saveAndNext}>
            שמרו והמשיכו ל{next.label} <Icon name="arrowLeft" size={15} />
          </button>
          <button className={base.btnSecondary} onClick={save}>
            {dirty ? "שמרו בלבד" : (saved ? <>נשמר <Icon name="check" size={14} /></> : "שמרו פרטים")}
          </button>
          {saved && !dirty && (
            <span className={styles.savedNote}>עודכן בהצלחה</span>
          )}
        </div>
      </div>

      {/* ── Sharing links card ── */}
      <div className={base.card}>
        <SectionLabel>שיתוף האירוע</SectionLabel>
        <p className={[base.fieldHint, base.fieldHintSep].join(" ")}>
          לינקים ייחודיים לשיתוף עם האורחים
        </p>
        {SHARE_LINKS.map(sl => {
          const token = ev.tokens?.[sl.tokenKey || sl.key] || "";
          const url = BASE_URL + sl.path + token;
          return (
            <div key={sl.key} className={styles.shareRow}>
              <span className={styles.shareLabel}><SectionMark name={sl.mark} size={20} /> {sl.label}</span>
              {isGuest ? (
                // The link is WITHHELD rather than shown-and-blocked, because
                // showing it would be a lie: the public page resolves the token
                // against the cloud, and a guest-mode event has no cloud row.
                <div className={styles.shareInputRow}>
                  <span className={styles.shareLocked}>
                    <Icon name="lock" size={13} /> הקישור נפתח אחרי פתיחת חשבון
                  </span>
                  <button
                    className={[base.btnSm, styles.copyBtn].join(" ")}
                    onClick={() => guard(sl.label)}
                    type="button"
                  >
                    למה?
                  </button>
                </div>
              ) : (
                <div className={styles.shareInputRow}>
                  <input
                    className={[base.input, styles.shareInput].join(" ")}
                    readOnly
                    value={url}
                    aria-label={`קישור ל${sl.label}`}
                  />
                  <button
                    className={[base.btnSm, styles.copyBtn].join(" ")}
                    onClick={() => guard(sl.label, () => copyLink(sl.key, url))}
                    type="button"
                  >
                    {copiedKey === sl.key ? <>הועתק <Icon name="check" size={13} /></> : "העתיקו"}
                  </button>
                  {token && <QrCode url={url} label={sl.label} filename={"qr-" + sl.key} />}
                </div>
              )}
            </div>
          );
        })}
        {isGuest ? (
          <p className={base.fieldHint}>
            האירוע הזה שמור רק בדפדפן הזה, ולכן קישור שתשלחו לא ייפתח אצל האורחים.
            פתיחת חשבון היא חינם, לוקחת חצי דקה, וכל מה שבניתם עובר איתכם.
          </p>
        ) : (
          <p className={base.fieldHint}>קוד QR (▦) לכל קישור — להדפסה על שילוט בכניסה, בעמדת הדיילות או בהזמנה.</p>
        )}

      </div>

      <NextStep
        label={"המשיכו ל" + next.label}
        hint={ev.guests.length > 0 ? (ev.guests.length + " רשומות ברשימה") : "הרשימה היא הדבר שמשתנה הכי הרבה — ממנה נגזר כמה שולחנות צריך"}
        onClick={goNext}
      />
      {gate}
    </div>
  );
}
