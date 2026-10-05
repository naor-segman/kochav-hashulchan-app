/* The sign-in forms (WORKPLAN 136 stage C, owner 5.10). Two things treat them
   differently from every other page: the floating WhatsApp button is not shown
   over them ("שום כפתור צף על הטופס" — the card carries a help line instead),
   and the cookie question shrinks to a strip so it does not cover the form. */
export const AUTH_FORM_PATHS = ["/login", "/signup", "/reset-password", "/auth/callback"];

export const isAuthFormRoute = (pathname) =>
  AUTH_FORM_PATHS.includes(String(pathname || "").toLowerCase().replace(/\/+$/, ""));
