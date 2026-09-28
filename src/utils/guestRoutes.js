/**
 * The routes a GUEST opens — each is `/<prefix>/<token>`. One list, used by
 * the error reporter and analytics (to scrub the token out of a path), by the
 * support button (which is for hosts, not their guests) and by anything else
 * that has to tell a guest page from a host one.
 *
 * `/events/:id/entrance` is the host's own door screen and is NOT here; the
 * greeter's is `/entrance/:token` and `/hostess/:token`.
 */
export const GUEST_ROUTE_PREFIXES = ["rsvp", "invite", "gift", "card", "album", "collab", "hostess",
  "entrance", "invitation", "save-the-date"];

/** Whether a pathname is a guest page. */
export function isGuestRoute(pathname) {
  const seg = String(pathname || "").split("/");
  return seg.length >= 3 && GUEST_ROUTE_PREFIXES.includes(seg[1]) && !!seg[2];
}

/**
 * Whose event this is, as a guest reads it: "דנה ויוסי", else the celebrant,
 * the organisation, or the event's own name.
 */
export function guestHosts(ev) {
  if (!ev) return "";
  if (ev.brideName && ev.groomName) return `${ev.brideName} ו${ev.groomName}`;
  return ev.celebrantName || ev.organizationName || ev.ownerName || ev.name || "";
}

/**
 * An event type as a guest may read it. "אחר" is a real, selectable type,
 * and it was printed as-is on the RSVP pill and the site hero — a guest read
 * "Other" as the kind of event they were invited to (106, 28.9).
 */
export function guestEventType(type) {
  return type && type !== "אחר" ? type : "";
}
