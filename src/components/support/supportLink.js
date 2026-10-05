import { COMPANY } from "../../data/company.js";

/* The support line, in one place: the floating button and the line under the
   sign-in forms both read it, so the number and the greeting cannot drift.

   The number is the business phone (COMPANY.whatsapp — owner, 4.10: one number
   for the business and for support); VITE_SUPPORT_WHATSAPP, international
   format without "+", overrides it. With neither, there is no support link. */
const RAW = import.meta.env.VITE_SUPPORT_WHATSAPP || COMPANY.whatsapp || "";
export const SUPPORT_PHONE = RAW.replace(/[^\d]/g, "");

// Neutral on purpose: this is the HOST's first message, typed for them, and
// "אני צריך" made every host who is not a man send a sentence in the wrong
// gender (audit 3.10, C17).
const GREETING = encodeURIComponent(`היי, אשמח לעזרה עם ${COMPANY.name} 🙂`);

/** wa.me link with the greeting typed in, or "" when no number is set. */
export const supportHref = () =>
  SUPPORT_PHONE ? `https://wa.me/${SUPPORT_PHONE}?text=${GREETING}` : "";

/* The sign-in forms (WORKPLAN 136 stage C, owner 5.10: "שום כפתור צף על
   הטופס"). At 390 px the 54 px button sat over the form's lower corner; these
   screens carry the same help as a line inside the card instead. */
export const AUTH_FORM_PATHS = ["/login", "/signup", "/reset-password", "/auth/callback"];

export const isAuthFormRoute = (pathname) =>
  AUTH_FORM_PATHS.includes(String(pathname || "").toLowerCase().replace(/\/+$/, ""));
