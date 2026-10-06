import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/* A new page starts at its top (owner, 6.10: "זה שולח לאמצע העמוד וזה מוזר
 * ולא תקין"). A single-page app keeps the window's scroll across a route
 * change, so a service tile clicked 700px down the home page opened its page
 * 700px down — measured at 390 and 1280; the footer's "מחירים" opened the
 * pricing page at 5,770px.
 *
 * Not on Back/Forward (POP): the browser puts the reader back where they were.
 * Not when the URL carries a #hash: useHashScroll takes them to the section.
 * Not when only the search or the hash changes on the same page. */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    if (type === "POP" || hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    // pathname only: a search/hash change on the same page is not a new page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  return null;
}
