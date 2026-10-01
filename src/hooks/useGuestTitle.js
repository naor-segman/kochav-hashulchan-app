import { useEffect } from "react";

/**
 * The browser tab of a guest page names the event, not the product. Until
 * 28.9 every guest tab — and every home-screen bookmark a guest saved — read
 * "רוויה — סידור הושבה, אישורי הגעה…" (106). Runs after the page's data
 * arrives, so it lands after the router-level default title.
 *
 * @param {string|null|false} title nothing is set until this is truthy
 */
export function useGuestTitle(title) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
