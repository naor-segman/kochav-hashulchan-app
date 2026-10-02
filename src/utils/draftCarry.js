// Drafts made without an account, carried into the account that signs in
// (33d, owner 2.10).
//
// A draft in the logged-out bucket used to join WHICHEVER account signed in
// next on that browser — on a shared computer, a stranger's guest list, with
// phone numbers, landing in someone else's account. Now a draft joins an
// account only when the person says so: by the banner after signing in, or by
// starting the signup or login from INSIDE the draft (the "הצטרפו" button in
// the app header, the "כדי לשתף צריך חשבון" dialog). The second is the same
// consent, given one screen earlier, and the dialog promises "הכל שבניתם עד
// עכשיו עובר איתכם" — so it has to come along without a further question.
//
// The mark lives in sessionStorage (this tab only) and expires: a signup
// abandoned half an hour ago does not authorise whoever signs in next.

const KEY = "kochav_carry_drafts";
export const CARRY_TTL_MS = 30 * 60 * 1000;

/** Called by a signup/login link shown inside the logged-out app. */
export function markDraftCarry(now = Date.now()) {
  try { sessionStorage.setItem(KEY, String(now)); } catch { /* private mode: the banner still asks */ }
}

/** Read once, at sign-in. Always clears the mark; true only while it is fresh. */
export function takeDraftCarry(now = Date.now()) {
  try {
    const at = Number(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
    return at > 0 && now >= at && now - at < CARRY_TTL_MS;
  } catch {
    return false;
  }
}

const declinedKey = (userId) => `kochav_drafts_declined_${userId}`;

/** Draft ids this account said "not mine" to — never offered to it again. */
export function readDeclinedDrafts(userId) {
  try {
    const ids = JSON.parse(localStorage.getItem(declinedKey(userId)) || "[]");
    return new Set(Array.isArray(ids) ? ids.filter(x => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function addDeclinedDrafts(userId, ids) {
  const all = readDeclinedDrafts(userId);
  ids.forEach(id => all.add(id));
  // Capped: ids of drafts long gone are worth nothing, and this must not grow forever.
  try { localStorage.setItem(declinedKey(userId), JSON.stringify([...all].slice(-200))); } catch { /* best effort */ }
}
