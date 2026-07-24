// V1 date formatting — extracted from Dashboard in legacy/v1-seating-app.jsx

const MONTHS = ["","ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

export const fmtDate = d => {
  if (!d) return null;
  const [y, m, day] = String(d).split("-");
  const month = MONTHS[Number(m)];
  // Malformed input (missing/NaN parts) → return the raw string instead of
  // "NaN בundefined ...".
  if (!day || !month || Number.isNaN(Number(day))) return String(d);
  return Number(day) + " ב" + month + " " + y;
};
