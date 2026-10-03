// The visitor's answer to the cookie question (owner 3.10).
//
// Only ONE thing on this site needs consent: usage measurement (Google
// Analytics). The rest of what the browser keeps — the login, the copy of the host's events,
// a name typed into the album — is what the site cannot work without, and the
// law does not ask for consent for that. So the answer is a single yes/no.
//
// Kept per BROWSER, not per account: the question is asked before anyone signs
// in, and the measurement it governs starts on the first page.
//
// `at` is when the answer was given, so it can be shown if anyone asks.

export const CONSENT_KEY = "kochav_consent_v1";

/** Fired on window when the answer changes, or when someone asks to change it. */
export const CONSENT_CHANGED = "kochav:consent";
export const CONSENT_OPEN = "kochav:consent-open";

/** `{ analytics: boolean, at: string }`, or null when not asked yet. */
export function readConsent() {
  try {
    const v = JSON.parse(localStorage.getItem(CONSENT_KEY) || "null");
    if (v && typeof v === "object" && typeof v.analytics === "boolean") return v;
  } catch { /* unreadable = not asked */ }
  return null;
}

export function saveConsent({ analytics }) {
  const v = { analytics: analytics === true, at: new Date().toISOString() };
  // Private mode can refuse the write. The answer still holds for this visit
  // (the event below carries it); the question comes back next visit.
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(v)); } catch { /* best effort */ }
  try { window.dispatchEvent(new CustomEvent(CONSENT_CHANGED, { detail: v })); } catch { /* no window */ }
  return v;
}

/** Opens the preferences — from the footer, the privacy page, the account screen. */
export function openConsentSettings() {
  try { window.dispatchEvent(new Event(CONSENT_OPEN)); } catch { /* no window */ }
}
