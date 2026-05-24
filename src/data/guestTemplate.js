import * as XLSX from "xlsx";

const HEADERS = ["שם מלא", "טלפון", "כמות", "צד", "קבוצה", "הערות"];

const EXAMPLE_ROWS = [
  ["ישראל ישראלי", "050-0000000", 1, "צד חתן", "משפחה קרובה", ""],
  ["שרה כהן",      "052-0000000", 2, "צד כלה", "חברים",        "מגיעה עם מלווה"],
];

export function downloadGuestTemplate(filename) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...EXAMPLE_ROWS]);

  ws["!cols"] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 8  },
    { wch: 14 },
    { wch: 18 },
    { wch: 26 },
  ];
  ws["!views"] = [{ rightToLeft: true }];

  XLSX.utils.book_append_sheet(wb, ws, "אורחים");

  const buf  = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename || "רשימת_אורחים.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
