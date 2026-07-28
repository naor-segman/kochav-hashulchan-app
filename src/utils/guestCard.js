/**
 * Personal entry cards.
 *
 * The check-in scanner reads a QR carrying a guest id, but until now nothing
 * produced one — the scanner had nothing to scan. This builds the guest-facing
 * side of that loop.
 *
 * The card link carries the guest's own details in the query string rather than
 * looking them up server-side. That is deliberate:
 *   - no new public RPC, no migration, no extra table;
 *   - a guest receives only their OWN link, so nothing leaks about anyone else
 *     (contrast: handing out the hostess token would expose the whole list);
 *   - the QR still encodes the real guest id, and the host's scanner validates
 *     it against the real guest list — so editing your own URL to claim a
 *     different table changes nothing about check-in.
 */

/** QR payload the check-in scanner expects. Mirrors parseScanPayload(). */
export function guestScanPayload(guestId) {
  return "kh1:" + guestId;
}

/**
 * Personal card URL for one guest.
 *
 * @param {string} origin      window.location.origin
 * @param {string} inviteToken event.tokens.invite
 * @param {object} guest       { id, name }
 * @param {object|null} table  the guest's table, when seated
 * @returns {string|null} null when there is no invite token to build on
 */
export function buildGuestCardUrl(origin, inviteToken, guest, table) {
  if (!inviteToken || !guest?.id) return null;
  const q = new URLSearchParams({ g: guest.id });
  if (guest.name) q.set("n", guest.name);
  if (table?.name) q.set("t", table.name);
  return `${origin}/card/${inviteToken}?${q.toString()}`;
}

/**
 * Read the personal-card params off a URL search string.
 * Values are length-capped so a hand-edited link can't inject a wall of text
 * into the page.
 */
export function readGuestCardParams(search) {
  const p = new URLSearchParams(search || "");
  const id = (p.get("g") || "").trim();
  if (!id) return null;
  const clip = (v, n) => (v || "").trim().slice(0, n);
  return {
    guestId: clip(id, 64),
    name:    clip(p.get("n"), 60),
    table:   clip(p.get("t"), 40),
  };
}
