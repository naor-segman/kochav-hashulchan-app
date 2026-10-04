import { useEffect } from "react";
import { COMPANY } from "../data/company.js";
import { INVALID_LINK_TEXT, UNREACHABLE_TEXT, NOT_PUBLISHED_TEXT } from "../data/guestCopy.js";

/* The tab of a guest page that has no event to name (audit 3.10, P2-6): a
   dead link, or no connection. Both read the site default before — a guest
   with the RSVP tab open could not see from the tab that it had failed.
   And a save-the-date / invitation not published yet (3.10, leftovers). */
export const DEAD_LINK_TAB     = `${INVALID_LINK_TEXT.title} · ${COMPANY.name}`;
export const OFFLINE_TAB       = `${UNREACHABLE_TEXT.title} · ${COMPANY.name}`;
export const NOT_PUBLISHED_TAB = `${NOT_PUBLISHED_TEXT.title} · ${COMPANY.name}`;

/**
 * The browser tab of a guest page names the event, not the product. Until
 * 28.9 every guest tab — and every home-screen bookmark a guest saved — read
 * "<brand> — סידור הושבה, אישורי הגעה…" (106). Runs after the page's data
 * arrives, so it lands after the router-level default title.
 *
 * @param {string|null|false} title nothing is set until this is truthy
 */
export function useGuestTitle(title) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
