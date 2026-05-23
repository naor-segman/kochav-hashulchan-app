import { useState } from "react";
import { uid } from "../utils/uid.js";
import Banner from "../components/feedback/Banner.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Field from "../components/ui/Field.jsx";
import NextStep from "../components/ui/NextStep.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import SideDot from "../components/ui/SideDot.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./ConstraintsScreen.module.css";

export default function ConstraintsScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const [formA, setFormA]       = useState("");
  const [formB, setFormB]       = useState("");
  const [formType, setFormType] = useState("together");

  const sorted    = ev.guests.slice().sort((a, b) => a.name.localeCompare(b.name));
  const sideLabel = s => s === "bride"
    ? (ev.brideName ? "צד " + ev.brideName : "צד כלה")
    : (ev.groomName ? "צד " + ev.groomName : "צד חתן");
  const gMap = Object.fromEntries(ev.guests.map(g => [g.id, g]));

  const addConstraint = () => {
    if (!formA || !formB) { showToast("יש לבחור שני אורחים", "err"); return; }
    if (formA === formB)  { showToast("לא ניתן לבחור את אותו אורח פעמיים", "err"); return; }
    const dup = ev.constraints.some(c =>
      c.type === formType &&
      ((c.guestA === formA && c.guestB === formB) || (c.guestA === formB && c.guestB === formA))
    );
    if (dup) { showToast("אילוץ זה כבר קיים ברשימה", "err"); return; }
    const contra = ev.constraints.some(c =>
      c.type !== formType &&
      ((c.guestA === formA && c.guestB === formB) || (c.guestA === formB && c.guestB === formA))
    );
    if (contra) showToast("⚠ שים לב: קיים אילוץ הפוך לאותה זוג — נוסף בכל זאת", "err");
    patchEvent(e => Object.assign({}, e, {
      constraints: e.constraints.concat([{ id: uid(), type: formType, guestA: formA, guestB: formB }])
    }));
    setFormA(""); setFormB("");
    showToast("האילוץ נוסף ✓");
  };

  const delConstraint = (id, nameA, nameB, type) => {
    const label = type === "together"
      ? "להסיר את האילוץ \"יחד\" בין " + nameA + " ל" + nameB + "?"
      : "להסיר את האילוץ \"בנפרד\" בין " + nameA + " ל" + nameB + "?";
    if (!confirm(label)) return;
    patchEvent(e => Object.assign({}, e, { constraints: e.constraints.filter(c => c.id !== id) }));
    showToast("האילוץ הוסר");
  };

  const stale    = ev.constraints.filter(c => !gMap[c.guestA] || !gMap[c.guestB]);
  const together = ev.constraints.filter(c => c.type === "together" && gMap[c.guestA] && gMap[c.guestB]);
  const apart    = ev.constraints.filter(c => c.type === "apart"    && gMap[c.guestA] && gMap[c.guestB]);
  const previewReady = formA && formB && formA !== formB && gMap[formA] && gMap[formB];

  const GuestSelect = ({ value, onChange, exclude }) => (
    <select className={base.select} style={{ flex: 1 }} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— בחר אורח —</option>
      {sorted.filter(g => g.id !== exclude).map(g => (
        <option key={g.id} value={g.id}>{g.name} ({sideLabel(g.side)})</option>
      ))}
    </select>
  );

  return (
    <div className={base.page}>
      <PageHeader
        title="אילוצים"
        icon="⚖"
        sub="הגדר מי חייב לשבת יחד ומי לא יכול — המערכת תכבד זאת בסידור האוטומטי."
        aside={
          <div className={base.pills}>
            <StatPill n={together.length} label="יחד"   color={together.length > 0 ? "var(--green)" : undefined} />
            <StatPill n={apart.length}    label="בנפרד" color={apart.length > 0 ? "var(--red)" : undefined} />
          </div>
        }
      />

      {ev.guests.length < 2 && (
        <Banner variant="warn">
          יש להוסיף לפחות שני אורחים לפני הגדרת אילוצים.
          <button
            className={base.btnSm}
            style={{ marginInlineEnd: 8 }}
            onClick={() => go("guests")}
          >עבור לאורחים</button>
        </Banner>
      )}

      {stale.length > 0 && (
        <Banner variant="warn">
          {stale.length === 1 ? "אילוץ אחד מפנה" : (stale.length + " אילוצים מפנים")} לאורחים שנמחקו.
          <button
            className={[base.btnSm, base.btnDanger].join(" ")}
            style={{ marginInlineEnd: 8 }}
            onClick={() => patchEvent(e => Object.assign({}, e, {
              constraints: e.constraints.filter(c => gMap[c.guestA] && gMap[c.guestB])
            }))}
          >
            נקה אוטומטית
          </button>
        </Banner>
      )}

      <div className={base.card}>
        <SectionLabel>הוספת אילוץ חדש</SectionLabel>

        <Field label="סוג האילוץ">
          <div className={base.seg}>
            <button
              className={[base.segBtn, formType === "together" ? base.segTog : ""].filter(Boolean).join(" ")}
              onClick={() => setFormType("together")}
            >
              🤝 חייבים לשבת יחד
            </button>
            <button
              className={[base.segBtn, formType === "apart" ? base.segApart : ""].filter(Boolean).join(" ")}
              onClick={() => setFormType("apart")}
            >
              ⛔ לא יכולים לשבת יחד
            </button>
          </div>
        </Field>

        <div className={styles.constraintFormRow}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <Field label="אורח א׳"><GuestSelect value={formA} onChange={setFormA} exclude={formB} /></Field>
          </div>
          <div className={styles.constraintVerb}>
            {formType === "together" ? "יחד עם" : "בנפרד מ-"}
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <Field label="אורח ב׳"><GuestSelect value={formB} onChange={setFormB} exclude={formA} /></Field>
          </div>
          <button
            className={base.btnPrimary}
            style={{ alignSelf: "flex-end", flexShrink: 0 }}
            onClick={addConstraint}
          >
            הוסף
          </button>
        </div>

        {previewReady && (
          <div className={[
            styles.constraintPreview,
            formType === "together" ? styles.constraintPreviewTog : styles.constraintPreviewApart
          ].join(" ")}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>
              {formType === "together" ? "🤝" : "⛔"}
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {gMap[formA].name}
                <span style={{ fontWeight: 400, margin: "0 8px", opacity: 0.7 }}>
                  {formType === "together" ? "יישב/ת יחד עם" : "לא יישב/ת עם"}
                </span>
                {gMap[formB].name}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 3 }}>
                {sideLabel(gMap[formA].side)} · {gMap[formA].group}
                {"  ·  "}
                {sideLabel(gMap[formB].side)} · {gMap[formB].group}
              </div>
            </div>
          </div>
        )}
      </div>

      {together.length > 0 && (
        <div className={base.card} style={{ borderColor: "var(--green-border)" }}>
          <SectionLabel>🤝 חייבים לשבת יחד — {together.length}</SectionLabel>
          <div className={styles.cList}>
            {together.map(c => {
              const ga = gMap[c.guestA], gb = gMap[c.guestB];
              return (
                <div key={c.id} className={styles.cRow}>
                  <div className={styles.cRowMain}>
                    <SideDot side={ga.side} />
                    <span className={styles.cstName}>{ga.name}</span>
                    <span className={styles.cstVerb}>יחד עם</span>
                    <SideDot side={gb.side} />
                    <span className={styles.cstName}>{gb.name}</span>
                  </div>
                  <button
                    className={[base.btnSm, base.btnDanger].join(" ")}
                    onClick={() => delConstraint(c.id, ga.name, gb.name, c.type)}
                  >
                    הסר
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {apart.length > 0 && (
        <div className={base.card} style={{ borderColor: "var(--red-border)" }}>
          <SectionLabel>⛔ לא יכולים לשבת יחד — {apart.length}</SectionLabel>
          <div className={styles.cList}>
            {apart.map(c => {
              const ga = gMap[c.guestA], gb = gMap[c.guestB];
              return (
                <div key={c.id} className={styles.cRow}>
                  <div className={styles.cRowMain}>
                    <SideDot side={ga.side} />
                    <span className={styles.cstName}>{ga.name}</span>
                    <span className={styles.cstVerb} style={{ color: "var(--red)" }}>בנפרד מ-</span>
                    <SideDot side={gb.side} />
                    <span className={styles.cstName}>{gb.name}</span>
                  </div>
                  <button
                    className={[base.btnSm, base.btnDanger].join(" ")}
                    onClick={() => delConstraint(c.id, ga.name, gb.name, c.type)}
                  >
                    הסר
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ev.constraints.length === 0 && (
        <EmptyState icon="⚖" title="אין אילוצים"
          text="ניתן להמשיך ללא אילוצים — המערכת תנסה לקבץ אורחים לפי קבוצות וצדדים." />
      )}

      <NextStep label="המשך לסידור הושבה" hint="שבץ את כל האורחים לשולחנות" onClick={() => go("seating")} />
    </div>
  );
}
