import { useState, useRef, useEffect, useId } from "react";
import Icon from "../components/ui/Icon.jsx";
import { getSideLabel } from "../utils/eventHelpers.js";
import { buildStep, nextBuildStep, BUILD_STEP_COUNT } from "../data/eventAreas.js";
import { uid } from "../utils/uid.js";
import Banner from "../components/feedback/Banner.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Field from "../components/ui/Field.jsx";
import NextStep from "../components/ui/NextStep.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import SideDot from "../components/ui/SideDot.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import { useConfirm } from "../components/ui/useConfirm.jsx";
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
function GuestAutocomplete({ guests, value, onChange, exclude, sideLabel, label, inputRef, errorId }) {
  const selectedGuest = guests.find(g => g.id === value) ?? null;
  const [query, setQuery]   = useState(selectedGuest?.name ?? "");
  const [open, setOpen]     = useState(false);
  const [hi, setHi]         = useState(-1);
  const containerRef        = useRef(null);
  const valueRef            = useRef(value);
  const listId              = useId();
  const optionId            = (i) => `${listId}-opt-${i}`;

  useEffect(() => { valueRef.current = value; }, [value]);

  // Read by the outside-click handler below, which must not be re-bound on
  // every parent render just because the parent hands down a fresh `guests`
  // array each time (`ev.guests.slice().sort(...)`).
  const guestsRef = useRef(guests);
  useEffect(() => { guestsRef.current = guests; }, [guests]);

  // Sync the display text when the SELECTION changes from outside (e.g. the
  // form is cleared after save).
  //
  // This used to depend on `guests` as well, and the parent passes
  // `ev.guests.slice().sort(...)` — a new array identity on EVERY render. So
  // any unrelated App re-render ran setQuery(""), and the host lost whatever
  // they were typing: a success toast expiring 3.2s after the previous
  // constraint was added wiped the half-typed name out from under the cursor.
  // The sync/quota/PWA-update toasts did it too. A sweep of every visible input
  // on twelve screens found these two fields were the only ones in the product
  // that lost their text.
  //
  // `guests` stays in the dependency list — the lookup genuinely needs it — but
  // the effect now only writes when `value` ITSELF changed, so a new array
  // identity alone can no longer touch the input.
  const syncedValue = useRef(value);
  useEffect(() => {
    if (syncedValue.current === value) return;
    syncedValue.current = value;
    const g = guests.find(g => g.id === value);
    setQuery(g ? g.name : "");
  }, [value, guests]);

  // Close and restore on outside click
  useEffect(() => {
    const handler = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setHi(-1);
        const g = guestsRef.current.find(g => g.id === valueRef.current);
        setQuery(g ? g.name : "");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const lquery  = query.toLowerCase();
  const matches = guests
    .filter(g => g.id !== exclude)
    .filter(g => !query || (g.name || '').toLowerCase().includes(lquery));
  // Ten at a time keeps the list usable; past ten it says how many more there
  // are, instead of a host with 15 "כהן"s never seeing the one they want
  // (WORKPLAN 111).
  const results = matches.slice(0, 10);
  const more    = matches.length - results.length;

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
        {/* A combobox in the ARIA sense (AX3): the input owns the listbox
            through aria-controls and names the highlighted option through
            aria-activedescendant, so arrowing through the list is announced —
            before, a screen reader heard nothing move. */}
        <input
          className={[base.input, styles.acInput].join(" ")}
          value={query}
          placeholder="הקלידו שם לחיפוש..."
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && hi >= 0 && results[hi] ? optionId(hi) : undefined}
          ref={inputRef}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
        />
        {query && (
          <button
            className={styles.acClear}
            onMouseDown={e => { e.preventDefault(); onChange(""); setQuery(""); setOpen(false); }}
            tabIndex={-1}
            aria-label="נקו בחירה"
          ><Icon name="close" size={13} /></button>
        )}
      </div>

      {/* Only options inside the listbox: "no results" and "N more" are
          status rows, and inside role=listbox they were read as options that
          could not be chosen. The listbox element stays mounted (empty when
          closed) so aria-controls always points at something.
          Options select on CLICK — a screen reader's activation and a
          keyboard-driven click send no mousedown, so the old mousedown-only
          handler ignored them. mousedown still preventDefaults, which keeps
          the focus in the input. */}
      <div
        className={open && (results.length > 0 || query) ? styles.acDropdown : undefined}
        hidden={!(open && (results.length > 0 || query))}
      >
        <div id={listId} role="listbox" aria-label={label}>
          {open && results.map((g, i) => (
            <div
              key={g.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === hi}
              className={[styles.acItem, i === hi ? styles.acItemHi : ""].filter(Boolean).join(" ")}
              onMouseDown={e => e.preventDefault()}
              onClick={() => select(g)}
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
            </div>
          ))}
        </div>
        {open && results.length === 0 && query && (
          <div className={styles.acEmpty} role="status">אין תוצאות עבור &ldquo;{query}&rdquo;</div>
        )}
        {open && more > 0 && (
          <div className={[styles.acEmpty, styles.acMore].join(" ")}>
            {more === 1 ? "ועוד אחד" : `ועוד ${more}`} — הקלידו עוד אותיות כדי לצמצם
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ConstraintsScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const { confirm, dialog }     = useConfirm();
  const [formA, setFormA]       = useState("");
  const [formB, setFormB]       = useState("");
  const [formType, setFormType] = useState("together");
  /* Why the last add was refused, and which picker it is about (136 stage D,
     as on the guests screen). These were four toasts — gone in three seconds,
     at the bottom of the screen, with neither picker marked. The line sits
     under the form row and goes as soon as either guest changes. */
  const [formErr, setFormErr]   = useState(null); // { field: "a"|"b"|"both", text }
  const refA = useRef(null);
  const refB = useRef(null);
  const pickA = v => { setFormA(v); setFormErr(null); };
  const pickB = v => { setFormB(v); setFormErr(null); };
  const refuse = (field, text) => {
    setFormErr({ field, text });
    (field === "b" ? refB : refA).current?.focus();
  };

  const sorted    = ev.guests.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'));
  const sideLabel = s => getSideLabel(ev, s);
  const gMap = Object.fromEntries(ev.guests.map(g => [g.id, g]));

  const addConstraint = () => {
    if (!formA)           { refuse("a", "בחרו את האורח הראשון"); return; }
    if (!formB)           { refuse("b", "בחרו את האורח השני"); return; }
    if (formA === formB)  { refuse("b", "בחרו אורח אחר — זה אותו אורח פעמיים"); return; }
    const dup = ev.constraints.some(c =>
      c.type === formType &&
      ((c.guestA === formA && c.guestB === formB) || (c.guestA === formB && c.guestB === formA))
    );
    if (dup) { refuse("both", "האילוץ הזה כבר ברשימה"); return; }
    const contra = ev.constraints.some(c =>
      c.type !== formType &&
      ((c.guestA === formA && c.guestB === formB) || (c.guestA === formB && c.guestB === formA))
    );
    // Block contradictions (יחד + בנפרד for the same pair) instead of allowing a
    // guaranteed seating violation — the host must remove the opposite first.
    if (contra) { refuse("both", "לזוג הזה כבר יש אילוץ הפוך. הסירו אותו מהרשימה קודם, ואז הוסיפו את זה."); return; }
    setFormErr(null);
    patchEvent(e => Object.assign({}, e, {
      constraints: e.constraints.concat([{ id: uid(), type: formType, guestA: formA, guestB: formB }])
    }));
    setFormA(""); setFormB("");
    showToast("האילוץ נוסף ✓");
  };

  const delConstraint = async (id, nameA, nameB, type) => {
    const label = type === "together"
      ? "להסיר את האילוץ \"יחד\" בין " + nameA + " ל" + nameB + "?"
      : "להסיר את האילוץ \"בנפרד\" בין " + nameA + " ל" + nameB + "?";
    if (!await confirm(label, { danger: true, confirmLabel: "הסירו" })) return;
    patchEvent(e => Object.assign({}, e, { constraints: e.constraints.filter(c => c.id !== id) }));
    showToast("האילוץ הוסר ✓");
  };

  const stale    = ev.constraints.filter(c => !gMap[c.guestA] || !gMap[c.guestB]);
  const together = ev.constraints.filter(c => c.type === "together" && gMap[c.guestA] && gMap[c.guestB]);
  const apart    = ev.constraints.filter(c => c.type === "apart"    && gMap[c.guestA] && gMap[c.guestB]);
  const previewReady = formA && formB && formA !== formB && gMap[formA] && gMap[formB];

  return (
    <div className={base.page}>
      {dialog}
      <PageHeader
        title="אילוצים"
        mark="constraints"
        sub="הגדירו מי חייב לשבת יחד ומי לא יכול — המערכת תכבד זאת בסידור האוטומטי."
        aside={
          <div className={base.pills}>
            <StatPill n={ev.constraints.length} label="אילוצים" primary />
            <StatPill n={together.length} label="יחד"   color={together.length > 0 ? "var(--green)" : undefined} />
            <StatPill n={apart.length}    label="בנפרד" color={apart.length > 0 ? "var(--red)" : undefined} />
          </div>
        }
      />

      <div className={base.stepGuide}>
        <span className={base.stepBadge}>
          {`שלב ${buildStep("constraints").num} מתוך ${BUILD_STEP_COUNT} — אילוצים`}
        </span>
        <span className={base.stepText}>שלב אופציונלי. הגדירו מי חייב לשבת יחד ומי לא — ואז המשיכו לסידור ההושבה. כל שינוי נשמר אוטומטית.</span>
      </div>

      {ev.guests.length < 2 && (
        <Banner variant="warn">
          יש להוסיף לפחות שני אורחים לפני הגדרת אילוצים.
          <button
            className={[base.btnSm, styles.bannerAction].join(" ")}
            onClick={() => go("guests")}
          >עברו לאורחים</button>
        </Banner>
      )}

      {stale.length > 0 && (
        <Banner variant="warn">
          {stale.length === 1 ? "אילוץ אחד מפנה" : (stale.length + " אילוצים מפנים")} לאורחים שנמחקו.
          <button
            className={[base.btnSm, base.btnDanger, styles.bannerAction].join(" ")}
            onClick={() => patchEvent(e => Object.assign({}, e, {
              constraints: e.constraints.filter(c => gMap[c.guestA] && gMap[c.guestB])
            }))}
          >
            נקו אוטומטית
          </button>
        </Banner>
      )}

      <div className={base.card}>
        <SectionLabel>הוספת אילוץ חדש</SectionLabel>

        <Field label="סוג האילוץ">
          <div data-tour="constraints.type" className={base.seg} role="group" aria-label="סוג האילוץ">
            <button
              type="button"
              aria-pressed={formType === "together"}
              className={[base.segBtn, formType === "together" ? base.segActive : ""].filter(Boolean).join(" ")}
              onClick={() => setFormType("together")}
            >
              <Icon name="together" /> חייבים לשבת יחד
            </button>
            <button
              type="button"
              aria-pressed={formType === "apart"}
              className={[base.segBtn, formType === "apart" ? base.segActive : ""].filter(Boolean).join(" ")}
              onClick={() => setFormType("apart")}
            >
              <Icon name="apart" /> לא יכולים לשבת יחד
            </button>
          </div>
        </Field>

        <p className={styles.typeHint}>
          {formType === "together"
            ? "האורחים שתבחרו יושבצו תמיד לאותו שולחן."
            : "האורחים שתבחרו לא יושבצו לאותו שולחן — יהיו בשולחנות שונים."}
        </p>

        <div data-tour="constraints.pick" className={styles.constraintFormRow}>
          <div className={styles.constraintFormField}>
            <Field label="אורח א׳">
              <GuestAutocomplete
                guests={sorted}
                value={formA}
                onChange={pickA}
                exclude={formB}
                sideLabel={sideLabel}
                label="אורח א׳"
                inputRef={refA}
                errorId={formErr && formErr.field !== "b" ? "cst-form-err" : undefined}
              />
            </Field>
          </div>
          <div className={styles.constraintVerb}>
            {formType === "together" ? "יחד עם" : "בנפרד מ-"}
          </div>
          <div className={styles.constraintFormField}>
            <Field label="אורח ב׳">
              <GuestAutocomplete
                guests={sorted}
                value={formB}
                onChange={pickB}
                exclude={formA}
                sideLabel={sideLabel}
                label="אורח ב׳"
                inputRef={refB}
                errorId={formErr && formErr.field !== "a" ? "cst-form-err" : undefined}
              />
            </Field>
          </div>
          <button
            className={base.btnPrimary}
            onClick={addConstraint}
          >
            הוסיפו
          </button>
        </div>
        {formErr && <p id="cst-form-err" role="alert" className={base.fieldError}>{formErr.text}</p>}

        {previewReady && (
          <div className={[
            styles.constraintPreview,
            formType === "together" ? styles.constraintPreviewTog : styles.constraintPreviewApart
          ].join(" ")}>
            <span className={styles.previewIcon}>
              <Icon name={formType === "together" ? "together" : "apart"} size={16} />
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
                  ? "תוצאה: יושבצו לאותו שולחן — לחצו \"הוסיפו\" לאישור"
                  : "תוצאה: יושבצו לשולחנות שונים — לחצו \"הוסיפו\" לאישור"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* One element around both lists, so the guided tour (124) lights the
          two of them — a key on each card lit only the first. */}
      {ev.constraints.length > 0 && (
        <div data-tour="constraints.list">
          {together.length > 0 && (
            <div className={base.card}>
              <SectionLabel><Icon name="together" /> חייבים לשבת יחד — {together.length}</SectionLabel>
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
                        type="button"
                        className={[base.btnSm, base.btnDanger].join(" ")}
                        onClick={() => delConstraint(c.id, ga.name, gb.name, c.type)}
                        aria-label={`הסירו: ${ga.name} יחד עם ${gb.name}`}
                      >
                        הסירו
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {apart.length > 0 && (
            <div className={base.card}>
              <SectionLabel><Icon name="apart" /> לא יכולים לשבת יחד — {apart.length}</SectionLabel>
              <div className={styles.cList}>
                {apart.map(c => {
                  const ga = gMap[c.guestA], gb = gMap[c.guestB];
                  return (
                    <div key={c.id} className={styles.cRow}>
                      <div className={styles.cRowMain}>
                        <SideDot side={ga.side} />
                        <span className={styles.cstName}>{ga.name}</span>
                        <span className={[styles.cstVerb, styles.cstVerbApart].join(" ")}>בנפרד מ-</span>
                        <SideDot side={gb.side} />
                        <span className={styles.cstName}>{gb.name}</span>
                      </div>
                      <button
                        type="button"
                        className={[base.btnSm, base.btnDanger].join(" ")}
                        onClick={() => delConstraint(c.id, ga.name, gb.name, c.type)}
                        aria-label={`הסירו: ${ga.name} בנפרד מ-${gb.name}`}
                      >
                        הסירו
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {ev.constraints.length === 0 && (
        <EmptyState mark="constraints" illustration="chair" title="אין אילוצים — וזה בסדר גמור"
          text="השלב הזה לא חובה. אם יש מי שחייבים לשבת יחד (כמו הורים עם ילדים קטנים), או מי שאסור שיישבו באותו שולחן — כאן אומרים את זה, לפני ההושבה." />
      )}

      <NextStep label={"המשיכו ל" + nextBuildStep("constraints").label} hint="שבצו את כל האורחים לשולחנות" onClick={() => go("seating")} />
    </div>
  );
}
