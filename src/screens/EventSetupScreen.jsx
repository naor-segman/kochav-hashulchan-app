import { useState, useRef } from "react";
import InfoTip from "../components/ui/InfoTip.jsx";
import { EVENT_TYPES } from "../data/constants.js";
import { BUILD_STEP_COUNT, stepChainAfter, nextBuildStep } from "../data/eventAreas.js";
import { getEventPersonalConfig, getEventNamePlaceholder, getSideLabels, COUPLE_TYPES } from "../utils/eventHelpers.js";
import Banner from "../components/feedback/Banner.jsx";
import Divider from "../components/ui/Divider.jsx";
import Icon from "../components/ui/Icon.jsx";
import Field from "../components/ui/Field.jsx";
import NextStep from "../components/ui/NextStep.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./EventSetupScreen.module.css";

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
  const nameRef = useRef(null);

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
          ? "רק השם חובה כדי להמשיך. תאריך, מקום והשמות — אפשר להשלים מתי שנוח."
          : "כל מה שכתוב כאן מתעדכן בכל שאר המסכים. אפשר לשנות בכל שלב."
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
          <Field label="שם האירוע" required hint="כך תזהו אותו ברשימה, וכך הוא ייקרא בכל מה שהאורחים יראו">
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
          {/* Not every event is in a hall — a brit is in a shul, a birthday is
              often at home, a corporate evening is at an office. The label
              names both, and the hint says the address is a legitimate answer. */}
          <Field label="שם האולם/מיקום" hint="אולם, גן אירועים, או פשוט הכתובת">
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
            <Field label="בני הזוג" hint="לפי זה ייקראו שני הצדדים בכל המסכים">
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
            {/* Bug class 7. This line used to read
                  ("{bride}" / "{groom}")
                — a slash and two spaces between two quoted values, with no
                strong character of its own. It happens to resolve correctly
                while both sides are Hebrew, but a side named in Latin letters
                or digits (a host may type anything here) flips the pair on
                screen. "ו" is a strong Hebrew character and anchors the order
                no matter what the host types. */}
            <p className={[base.fieldHint, base.fieldHintSep].join(" ")}>
              כל אורח ישויך לצד אחד — "{effectiveLabels.bride}" או "{effectiveLabels.groom}" — בכל המסכים.
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
              השם הזה יופיע בכותרת האירוע ובהזמנה שהאורחים יקבלו.
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
              אלה יופיעו בכותרת האירוע ובהזמנה שהמוזמנים יקבלו.
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
              השם הזה יופיע בכותרת האירוע ובהזמנה שהאורחים יקבלו.
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
        {/* The example pair here carried the same bidi hazard as the wedding
            hint above — "צד הכלה" / "צד החתן" — and is now joined by "או". */}
        <p className={[base.fieldHint, base.fieldHintSep].join(" ")}>
          כל אורח שייך לאחד משני צדדים, וכך ההושבה מתאזנת ביניהם. כאן אפשר לקרוא לצדדים
          בשם שלכם — למשל "צד הכלה" או "צד החתן". השאירו ריק ונשתמש בשמות שמופיעים למטה.
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

      {/* The links themselves are not here any more — they are what the GUESTS
          receive, and this screen is the host's own details. This is the
          pointer, so nobody who knew them by their old address is left
          hunting. */}
      <div className={base.card}>
        <SectionLabel>הקישורים לאורחים</SectionLabel>
        <p className={[base.fieldHint, base.fieldHintSep].join(" ")}>
          ההזמנה, אישור ההגעה, אתר האירוע, המתנה, הטבלה השיתופית ועמדת הכניסה —
          כולם יושבים במסך אחד, עם שורה על מה שכל אחד עושה אצל האורח.
        </p>
        <button className={base.btnSecondary} type="button" onClick={() => go("share")}>
          לקישורים לאורחים <Icon name="arrowLeft" size={15} />
        </button>
      </div>

      <NextStep
        label={"המשיכו ל" + next.label}
        hint={ev.guests.length > 0 ? (ev.guests.length + " רשומות ברשימה") : "הרשימה היא הדבר שמשתנה הכי הרבה — ממנה נגזר כמה שולחנות צריך"}
        onClick={goNext}
      />
    </div>
  );
}
