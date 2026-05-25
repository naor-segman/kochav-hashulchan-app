import { GROUP_OPTIONS } from "./constants.js";
import { getSideLabels } from "../utils/eventHelpers.js";

const COLUMNS   = ["שם מלא", "טלפון", "כמות", "צד", "קבוצה", "הערות"];
const COL_WIDTHS = [{ wch: 26 }, { wch: 16 }, { wch: 9 }, { wch: 18 }, { wch: 22 }, { wch: 30 }];

/**
 * Build and download a .xlsx guest-list template.
 *
 * @param {string} filename  - Suggested download filename (e.g. "רשימת_אורחים_חתונה.xlsx")
 * @param {object} ev        - Active event object (optional). Used for side labels and custom groups.
 */
export async function downloadGuestTemplate(filename, ev) {
  const XLSX = await import("xlsx");

  // ── Dynamic values from the event ────────────────────────────────────────
  const sideLabels   = ev ? getSideLabels(ev) : { bride: "צד כלה", groom: "צד חתן" };
  const customGroups = ev?.customGroups ?? [];
  const allGroups    = [...GROUP_OPTIONS, ...customGroups];

  // ── Sheet 1 — "אורחים": the data sheet users fill in ────────────────────
  const exampleRows = [
    ["דוגמה: ישראל ישראלי", "050-0000000", 1, sideLabels.groom, "משפחה קרובה", ""],
    ["דוגמה: שרה כהן",      "052-0000000", 2, sideLabels.bride, "חברים",        "מגיעה עם מלווה"],
  ];

  const wsData = XLSX.utils.aoa_to_sheet([COLUMNS, ...exampleRows]);
  wsData["!cols"] = COL_WIDTHS;
  wsData["!rows"] = [{ hpx: 22 }]; // slightly taller header row

  // Force phone example cells to string type so Excel won't misread them as numbers
  exampleRows.forEach((_, i) => {
    const cellRef = `B${i + 2}`;
    if (wsData[cellRef]) wsData[cellRef].t = "s";
  });

  // ── Sheet 2 — "הוראות": Hebrew instructions ──────────────────────────────
  const sideHelp = sideLabels.bride + " / " + sideLabels.groom;
  const groupList = allGroups.join(", ");

  const instrRows = [
    ["מדריך מילוי רשימת אורחים"],
    [""],
    ["עמודה", "הסבר", "חובה?", "ערכים תקינים / דוגמה"],
    [
      "שם מלא",
      "שם פרטי + שם משפחה של האורח. כל שורה מייצגת רשומה אחת.",
      "כן",
      "כל טקסט",
    ],
    [
      "טלפון",
      "מספר טלפון — ישמש לזיהוי כפולים בייבוא. הקלד כטקסט כדי לשמור על הספרה 0 בהתחלה.",
      "לא",
      "050-0000000",
    ],
    [
      "כמות",
      "כמה מקומות ישיבה מייצגת הרשומה הזו. 1 = אורח יחיד, 2 = זוג, 3 = משפחה וכו׳.",
      "לא",
      "מספר שלם (1 ומעלה). ברירת מחדל: 1",
    ],
    [
      "צד",
      "לאיזה צד שייך האורח — ישפיע על סידור ההושבה.",
      "לא",
      sideHelp,
    ],
    [
      "קבוצה",
      "הקבוצה החברתית של האורח — תשפיע על ההושבה האוטומטית. ניתן להקליד שם קבוצה חדשה.",
      "לא",
      "ראה רשימה למטה",
    ],
    [
      "הערות",
      "הגבלות תזונה, נגישות, מלווה, הערה כלשהי. לא ישפיע על ההושבה.",
      "לא",
      "כל טקסט חופשי",
    ],
    [""],
    ["קבוצות מומלצות (ניתן גם להקליד שמות אחרים — המערכת תשמור אותם):"],
    ...allGroups.map(g => ["", "•  " + g]),
    [""],
    ["הערות חשובות:"],
    ["", "• שורות שהשם ריק בהן מדולגות אוטומטית."],
    ["", "• שורות הדגמה (מתחילות ב-\"דוגמה:\") מדולגות אוטומטית — מחק אותן לפני המילוי."],
    ["", "• כמות לא תקינה (אותיות, מספר שלילי) תסומן כשגיאה ולא תיובא."],
    ["", "• לשמירה על ספרת 0 בטלפון — פרמט את עמודת הטלפון כ\"טקסט\" ב-Excel לפני ההקלדה."],
    ["", "• גיליון \"אורחים\" בלבד נקרא בייבוא — אל תשנה את שמו."],
    ["", "• ניתן לייבא קובץ CSV ו-XLSX כאחד."],
  ];

  const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
  wsInstr["!cols"] = [{ wch: 14 }, { wch: 56 }, { wch: 8 }, { wch: 36 }];

  // ── Workbook ─────────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  // RTL direction for Hebrew content — supported by xlsx community 0.18+
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, wsData,  "אורחים");
  XLSX.utils.book_append_sheet(wb, wsInstr, "הוראות");

  // ── Download via Blob / ObjectURL — no data URLs, no base64 ─────────────
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
