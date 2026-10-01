import { guestCompanionNames } from "./eventHelpers.js";

/**
 * The rows of the guest-list Excel export (GuestManagerScreen's one button).
 *
 * Moved out of the screen so it can be tested without a download. What it
 * fixes (89): the export had no column for companion names. A list pasted as
 * "דניאל ישראל (אודליה, מיכאל, אריאל)" kept those names in the app — the list
 * and the seating screen both show them — and the spreadsheet the host
 * downloaded "as a backup" had "4" in the count column and the three names
 * nowhere. Last column, so a sheet laid out by the old export keeps its columns
 * where they were.
 *
 * @param {object[]} guests
 * @param {{ sideLabel: (s: string) => string, mealLabel: (m: string) => string }} labels
 * @returns {Array<Array<string|number>>} header row first
 */
export const GUEST_SHEET_HEADER = ["שם מלא", "טלפון", "צד", "קבוצה", "כמות", "מנה", "אישור הגעה", "הערות", "שמות המלווים"];
export const GUEST_SHEET_COLS = [22, 15, 12, 16, 6, 12, 12, 20, 30].map(wch => ({ wch }));

const RSVP_TXT = { confirmed: "אישרו", declined: "לא מגיעים", maybe: "אולי", pending: "ממתין" };

export function guestListSheetRows(guests, { sideLabel, mealLabel }) {
  const aoa = [GUEST_SHEET_HEADER.slice()];
  for (const g of guests || []) {
    aoa.push([
      g.name || "", g.phone || "", sideLabel(g.side), g.group || "",
      g.count || 1, mealLabel(g.meal), RSVP_TXT[g.rsvp || "pending"] || "", g.notes || "",
      guestCompanionNames(g).join(", "),
    ]);
  }
  return aoa;
}
