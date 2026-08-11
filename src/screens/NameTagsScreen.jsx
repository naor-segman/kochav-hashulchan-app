import { useCallback, useMemo, useState } from "react";
import Icon from "../components/ui/Icon.jsx";
import { guestSeatNames } from "../utils/eventHelpers.js";
import { seatsOf } from "../utils/arrival.js";
import { tableLabel } from "../components/seating/tableLabel.js";
import EmptyState from "../components/ui/EmptyState.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./NameTagsScreen.module.css";

/**
 * Printable table cards, place cards and name tags.
 *
 * ── The decision the owner asked for ────────────────────────────────────────
 * "כרטיס שולחן" was trying to be two products at once. It is now one, and it is
 * **a card that stands on the table**: the number is the largest thing on the
 * page and is meant to be read from across a dark hall; the names are small and
 * secondary, there only so a guest can confirm they are in the right seat.
 *
 * Why that one and not the dense hostess sheet: the hostess sheet ALREADY
 * EXISTS — "לצוות האולם" on the seating screen prints exactly that, names only,
 * many tables per page. Building a second one here would repeat the mistake the
 * owner just spent an event discovering, where three things occupied the same
 * space. What does not exist is the artefact 300 guests need at 20:30, when
 * they are standing in a room they have never been in looking for a number.
 *
 * A card that has to be read across a room cannot be a flat sheet lying on the
 * cloth, so it prints as a TENT: two halves, the upper one rotated 180°, folded
 * on the dashed line. Both sides read, and it stands on its own.
 *
 * Nothing was removed. Place cards (one per SEAT — a couple needs two), wearable
 * name tags and small stickers are all still here.
 */

const SIZES = [
  { key: "table", label: "כרטיס שולחן",  perPage: 2,  note: "עומד על השולחן — המספר נקרא מרחוק" },
  { key: "card",  label: "כרטיס מקום",   perPage: 8,  note: "מונח על הצלחת — אחד לכל אורח" },
  { key: "tag",   label: "תג שם",        perPage: 12, note: "לענידה — נפוץ באירועים עסקיים" },
  { key: "small", label: "מדבקה קטנה",   perPage: 16, note: "מדבקות / כרטיסיות קטנות" },
];

/**
 * The number a guest scans the room for. Most tables are called "שולחן 12", and
 * on a card read from four metres the word is noise — the digits are the whole
 * message. A table with a real name ("שולחן הורי הכלה") keeps its name, because
 * for that one the name IS the number.
 */
function bigLabel(t) {
  const m = String(t?.name || "").match(/(\d+)\s*$/);
  return m ? m[1] : (t?.name || "").trim() || "—";
}

