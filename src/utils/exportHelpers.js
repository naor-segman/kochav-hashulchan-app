import { guestCompanionNames, guestSeatNames } from "./eventHelpers.js";
import { missingCompanionSeats } from "./guestForm.js";
import { TABLE_TYPES } from "../data/constants.js";
// Shared with the app rather than re-implemented. The local copy pushed the ISO
// string through `new Date()`, which parses it as UTC — so west of Greenwich the
// exported sheet showed a different date than the screen, and a New Year's Eve
// event exported as the previous year.
import { fmtDate } from "./dateFormat.js";

// Derived from the source of truth. The hand-written map covered 3 of the 5
// real types and carried a 'head' key the UI can never produce, so 'knight',
// 'bar' and 'small' printed as raw English in an otherwise Hebrew workbook.
const TABLE_TYPE_HE = Object.fromEntries(TABLE_TYPES.map(t => [t.value, t.label]));
const RSVP_HE = { confirmed: "אישר/ה", declined: "סירב/ה", maybe: "אולי", pending: "ממתין" };
const rsvpHe = r => RSVP_HE[r] || "ממתין";
const MEAL_HE = { regular: "רגיל", kosher: "כשר מהדרין", vegan: "טבעוני", vegetarian: "צמחוני", child: "ילדים", none: "לא אוכל" };
const mealHe = m => MEAL_HE[m] || "רגיל";


