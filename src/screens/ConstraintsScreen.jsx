import { useState, useRef, useEffect } from "react";
import { getSideLabel } from "../utils/eventHelpers.js";
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

// ── Highlight the matched substring in a name ─────────────────────────────────
function HighlightMatch({ name, query }) {
  if (!query) return name;
  const lname  = name.toLowerCase();
  const lquery = query.toLowerCase();
  const idx    = lname.indexOf(lquery);
  if (idx === -1) return name;
  return (
    <>
      {name.slice(0, idx)}
      <mark className={styles.acMark}>{name.slice(idx, idx + query.length)}</mark>
      {name.slice(idx + query.length)}
    </>
  );
}

// ── Searchable guest picker ───────────────────────────────────────────────────
// value: guest ID (string) | ""
// onChange: called with guest ID string when a guest is selected, or "" to clear
function GuestAutocomplete({ guests, value, onChange, exclude, sideLabel, label }) {
  const selectedGuest = guests.find(g => g.id === value) ?? null;
  const [query, setQuery]   = useState(selectedGuest?.name ?? "");
  const [open, setOpen]     = useState(false);
  const [hi, setHi]         = useState(-1);
  const containerRef        = useRef(null);
  const valueRef            = useRef(value);

  useEffect(() => { valueRef.current = value; }, [value]);

  // Sync display text when selection is cleared from outside (e.g. after save)
  useEffect(() => {
    const g = guests.find(g => g.id === value);
    setQuery(g ? g.name : "");
  }, [value, guests]);

  // Close and restore on outside click
  useEffect(() => {
    const handler = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setHi(-1);
        const g = guests.find(g => g.id === valueRef.current);
        setQuery(g ? g.name : "");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [guests]);

  const lquery  = query.toLowerCase();
  const results = guests
    .filter(g => g.id !== exclude)
    .filter(g => !query || g.name.toLowerCase().includes(lquery))
    .slice(0, 10);

  const select = (g) => {
    onChange(g.id);
    setQuery(g.name);
    setOpen(false);
    setHi(-1);
  };

  const handleChange = e => {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    setHi(-1);
    if (!v) onChange("");
  };

  const handleKeyDown = e => {
    if (e.key === "Escape") { setOpen(false); setHi(-1); return; }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") { setOpen(true); setHi(0); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi(h => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi(h => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && hi >= 0 && results[hi]) {
      e.preventDefault();
      select(results[hi]);
    }
  };

  const isSelected = !!value && !!selectedGuest;

  return (
    <div ref={containerRef} className={styles.acWrap}>
      <div className={[styles.acInputWrap, isSelected ? styles.acInputSelected : ""].filter(Boolean).join(" ")}>
        {isSelected && <SideDot side={selectedGuest.side} />}
        <input
          className={[base.input, styles.acInput].join(" ")}
          value={query}
          placeholder="הקלד שם לחיפוש..."
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {query && (
          <button
            className={styles.acClear}
            onMouseDown={e => { e.preventDefault(); onChange(""); setQuery(""); setOpen(false); }}
            tabIndex={-1}
            aria-label="נקה בחירה"
          >✕</button>
        )}
      </div>

      {open && (results.length > 0 || query) && (
        <div className={styles.acDropdown} role="listbox">
          {results.length > 0 ? results.map((g, i) => (
            <button
              key={g.id}
              role="option"
              aria-selected={i === hi}
              className={[styles.acItem, i === hi ? styles.acItemHi : ""].filter(Boolean).join(" ")}
              onMouseDown={e => { e.preventDefault(); select(g); }}
              onMouseEnter={() => setHi(i)}
            >
              <SideDot side={g.side} />
              <span className={styles.acName}>
                <HighlightMatch name={g.name} query={query} />
              </span>
              <span className={styles.acMeta}>
                {sideLabel(g.side)}
                {g.group ? " · " + g.group : ""}
                {g.phone ? " · " + g.phone : ""}
              </span>
            </button>
          )) : (
            <div className={styles.acEmpty}>אין תוצאות עבור &ldquo;{query}&rdquo;</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ConstraintsScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const [formA, setFormA]       = useState("");
  const [formB, setFormB]       = useState("");
  const [formType, setFormType] = useState("together");

  const sorted    = ev.guests.slice().sort((a, b) => a.name.localeCompare(b.name));
  const sideLabel = s => getSideLabel(ev, s);
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
    patchEvent(e => Object.assign({}, e, {
      constraints: e.constraints.concat([{ id: uid(), type: formType, guestA: formA, guestB: formB }])
    }));
    setFormA(""); setFormB("");
    if (contra) showToast("⚠ קיים אילוץ הפוך לאותה זוג — האילוץ החדש נוסף בכל זאת", "warn");
    else        showToast("האילוץ נוסף ✓");
  };

  const delConstraint = (id, nameA, nameB, type) => {
    const label = type === "together"
      ? "להסיר את האילוץ \"יחד\" בין " + nameA + " ל" + nameB + "?"
      : "להסיר את האילוץ \"בנפרד\" בין " + nameA + " ל" + nameB + "?";
    if (!confirm(label)) return;
    patchEvent(e => Object.assign({}, e, { constraints: e.constraints.filter(c => c.id !== id) }));
    showToast("האילוץ הוסר ✓");
  };

  const stale    = ev.constraints.filter(c => !gMap[c.guestA] || !gMap[c.guestB]);
  const together = ev.constraints.filter(c => c.type === "together" && gMap[c.guestA] && gMap[c.guestB]);
  const apart    = ev.constraints.filter(c => c.type === "apart"    && gMap[c.guestA] && gMap[c.guestB]);
  const previewReady = formA && formB && formA !== formB && gMap[formA] && gMap[formB];

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

      <div className={styles.stepGuide}>
        <span className={styles.stepBadge}>שלב 4 מתוך 5 — אילוצים</span>
        <span className={styles.stepText}>שלב אופציונלי. הגדירו מי חייב לשבת יחד ומי לא — ואז המשיכו לסידור ההושבה. כל שינוי נשמר אוטומטית.</span>
      </div>

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

        <p className={styles.typeHint}>
          {formType === "together"
            ? "האורחים שתבחרו יושבצו תמיד לאותו שולחן."
            : "האורחים שתבחרו לא יושבצו לאותו שולחן — יהיו בשולחנות שונים."}
        </p>

        <div className={styles.constraintFormRow}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Field label="אורח א׳">
              <GuestAutocomplete
                guests={sorted}
                value={formA}
                onChange={setFormA}
                exclude={formB}
                sideLabel={sideLabel}
                label="אורח א׳"
              />
            </Field>
          </div>
          <div className={styles.constraintVerb}>
            {formType === "together" ? "יחד עם" : "בנפרד מ-"}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Field label="אורח ב׳">
              <GuestAutocomplete
                guests={sorted}
                value={formB}
                onChange={setFormB}
                exclude={formA}
                sideLabel={sideLabel}
                label="אורח ב׳"
              />
            </Field>
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
            <span className={styles.previewIcon}>
              {formType === "together" ? "🤝" : "⛔"}
            </span>
            <div className={styles.previewContent}>
              <div className={styles.previewNames}>
                {gMap[formA].name}
                <span className={styles.previewVerb}>
                  {formType === "together" ? "יישב/ת יחד עם" : "לא יישב/ת עם"}
                </span>
                {gMap[formB].name}
              </div>
              <div className={styles.previewMeta}>
                {sideLabel(gMap[formA].side)} · {gMap[formA].group}
                {"  ·  "}
                {sideLabel(gMap[formB].side)} · {gMap[formB].group}
              </div>
              <div className={styles.previewOutcome}>
                {formType === "together"
                  ? "תוצאה: יושבצו לאותו שולחן — לחץ \"הוסף\" לאישור"
                  : "תוצאה: יושבצו לשולחנות שונים — לחץ \"הוסף\" לאישור"}
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
        <EmptyState icon="⚖" title="טרם הוגדרו אילוצים"
          text="שלב זה אופציונלי לחלוטין. אם יש אורחים שחייבים לשבת יחד (כמו הורים עם ילדים קטנים) או שאסור שיישבו יחד — הגדירו זאת כאן לפני הרצת הסידור." />
      )}

      <NextStep label="המשך לסידור הושבה" hint="שבץ את כל האורחים לשולחנות" onClick={() => go("seating")} />
    </div>
  );
}
