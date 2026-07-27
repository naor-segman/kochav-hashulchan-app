import { useMemo, useState } from "react";
import Icon from "../components/ui/Icon.jsx";
import { guestSeatNames } from "../utils/eventHelpers.js";
import EmptyState from "../components/ui/EmptyState.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./NameTagsScreen.module.css";

/**
 * Printable place cards and name tags.
 *
 * Two different jobs that look similar:
 *   - place cards sit ON the table and tell a guest which seat is theirs, so
 *     they are printed one per SEAT (a couple needs two, not one);
 *   - name tags are worn, which mostly matters at corporate events.
 *
 * Both print through @media print, reusing the approach the seating sheet
 * already uses, so there is no PDF dependency to carry.
 */

const SIZES = [
  { key: "card",  label: "כרטיס שולחן", perRow: 2, note: "מקופל, עומד על השולחן" },
  { key: "tag",   label: "תג שם",       perRow: 3, note: "לענידה — נפוץ באירועים עסקיים" },
  { key: "small", label: "מדבקה קטנה",  perRow: 4, note: "מדבקות / כרטיסיות קטנות" },
];

export default function NameTagsScreen({ activeEvent: ev }) {
  const [size, setSize]       = useState("card");
  const [scope, setScope]     = useState("seated");
  const [showTable, setShowTable] = useState(true);

  const tableOf = id => ev.tables?.find(t => t.id === id);

  const cards = useMemo(() => {
    const active = (ev.guests || []).filter(g => g.rsvp !== "declined");
    const pool = scope === "seated"
      ? active.filter(g => ev.seating?.[g.id])
      : scope === "confirmed"
        ? active.filter(g => g.rsvp === "confirmed")
        : active;

    // One card per SEAT, not per row — a party of four needs four place cards.
    return pool.flatMap(g => {
      const table = tableOf(ev.seating?.[g.id]);
      return guestSeatNames(g).map((seatName, i) => ({
        key: `${g.id}-${i}`,
        name: seatName,
        table: table?.name || "",
      }));
    }).sort((a, b) => a.name.localeCompare(b.name, "he"));
  }, [ev.guests, ev.seating, ev.tables, scope]);

  const sizeMeta = SIZES.find(s => s.key === size);

  return (
    <div className={base.page}>
      <div className={styles.screenOnly}>
        <PageHeader
          title="כרטיסי שולחן ותגי שם"
          icon={<Icon name="cards" />}
          sub="הדפסה ישירה מהדפדפן — בלי תוכנה נוספת."
        />

        <div className={base.card}>
          <SectionLabel>מה מדפיסים</SectionLabel>

          <p className={base.fieldHint}>גודל</p>
          <div className={styles.opts}>
            {SIZES.map(s => (
              <button
                key={s.key}
                className={[styles.opt, size === s.key ? styles.optOn : ""].filter(Boolean).join(" ")}
                onClick={() => setSize(s.key)}
                aria-pressed={size === s.key}
              >
                <b>{s.label}</b>
                <span>{s.note}</span>
              </button>
            ))}
          </div>

          <p className={base.fieldHint} style={{ marginTop: 14 }}>למי</p>
          <div className={styles.opts}>
            {[
              ["seated",    "רק משובצים",   "מי שכבר יש לו שולחן"],
              ["confirmed", "רק שאישרו",    "כולל מי שעדיין לא שובץ"],
              ["all",       "כל האורחים",   "חוץ ממי שסירב"],
            ].map(([v, l, note]) => (
              <button
                key={v}
                className={[styles.opt, scope === v ? styles.optOn : ""].filter(Boolean).join(" ")}
                onClick={() => setScope(v)}
                aria-pressed={scope === v}
              >
                <b>{l}</b><span>{note}</span>
              </button>
            ))}
          </div>

          <label className={styles.check}>
            <input type="checkbox" checked={showTable} onChange={e => setShowTable(e.target.checked)} />
            <span>הציגו מספר שולחן על הכרטיס</span>
          </label>

          <div className={styles.actions}>
            <button className={base.btnPrimary} onClick={() => window.print()} disabled={cards.length === 0}>
              🖨 הדפיסו {cards.length} כרטיסים
            </button>
            <span className={styles.count}>
              {sizeMeta.perRow} בשורה · {Math.ceil(cards.length / (sizeMeta.perRow * 4)) || 0} דפים בערך
            </span>
          </div>

          {cards.length === 0 && (
            <EmptyState
              icon={<Icon name="cards" />}
              title="אין כרטיסים להדפסה"
              text="בחרו קהל אחר, או שבצו אורחים לשולחנות תחילה."
            />
          )}
        </div>

        {cards.length > 0 && <p className={styles.previewNote}>תצוגה מקדימה של ההדפסה:</p>}
      </div>

      {/* The print surface. On screen it renders as a preview; @media print
          hides everything else and lays these out on the page. */}
      {cards.length > 0 && (
        <div className={[styles.sheet, styles["sheet_" + size]].join(" ")}>
          {cards.map(c => (
            <div key={c.key} className={styles.card}>
              <span className={styles.cardName}>{c.name}</span>
              {showTable && c.table && (
                <span className={styles.cardTable}>שולחן {c.table}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
