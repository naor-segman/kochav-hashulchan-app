/* The sign-in forms (WORKPLAN 136 stage C, owner 5.10). Two things treat them
   differently from every other page: the floating WhatsApp button is not shown
   over them ("שום כפתור צף על הטופס" — the card carries a help line instead),
   and the cookie question shrinks to a strip so it does not cover the form. */
// /admin/login too: the same kind of form, and it had the button and the full sheet.
export const AUTH_FORM_PATHS = ["/login", "/signup", "/reset-password", "/auth/callback", "/admin/login"];

export const isAuthFormRoute = (pathname) =>
  AUTH_FORM_PATHS.includes(String(pathname || "").toLowerCase().replace(/\/+$/, ""));