function safeName(str) {
  return (str || "סידור הושבה").replace(/[/\\?%*:|"<>[\]]/g, "-");
}

// ── The shared collaborative table ───────────────────────────────────────────
//
// One builder, used by BOTH screens that offer to download that table: the
// relative's public page (CollabScreen) and the host's hub (CollabReviewScreen).
// They each had their own copy, and the copies had drifted into two different
// features wearing one label: the relative's button exported the collab rows,
// the host's exported `ev.guests`. Both wrote a file named
// `אורחים-<event>.xlsx` — which is also the name GuestManagerScreen's full-list
// export writes. Three buttons, three datasets, one filename in the Downloads
// folder.
//
// The rule now: this button exports THE SHARED TABLE, on both screens, under its
// own filename. The host's full guest list has its own export in the guest
// manager and does not need a second, thinner one here.

const COLLAB_FIELDS = [
  ["name",        "שם"],
  ["phone",       "טלפון"],
  ["side",        "צד"],
  ["guest_group", "קבוצה"],
];

/**
 * Which required fields a shared-table row is still missing, in Hebrew.
 * Empty array = the row is complete and syncs into the guest list.
 * `guests_count` is never listed: it always defaults to 1, so it is never
 * missing. Exported so the screen badge, the exported סטטוס column AND the sync
 * engine can never disagree about what "complete" means.
 *
 * Since 12.8 the names of the extra seats are part of "complete" (owner: a seat
 * with no name is counted twice — once as a chair, once as the person it turns
 * out to be). This is deliberately expressed HERE rather than as a new
 * mechanism: the shared table saves as you type, so blocking a keystroke would
 * make it unusable. What happens instead is exactly what already happens to a
 * row with no phone — it is saved, it is visibly incomplete, and it does not
 * enter the host's guest list until it is finished.
 */
export function collabRowMissing(row) {
  const missing = COLLAB_FIELDS
    .filter(([k]) => !((row?.[k] ?? "").toString().trim()))
    .map(([, label]) => label);
  const seats = missingCompanionSeats(row?.companions, row?.guests_count);
  if (seats.length) {
    // Numbered to match the inputs the screens render ("שם 1", "שם 2") and
    // their aria-labels, so "חסר: שם המצטרף 2" points at one specific box.
    missing.push(seats.length === 1
      ? `שם המצטרף ${seats[0]}`
      : `שמות המצטרפים (${seats.join(", ")})`);
  }
  return missing;
}

/**
 * Download the shared collaborative table as a workbook.
 *
 * @param {object[]} rows       collab rows: { name, phone, side, guest_group,
 *                              guests_count, companions, notes, updated_by }
 * @param {object}   opts
 * @param {string}   opts.eventName   used for the filename only
 * @param {object}   opts.sideLabels  { bride, groom } — already localised
 */
export async function exportCollabTableToExcel(rows, { eventName, sideLabels } = {}) {
  const XLSX = await import("xlsx");
  const sides = sideLabels || {};
  const list  = Array.isArray(rows) ? rows : [];

  const aoa = [[
    "שם מלא", "טלפון", "צד", "קבוצה", "כמות", "שמות המצטרפים", "הערות", "נוסף/עודכן ע״י", "סטטוס",
  ]];

  list.forEach(r => {
    const count = Number(r.guests_count) || 1;
    // The companion names are the reason this table exists — a host who
    // downloads it and finds "9" with nobody named has been handed a number,
    // not a guest list. Clamped to the extra seats exactly as the app clamps
    // them, so a stale longer array can't print people who have no chair.
    const companions = guestCompanionNames({ count, companions: r.companions }).join(", ");
    const missing = collabRowMissing(r);
    aoa.push([
      r.name || "",
      r.phone || "",
      sides[r.side] || "",
      r.guest_group || "",
      count,
      companions,
      // The whole point of the notes column: the dietary need / accessibility /
      // "sits with the grandparents" the relative typed reaches the host in the
      // same file as the name, instead of in a separate WhatsApp message the
      // host has to go and ask for.
      (r.notes || "").toString().trim(),
      r.updated_by || "",
      missing.length ? "חסר: " + missing.join(", ") : "מלאה — מסונכרנת",
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 16 },
    { wch: 7 }, { wch: 34 }, { wch: 30 }, { wch: 16 }, { wch: 24 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "טבלה שיתופית");
  // Same reason as the seating export: without this the Hebrew sheet opens
  // left-to-right, with the first column on the wrong side.
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(wb, `טבלה-שיתופית-${(eventName || "אירוע").replace(/[^\p{L}\p{N} -]/gu, "")}.xlsx`);
}

export async function exportToExcel(ev, sideLabel, violations) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Seating plan ────────────────────────────────────────────
  const rows = [];

  rows.push([ev.name || "—"]);
  if (ev.date)  rows.push(["תאריך:", fmtDate(ev.date)]);
  if (ev.venue) rows.push(["אולם:", ev.venue]);
  rows.push([]);

  rows.push([
    "שולחן", "קיבולת", "סוג שולחן", "שובצו/קיבולת",
    "שם אורח", "צד", "קבוצה", "כמות", "שמות המצטרפים",
    "RSVP", "מנה", "טלפון", "הערות",
  ]);

  ev.tables.forEach(t => {
    const tGuests      = ev.guests.filter(g => ev.seating[g.id] === t.id);
    const typeHe       = TABLE_TYPE_HE[t.type] || t.type;
    const seatedSeats  = tGuests.reduce((s, g) => s + (g.count || 1), 0);
    // "5 מתוך 12", not "5 / 12". The workbook is opened RTL
    // (`wb.Workbook.Views[0].RTL`), and a spaced slash between two numbers with
    // no strong RTL character has its two number runs swapped by bidi rule N1 —
    // measured: DOM "5 / 12" lays out as 12 then 5, so a table with 5 of 12
    // seats taken reads as massively overbooked under the שובצו/קיבולת header.
    // The Hebrew word sits BETWEEN the numbers, which is the form that anchors
    // them; a Hebrew word after the pair does not.
    const occupied     = seatedSeats + " מתוך " + t.capacity;

    if (tGuests.length === 0) {
      rows.push([t.name, t.capacity, typeHe, occupied, "", "", "", "", "", "", "", "", ""]);
    } else {
      tGuests.forEach((g, i) => {
        rows.push([
          i === 0 ? t.name    : "",
          i === 0 ? t.capacity : "",
          i === 0 ? typeHe    : "",
          i === 0 ? occupied  : "",
          g.name  || "",
          sideLabel(g.side),
          g.group || "",
          g.count || 1,
          // Same column the shared table has, for the same reason: a plan that
          // says "טל שוורץ · 4" and names nobody hands the host a number, not a
          // guest list. Clamped to the seats the row has, so a stale companions
          // array cannot seat people who have no chair.
          guestCompanionNames(g).join(", "),
          rsvpHe(g.rsvp),
          mealHe(g.meal),
          g.phone || "",
          g.notes || "",
        ]);
      });
    }

    rows.push([]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(rows);
  ws1["!cols"] = [
    { wch: 16 }, { wch: 8  }, { wch: 12 }, { wch: 14 },
    { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 6  }, { wch: 34 },
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "סידור הושבה");

  // ── Sheet 2: Unassigned guests ───────────────────────────────────────
  const unassigned = ev.guests.filter(g => !ev.seating[g.id]);
  if (unassigned.length > 0) {
    const uRows = [
      ["ממתינים לשיבוץ — " + (ev.name || "")],
      [],
      ["שם אורח", "צד", "קבוצה", "כמות", "שמות המצטרפים", "RSVP", "מנה", "טלפון", "הערות"],
      ...unassigned.map(g => [
        g.name  || "",
        sideLabel(g.side),
        g.group || "",
        g.count || 1,
        guestCompanionNames(g).join(", "),
        rsvpHe(g.rsvp),
        mealHe(g.meal),
        g.phone || "",
        g.notes || "",
      ]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(uRows);
    ws2["!cols"] = [
      { wch: 20 }, { wch: 14 }, { wch: 14 },
      { wch: 6  }, { wch: 34 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "ממתינים לשיבוץ");
  }

  // ── Sheet 3: Alphabetical entrance list ─────────────────────────────
  {
    const tableMap = Object.fromEntries(ev.tables.map(t => [t.id, t]));
    // One row per SEAT — every individual (incl. named companions "רונית (טל)"
    // and unnamed "+1/+2") appears, so the entrance team can find anyone by name.
    const seatRows = ev.guests
      // Declined guests are excluded from every on-screen list (check-in, name
      // tags, analytics). The printed door list included them, with no RSVP
      // column to tell them apart, so the count could never be reconciled.
      .filter(g => ev.seating[g.id] && g.rsvp !== "declined")
      .flatMap(g => {
        const table = tableMap[ev.seating[g.id]]?.name || "";
        return guestSeatNames(g).map((seatName, idx) => ({
          name: seatName, table, side: sideLabel(g.side),
          count: idx === 0 ? (g.count || 1) : "",
          meal: mealHe(g.meal),
          phone: idx === 0 ? (g.phone || "") : "",
          notes: idx === 0 ? (g.notes || "") : "",
        }));
      })
      .sort((a, b) => a.name.localeCompare(b.name, "he"));
    const aRows = [
      ["רשימת כניסה לפי א׳-ב׳ — " + (ev.name || "")],
      [],
      ["שם אורח", "שולחן", "צד", "כמות", "מנה", "טלפון", "הערות"],
      ...seatRows.map(r => [r.name, r.table, r.side, r.count, r.meal, r.phone, r.notes]),
    ];
    const ws3e = XLSX.utils.aoa_to_sheet(aRows);
    ws3e["!cols"] = [
      { wch: 22 }, { wch: 16 }, { wch: 14 },
      { wch: 6  }, { wch: 14 }, { wch: 14 }, { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws3e, "רשימת כניסה א׳-ב׳");
  }

  // ── Sheet 4: Violations (only when present) ──────────────────────────
  if (violations && violations.length > 0) {
    const typeHe = t =>
      t === "capacity" ? "חריגת קיבולת"
      : t === "apart"  ? "הפרת הפרדה"
      :                  "הפרת ישיבה משותפת";

    const vRows = [
      ["הפרות אילוצים — " + (ev.name || "")],
      [],
      ["סוג הפרה", "תיאור"],
      ...violations.map(v => [typeHe(v.type), v.text || ""]),
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(vRows);
    ws4["!cols"] = [{ wch: 22 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws4, "הפרות אילוצים");
  }

  // (Sheet 5 "דוח מנות לטבח" removed per feedback — caterers don't need it.)

  // ── Sheet 6: Gift reconciliation report ─────────────────────────────────
  {
    const tableMap   = Object.fromEntries(ev.tables.map(t => [t.id, t]));
    const giftAmt    = g => Number(g.giftAmount) || 0;
    const giftGuests = ev.guests
      .filter(g => g.arrived || giftAmt(g) > 0)
      .sort((a, b) => {
        if (giftAmt(b) !== giftAmt(a)) return giftAmt(b) - giftAmt(a);
        return (a.name || '').localeCompare(b.name || '', "he");
      });

    if (giftGuests.length > 0 || ev.guests.some(g => g.arrived)) {
      const allArrived   = ev.guests.filter(g => g.arrived);
      const giftTotal    = ev.guests.reduce((s, g) => s + giftAmt(g), 0);
      const giftCount    = ev.guests.filter(g => giftAmt(g) > 0).length;
      const avgGift      = giftCount > 0 ? Math.round(giftTotal / giftCount) : 0;

      const gRows = [
        ["דוח מתנות — " + (ev.name || "")],
        [],
        ["סיכום:", "", "סה״כ הגיעו:", allArrived.length, "סה״כ מתנות:", "₪" + giftTotal.toLocaleString("he-IL"), "ממוצע:", avgGift > 0 ? "₪" + avgGift.toLocaleString("he-IL") : "—"],
        [],
        ["שם אורח", "שולחן", "כמות", "הגיע/ה", "סכום מתנה (₪)"],
        ...[...ev.guests]
          .sort((a, b) => {
            const aArrived = a.arrived ? 0 : 1;
            const bArrived = b.arrived ? 0 : 1;
            if (aArrived !== bArrived) return aArrived - bArrived;
            return giftAmt(b) - giftAmt(a);
          })
          .map(g => [
            g.name || "",
            tableMap[ev.seating[g.id]]?.name || "",
            g.count || 1,
            g.arrived ? "✓" : "",
            giftAmt(g) > 0 ? giftAmt(g) : "",
          ]),
        [],
        ["", "", "", "סה״כ", giftTotal],
      ];

      const ws6 = XLSX.utils.aoa_to_sheet(gRows);
      ws6["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 6 }, { wch: 8 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws6, "דוח מתנות");
    }
  }

  // xlsx 0.18.5: workbook-level RTL is the only reliable way to set sheet direction.
  // ws["!views"] is silently ignored; wb.Workbook.Views survives the write/read cycle.
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(wb, safeName(ev.name) + ".xlsx");
}
