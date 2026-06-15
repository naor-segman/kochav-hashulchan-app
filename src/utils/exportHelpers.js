const TABLE_TYPE_HE = { regular: "רגיל", vip: "VIP", head: "שולחן ראשי" };

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
    "שם אורח", "צד", "קבוצה", "כמות", "טלפון", "הערות",
  ]);

  ev.tables.forEach(t => {
    const tGuests      = ev.guests.filter(g => ev.seating[g.id] === t.id);
    const typeHe       = TABLE_TYPE_HE[t.type] || t.type;
    const seatedSeats  = tGuests.reduce((s, g) => s + (g.count != null ? g.count : 1), 0);
    const occupied     = seatedSeats + " / " + t.capacity;

    if (tGuests.length === 0) {
      rows.push([t.name, t.capacity, typeHe, occupied, "", "", "", "", "", ""]);
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
          g.phone || "",
          g.notes || "",
        ]);
      });
    }

    rows.push([]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(rows);
  ws1["!cols"] = [
    { wch: 16 }, { wch: 8 },  { wch: 12 }, { wch: 14 },
    { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 6  },
    { wch: 14 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "סידור הושבה");

  // ── Sheet 2: Unassigned guests ───────────────────────────────────────
  const unassigned = ev.guests.filter(g => !ev.seating[g.id]);
  if (unassigned.length > 0) {
    const uRows = [
      ["ממתינים לשיבוץ — " + (ev.name || "")],
      [],
      ["שם אורח", "צד", "קבוצה", "כמות", "טלפון", "הערות"],
      ...unassigned.map(g => [
        g.name  || "",
        sideLabel(g.side),
        g.group || "",
        g.count != null ? g.count : 1,
        g.phone || "",
        g.notes || "",
      ]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(uRows);
    ws2["!cols"] = [
      { wch: 20 }, { wch: 14 }, { wch: 14 },
      { wch: 6  }, { wch: 14 }, { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "ממתינים לשיבוץ");
  }

  // ── Sheet 3: Violations (only when present) ──────────────────────────
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
    const ws3 = XLSX.utils.aoa_to_sheet(vRows);
    ws3["!cols"] = [{ wch: 22 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws3, "הפרות אילוצים");
  }

  // xlsx 0.18.5: workbook-level RTL is the only reliable way to set sheet direction.
  // ws["!views"] is silently ignored; wb.Workbook.Views survives the write/read cycle.
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(wb, safeName(ev.name) + ".xlsx");
}
