import { useMemo, useState } from "react";
import { EVENT_TYPES, eventTypeHeading } from "../data/constants.js";
import { AREAS } from "../data/eventAreas.js";
import { getEventPersonalConfig } from "../utils/eventHelpers.js";
import { useTemplates } from "../hooks/useTemplates.js";
import Icon from "../components/ui/Icon.jsx";
import SectionMark from "../components/ui/SectionMark.jsx";
import TableGlyph from "../components/ui/TableGlyph.jsx";
import styles from "./StartScreen.module.css";
import { COMPANY } from "../data/company.js";

/* ── The first screen ─────────────────────────────────────────────────────────
 *
 * What was here before opened with "באיזה אירוע מדובר?" — a CLASSIFICATION
 * question, asked before anything had said what the product does — and then
 * laid out all five steps and all fourteen tools as a strip. Two problems, and
 * the owner felt both without being able to name them: it asks you to file
 * yourself before it has earned anything, and the first thing you see is
 * everything you owe.
 *
 * What actually sells this product is one sentence: the seating happens by
 * itself. So that is the headline, the picture under it is the product's own
 * object doing the thing, and the form asks for the two facts that are true on
 * day one — who, and when. Event type became one quiet line with a default,
 * because it changes almost nothing and nobody needs to be interviewed about it
 * before they have seen a single screen.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The name we build for them, so nobody has to invent one to get in. */
function deriveEventName(type, a, b) {
  const kind = getEventPersonalConfig(type).kind;
  const x = (a || "").trim();
  const y = (b || "").trim();
  if (kind === "wedding") {
    const head = type === "אירוס" ? "האירוסין של" : type === "חינה" ? "החינה של" : "החתונה של";
    if (x && y) return `${head} ${x} ו${y}`;
    return x || y ? `${head} ${x || y}` : "";
  }
  if (kind === "bar") return x ? `בר המצווה של ${x}` : "";
  if (kind === "bat") return x ? `בת המצווה של ${x}` : "";
  if (kind === "business") return x || "";
  return x ? `${type} — ${x}` : "";
}

// The illustration is the product's own object, not a stock graphic: five
// tables, filling. DESIGN.md's rule is that a drawing has to answer a question
// the host has — this one answers "what does it actually give me".
const DEMO_TABLES = [
  { shape: "round", capacity: 10, taken: 10 },
  { shape: "rect",  capacity: 12, taken: 12 },
  { shape: "round", capacity: 10, taken: 6  },
  { shape: "round", capacity: 8,  taken: 0  },
];