export default function NameTagsScreen({ activeEvent: ev }) {
  const [size, setSize]           = useState("table");
  const [scope, setScope]         = useState("seated");
  const [showTable, setShowTable] = useState(true);
  const [showNames, setShowNames] = useState(true);

  const isTableMode = size === "table";
  const tableOf = useCallback(id => ev.tables?.find(t => t.id === id), [ev.tables]);

  // ── Per-seat cards (place cards / tags / stickers) ─────────────────────────
  const seatCards = useMemo(() => {
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
        // The printed card said "שולחן שולחן 1" for every default-named
        // table — TableBuilderScreen already uses "שולחן" as the name prefix.
        table: table ? tableLabel(table) : "",
      }));
    }).sort((a, b) => a.name.localeCompare(b.name, "he"));
  }, [ev.guests, ev.seating, scope, tableOf]);

  // ── Table cards ────────────────────────────────────────────────────────────
  const tableCards = useMemo(() => {
    const active = (ev.guests || []).filter(g => g.rsvp !== "declined");
    return (ev.tables || [])
      .map(t => {
        const rows = active.filter(g => ev.seating?.[g.id] === t.id);
        return {
          key: t.id,
          big: bigLabel(t),
          full: tableLabel(t),
          seats: rows.reduce((s, g) => s + seatsOf(g), 0),
          // Every person at the table by name, in the same order the place
          // cards are printed in, so the two artefacts agree.
          names: rows.flatMap(g => guestSeatNames(g)).sort((a, b) => a.localeCompare(b, "he")),
        };
      })
      // An empty table gets no card: it is a card someone has to carry, fold
      // and place for a table nobody is sitting at.
      .filter(c => scope === "all" || c.seats > 0)
      .sort((a, b) => a.full.localeCompare(b.full, "he", { numeric: true }));
  }, [ev.tables, ev.guests, ev.seating, scope]);

  const cards    = isTableMode ? tableCards : seatCards;
  const sizeMeta = SIZES.find(s => s.key === size);
  const pages    = Math.ceil(cards.length / sizeMeta.perPage) || 0;

  return (
    <div className={base.page}>
      <div className={styles.screenOnly}>
        <PageHeader
          title="כרטיסי שולחן ותגי שם"
          mark="nameTags"
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
            {(isTableMode
              ? [
                ["seated", "שולחנות מאוישים", "רק שולחנות שיושבים בהם"],
                ["all",    "כל השולחנות",     "כולל שולחנות ריקים"],
              ]
              : [
                ["seated",    "רק משובצים", "מי שכבר יש לו שולחן"],
                ["confirmed", "רק שאישרו",  "כולל מי שעדיין לא שובץ"],
                ["all",       "כל האורחים", "חוץ ממי שסירב"],
              ]
            ).map(([v, l, note]) => (
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

          {isTableMode ? (
            <>
              <label className={styles.check}>
                <input type="checkbox" checked={showNames} onChange={e => setShowNames(e.target.checked)} />
                <span>הציגו את שמות היושבים מתחת למספר</span>
              </label>
              <p className={styles.foldNote}>
                <Icon name="cards" size={15} /> כל כרטיס מודפס כפול — קפלו על הקו המקווקו
                והכרטיס עומד לבד, קריא משני הצדדים.
              </p>
            </>
          ) : (
            <label className={styles.check}>
              <input type="checkbox" checked={showTable} onChange={e => setShowTable(e.target.checked)} />
              <span>הציגו מספר שולחן על הכרטיס</span>
            </label>
          )}

          <div className={styles.actions}>
            <button className={base.btnPrimary} onClick={() => window.print()} disabled={cards.length === 0}>
              <Icon name="print" /> הדפיסו {cards.length} {isTableMode ? "כרטיסי שולחן" : "כרטיסים"}
            </button>
            <span className={styles.count}>
              {isTableMode
                ? `${sizeMeta.perPage} בעמוד · ${pages} דפים`
                : `${sizeMeta.perPage} בעמוד · ${pages} דפים בערך`}
            </span>
          </div>

          {cards.length === 0 && (
            <EmptyState
              mark="nameTags"
              title={isTableMode ? "אין שולחנות להדפסה" : "אין כרטיסים להדפסה"}
              text={isTableMode
                ? "הגדירו שולחנות ושבצו אליהם אורחים, או בחרו “כל השולחנות”."
                : "בחרו קהל אחר, או שבצו אורחים לשולחנות תחילה."}
            />
          )}
        </div>

        {cards.length > 0 && <p className={styles.previewNote}>תצוגה מקדימה של ההדפסה:</p>}
      </div>

      {/* The print surface. On screen it renders as a preview; @media print
          hides everything else and lays these out on the page. */}
      {cards.length > 0 && isTableMode && (
        <div className={[styles.sheet, styles.sheet_table].join(" ")}>
          {tableCards.map(c => (
            <div key={c.key} className={styles.tent}>
              {/* Upper half, upside-down: once folded it faces the other side of
                  the table. Two halves, one sheet, one fold. */}
              <div className={[styles.tentFace, styles.tentFaceFlip].join(" ")}>
                <span className={styles.tentBig}>{c.big}</span>
                {c.full !== c.big && <span className={styles.tentFull}>{c.full}</span>}
                {showNames && c.names.length > 0 && (
                  <span className={styles.tentNames}>{c.names.join(" · ")}</span>
                )}
              </div>
              <div className={styles.tentFold} aria-hidden="true" />
              <div className={styles.tentFace}>
                <span className={styles.tentBig}>{c.big}</span>
                {c.full !== c.big && <span className={styles.tentFull}>{c.full}</span>}
                {showNames && c.names.length > 0 && (
                  <span className={styles.tentNames}>{c.names.join(" · ")}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {cards.length > 0 && !isTableMode && (
        <div className={[styles.sheet, styles["sheet_" + size]].join(" ")}>
          {seatCards.map(c => (
            <div key={c.key} className={styles.card}>
              <span className={styles.cardName}>{c.name}</span>
              {showTable && c.table && (
                <span className={styles.cardTable}>{c.table}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
