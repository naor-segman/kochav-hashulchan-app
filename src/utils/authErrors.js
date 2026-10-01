/**
 * The Hebrew sentence to show for a Supabase auth error (37b).
 *
 * WHY THIS EXISTS
 * Login and signup each had a `friendlyError(message)` that matched a few
 * English substrings and otherwise RETURNED THE MESSAGE ITSELF. So anything it
 * did not know reached the host verbatim: "Email rate limit exceeded",
 * "Password should contain at least one character of each: …", and — when the
 * network dropped mid-request — supabase-js's AuthRetryableFetchError, whose
 * message is the JSON of the failed fetch: the literal text `{}`.
 *
 * Matching on wording is also fragile: GoTrue rewords its messages between
 * versions. It does give a stable `code` (`weak_password`,
 * `over_email_send_rate_limit`, …) and an HTTP `status`, so those are read
 * first, the English wording only as a last resort for older servers, and the
 * fallback is ALWAYS a Hebrew sentence. The raw message is never returned.
 *
 * `action` picks the fallback and the sentences that only make sense in one
 * place: "signIn" | "signUp" | "updatePassword" (the emailed reset link) |
 * "changePassword" (the account screen) | "resetEmail" | "resend".
 */

const RATE_LIMITED = "יותר מדי ניסיונות. המתינו כמה דקות ונסו שוב.";
const EMAIL_RATE_LIMITED = "נשלחו יותר מדי הודעות לכתובת הזו. המתינו כמה דקות ונסו שוב.";
const NETWORK = "אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.";

const FALLBACK = {
  signIn: "הכניסה לא הצליחה. נסו שוב.",
  signUp: "ההרשמה לא הצליחה. נסו שוב.",
  updatePassword: "עדכון הסיסמה לא הצליח. ייתכן שהקישור פג תוקפו — בקשו קישור חדש.",
  changePassword: "שינוי הסיסמה לא הצליח. נסו שוב.",
  resetEmail: "שליחת הקישור לא הצליחה. בדקו את כתובת האימייל ונסו שוב.",
  resend: "השליחה החוזרת לא הצליחה. נסו שוב.",
};

const BY_CODE = {
  invalid_credentials:        "אימייל או סיסמה שגויים.",
  email_not_confirmed:        "יש לאשר קודם את כתובת האימייל — חפשו את הקישור שנשלח אליכם.",
  user_already_exists:        "כתובת האימייל הזו כבר רשומה. נסו להתחבר.",
  email_exists:               "כתובת האימייל הזו כבר רשומה. נסו להתחבר.",
  weak_password:              "הסיסמה חלשה מדי. בחרו סיסמה ארוכה יותר, עם אותיות ומספרים.",
  same_password:              "הסיסמה החדשה זהה לישנה. בחרו סיסמה אחרת.",
  email_address_invalid:      "כתובת האימייל אינה תקינה.",
  validation_failed:          "כתובת האימייל אינה תקינה.",
  signup_disabled:            "ההרשמה סגורה כרגע.",
  email_provider_disabled:    "ההרשמה סגורה כרגע.",
  over_request_rate_limit:    RATE_LIMITED,
  over_email_send_rate_limit: EMAIL_RATE_LIMITED,
  over_sms_send_rate_limit:   RATE_LIMITED,
  request_timeout:            NETWORK,
  session_not_found:          "פג תוקף ההתחברות. היכנסו שוב.",
  session_expired:            "פג תוקף ההתחברות. היכנסו שוב.",
  otp_expired:                "הקישור פג תוקף. בקשו קישור חדש.",
};

function isNetworkFailure(err) {
  if (err.name === "AuthRetryableFetchError") return true;
  if (err.status === 0) return true;
  if (err.name === "TypeError") return true; // a bare fetch() rejection
  const m = String(err.message || "").toLowerCase();
  return m === "{}" || m.includes("failed to fetch") || m.includes("fetch failed")
    || m.includes("network") || m.includes("load failed");
}

export function authErrorMessage(err, action = "signIn") {
  const fallback = FALLBACK[action] || FALLBACK.signIn;
  if (!err || typeof err !== "object") return fallback;

  const code = typeof err.code === "string" ? err.code : "";
  if (BY_CODE[code]) return BY_CODE[code];
  if (err.status === 429) return code.includes("email") ? EMAIL_RATE_LIMITED : RATE_LIMITED;
  if (isNetworkFailure(err)) return NETWORK;
  if (typeof err.status === "number" && err.status >= 500) return NETWORK;

  // Older GoTrue servers send no code — their English wording, as a last resort.
  const m = String(err.message || "").toLowerCase();
  if (m.includes("invalid login credentials"))   return BY_CODE.invalid_credentials;
  if (m.includes("email not confirmed"))         return BY_CODE.email_not_confirmed;
  if (m.includes("already registered") || m.includes("already been registered"))
    return BY_CODE.user_already_exists;
  if (m.includes("rate limit") || m.includes("too many requests")) return RATE_LIMITED;
  if (m.includes("should be different"))         return BY_CODE.same_password;
  if (m.includes("password"))                    return BY_CODE.weak_password;

  return fallback;
}