export default function StartScreen({ onStart, hasEvents = false, onCancel }) {
  const { mainTemplates } = useTemplates();
  const [type,  setType]  = useState("חתונה");
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");
  const [date,  setDate]  = useState("");
  const [busy,  setBusy]  = useState(false);

  // The type list stays driven by the admin-managed templates where they exist,
  // so nothing about that feature is lost — it just is not the opening question
  // any more. EVENT_TYPES are the canonical stored values (Hebrew strings, not
  // English keys — that mismatch is a bug class this codebase already has).
  const types = useMemo(() => {
    const extra = (mainTemplates || []).map(t => t.type).filter(Boolean);
    return [...new Set([...EVENT_TYPES, ...extra])];
  }, [mainTemplates]);

  const cfg  = getEventPersonalConfig(type);
  const kind = cfg.kind;
  const two  = kind === "wedding";

  const labelA =
    two              ? "שם ראשון" :
    kind === "bar"   ? "שם הבר מצווה" :
    kind === "bat"   ? "שם הבת מצווה" :
    kind === "business" ? "שם הארגון" :
    cfg.label || "שם";

  const placeholderA =
    two              ? "דנה" :
    kind === "bar"   ? "עידו" :
    kind === "bat"   ? "תמר" :
    kind === "business" ? 'חברת כוכב בע"מ' :
    "דניאל";

  const derived = deriveEventName(type, nameA, nameB);
  const ready   = !!derived;

  const submit = (e) => {
    e?.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    const seed = { type, name: derived, date };
    if (two) { seed.brideName = nameA.trim(); seed.groomName = nameB.trim(); }
    else if (kind === "bar" || kind === "bat") seed.celebrantName = nameA.trim();
    else if (kind === "business") seed.organizationName = nameA.trim();
    else seed.ownerName = nameA.trim();
    onStart(seed);
  };

  return (
    <div className={styles.page}>
      {/* ── The promise ── */}
      <section className={styles.hero}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>{COMPANY.name}</span>
        </div>

        <h1 className={styles.headline}>ההושבה מסתדרת לבד.</h1>

        <p className={styles.lead}>
          אתם מזינים את רשימת האורחים ואת מי שאסור להושיב יחד.
          {COMPANY.name} בונה את כל השולחנות בשניות — ואומר לכם מיד מה עדיין לא מסתדר.
        </p>

        {/* The glyph's table top is --blush-soft. On the blush-soft hero it was
            the same colour as its own ground and the tables read as bare rings
            — the "contrast measured against the wrong ground" failure, in the
            first thing anybody sees. It gets a white plate of its own. */}
        <div className={styles.glyphPlate}>
          <div className={styles.glyphRow} aria-hidden="true">
            {DEMO_TABLES.map((t, i) => (
              <TableGlyph key={i} shape={t.shape} capacity={t.capacity} taken={t.taken} size={58} />
            ))}
          </div>
        </div>
        <p className={styles.glyphCaption}>
          כל שולחן מצויר כפי שהוא — מושב מלא הוא אורח שכבר יושב, טבעת ריקה היא מקום פנוי.
        </p>
      </section>

      {/* ── The two facts that are true on day one ── */}
      <form className={styles.card} onSubmit={submit}>
        <p className={styles.cardEyebrow}>נתחיל בקטן</p>
        {/* One heading per event type, from EVENT_TYPE_HEADINGS. Two branches
            on `two` covered nine types with two sentences, and the one a
            birthday host got — "על מי האירוע, ומתי?" — is a form asking them
            to file themselves. */}
        <h2 className={styles.cardTitle}>{eventTypeHeading(type)}</h2>
        <p className={styles.cardSub}>
          שם, ותאריך אם כבר יש. כל השאר — אולם, רשימות, תקציב — נשלים תוך כדי.
        </p>

        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{labelA}</span>
            <input
              className={styles.input}
              value={nameA}
              onChange={e => setNameA(e.target.value)}
              placeholder={placeholderA}
              autoFocus
            />
          </label>

          {two && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>שם שני</span>
              <input
                className={styles.input}
                value={nameB}
                onChange={e => setNameB(e.target.value)}
                placeholder="יוסי"
              />
            </label>
          )}

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              תאריך <span className={styles.optional}>אם כבר ידוע</span>
            </span>
            <input
              className={styles.input}
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </label>
        </div>

        {/* The classification question, demoted to where it belongs: one line,
            with a default, after the thing that matters. */}
        <div className={styles.typeRow}>
          <label className={styles.typeLabel} htmlFor="start-type">סוג האירוע</label>
          <select
            id="start-type"
            className={styles.typeSelect}
            value={type}
            onChange={e => setType(e.target.value)}
          >
            {types.map(t => <option key={t}>{t}</option>)}
          </select>
          <span className={styles.typeNote}>אפשר לשנות בכל רגע</span>
        </div>

        {derived && (
          <p className={styles.preview}>
            האירוע ייקרא <strong>{derived}</strong>
          </p>
        )}

        <div className={styles.actions}>
          <button type="submit" className={styles.cta} disabled={!ready || busy}>
            בואו נתחיל <Icon name="arrowLeft" size={16} />
          </button>
          {hasEvents && onCancel && (
            <button type="button" className={styles.cancel} onClick={onCancel}>
              <Icon name="arrowRight" size={14} /> חזרה לאירועים
            </button>
          )}
        </div>

        <p className={styles.note}>
          אפשר להתחיל בלי חשבון — הכל נשמר אוטומטית בדפדפן הזה.
          חשבון נדרש רק כשתרצו לשתף קישור עם האורחים.
        </p>
      </form>

      {/* ── What is waiting inside — three things, not fourteen ── */}
      <section className={styles.areas} aria-label="מה יש באתר">
        <p className={styles.areasHead}>ואחר כך, לפי הסדר שבו זה באמת קורה:</p>
        <ul className={styles.areaList}>
          {AREAS.map(a => (
            <li key={a.id} className={styles.areaItem}>
              <SectionMark name={a.mark} size={24} tile />
              <span className={styles.areaText}>
                <span className={styles.areaName}>{a.label}</span>
                <span className={styles.areaSub}>{a.sub}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
