// V1 date formatting — extracted from Dashboard in legacy/v1-seating-app.jsx

const MONTHS = ["","ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

export const fmtDate = d => {
  if (!d) return null;
  const parts = d.split("-");
  return Number(parts[2]) + " ב" + MONTHS[Number(parts[1])] + " " + parts[0];
};
