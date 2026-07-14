const TABLE_TYPE_HE = { regular: "רגיל", vip: "VIP", head: "שולחן ראשי" };
const RSVP_HE = { confirmed: "אישר/ה", declined: "סירב/ה", pending: "ממתין" };
const rsvpHe = r => RSVP_HE[r] || "ממתין";
const MEAL_HE = { regular: "רגיל", kosher: "כשר מהדרין", vegan: "טבעוני", vegetarian: "צמחוני", child: "ילדים", none: "לא אוכל" };
const mealHe = m => MEAL_HE[m] || "רגיל";

function fmtDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("he-IL", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch { return dateStr; }
}

function safeName(str) {
  return (str || "סידור הושבה").replace(/[/\\?%*:|"<>[\]]/g, "-");
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
    "שם אורח", "צד", "קבוצה", "כמות", "RSVP", "מנה", "טלפון", "הערות",
  ]);

  ev.tables.forEach(t => {
    const tGuests      = ev.guests.filter(g => ev.seating[g.id] === t.id);
    const typeHe       = TABLE_TYPE_HE[t.type] || t.type;
    const seatedSeats  = tGuests.reduce((s, g) => s + (g.count != null ? g.count : 1), 0);
    const occupied     = seatedSeats + " / " + t.capacity;

    if (tGuests.length === 0) {
      rows.push([t.name, t.capacity, typeHe, occupied, "", "", "", "", "", "", "", ""]);
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
          g.count != null ? g.count : 1,
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
    { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 6  },
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "סידור הושבה");

  // ── Sheet 2: Unassigned guests ───────────────────────────────────────
  const unassigned = ev.guests.filter(g => !ev.seating[g.id]);
  if (unassigned.length > 0) {
    const uRows = [
      ["ממתינים לשיבוץ — " + (ev.name || "")],
      [],
      ["שם אורח", "צד", "קבוצה", "כמות", "RSVP", "מנה", "טלפון", "הערות"],
      ...unassigned.map(g => [
        g.name  || "",
        sideLabel(g.side),
        g.group || "",
        g.count != null ? g.count : 1,
        rsvpHe(g.rsvp),
        mealHe(g.meal),
        g.phone || "",
        g.notes || "",
      ]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(uRows);
    ws2["!cols"] = [
      { wch: 20 }, { wch: 14 }, { wch: 14 },
      { wch: 6  }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "ממתינים לשיבוץ");
  }

  // ── Sheet 3: Alphabetical entrance list ─────────────────────────────
  {
    const assigned = ev.guests
      .filter(g => ev.seating[g.id])
      .sort((a, b) => a.name.localeCompare(b.name, "he"));
    const tableMap = Object.fromEntries(ev.tables.map(t => [t.id, t]));
    const aRows = [
      ["רשימת כניסה לפי א׳-ב׳ — " + (ev.name || "")],
      [],
      ["שם אורח", "שולחן", "צד", "כמות", "מנה", "טלפון", "הערות"],
      ...assigned.map(g => [
        g.name || "",
        tableMap[ev.seating[g.id]]?.name || "",
        sideLabel(g.side),
        g.count != null ? g.count : 1,
        mealHe(g.meal),
        g.phone || "",
        g.notes || "",
      ]),
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

  // ── Sheet 5: Meal report for caterer ────────────────────────────────────
  {
    const mealKeys  = Object.keys(MEAL_HE);
    const mealHdr   = ["שולחן", ...mealKeys.map(k => MEAL_HE[k]), "סה״כ"];
    const mealRows  = [
      ["דוח מנות לטבח — " + (ev.name || "")],
      [],
      mealHdr,
    ];
    const mealTotals = Object.fromEntries(mealKeys.map(k => [k, 0]));
    ev.tables.forEach(t => {
      const tGuests = ev.guests.filter(g => ev.seating[g.id] === t.id);
      if (tGuests.length === 0) return;
      const counts  = Object.fromEntries(mealKeys.map(k => [k, 0]));
      tGuests.forEach(g => {
        const key = g.meal || "regular";
        counts[key] = (counts[key] || 0) + (g.count != null ? g.count : 1);
        mealTotals[key] = (mealTotals[key] || 0) + (g.count != null ? g.count : 1);
      });
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      mealRows.push([t.name, ...mealKeys.map(k => counts[k] || 0), total]);
    });
    const grandTotal = Object.values(mealTotals).reduce((s, n) => s + n, 0);
    mealRows.push([]);
    mealRows.push(["סה״כ", ...mealKeys.map(k => mealTotals[k] || 0), grandTotal]);
    const ws5 = XLSX.utils.aoa_to_sheet(mealRows);
    ws5["!cols"] = [{ wch: 16 }, ...mealKeys.map(() => ({ wch: 14 })), { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws5, "דוח מנות לטבח");
  }

  // ── Sheet 6: Gift reconciliation report ─────────────────────────────────
  {
    const tableMap   = Object.fromEntries(ev.tables.map(t => [t.id, t]));
    const giftAmt    = g => Number(g.giftAmount) || 0;
    const giftGuests = ev.guests
      .filter(g => g.arrived || giftAmt(g) > 0)
      .sort((a, b) => {
        if (giftAmt(b) !== giftAmt(a)) return giftAmt(b) - giftAmt(a);
        return a.name.localeCompare(b.name, "he");
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
        ...ev.guests
          .sort((a, b) => {
            const aArrived = a.arrived ? 0 : 1;
            const bArrived = b.arrived ? 0 : 1;
            if (aArrived !== bArrived) return aArrived - bArrived;
            return giftAmt(b) - giftAmt(a);
          })
          .map(g => [
            g.name || "",
            tableMap[ev.seating[g.id]]?.name || "",
            g.count != null ? g.count : 1,
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
