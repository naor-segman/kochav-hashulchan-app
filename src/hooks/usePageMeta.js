import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { seoFor, pageTitle, pageCanonical } from "../data/seo.js";
import { COMPANY, DESCRIPTOR } from "../data/company.js";

/**
 * Keep <title>, the description and the canonical in step with the route.
 * Checklist 87.
 *
 * The build writes a correct <head> into a real document per indexable route
 * (see `seoPages()` in vite.config.js), and that is what a crawler and a
 * WhatsApp preview read — they never run this. This is the OTHER half: once the
 * app has booted, every navigation is client-side, so a visitor who lands on
 * /home and clicks through the header keeps the home page's title in their tab
 * on all six service pages. Browser history entries and bookmarks take the
 * title from here too.
 *
 * A route with no SEO entry — the signed-in app, a token page — falls back to
 * the site default rather than keeping whatever the previous route set. Leaving
 * it alone was the first version, and it meant the tab still read
 * "מחירים · רוויה" while the host sat in their guest list.
 *
 * No state: this writes to the document and reads nothing back, so it is not a
 * `react-hooks/set-state-in-effect` site.
 */
const DEFAULT_TITLE = `${COMPANY.name} — ${DESCRIPTOR}`;

function setMeta(selector, create, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  if (el.tagName === "LINK") el.setAttribute("href", value);
  else el.setAttribute("content", value);
  return el;
}

export function usePageMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = seoFor(pathname);
    document.title = page ? pageTitle(page) : DEFAULT_TITLE;

    setMeta(
      'meta[name="description"]',
      () => Object.assign(document.createElement("meta"), { name: "description" }),
      page ? page.description : DESCRIPTOR,
    );

    // The canonical is REMOVED on a non-indexable route rather than pointed at
    // the app: a canonical on /events/:id/seating would tell a crawler that a
    // private screen is the preferred version of something.
    const link = document.head.querySelector('link[rel="canonical"]');
    if (page) {
      setMeta(
        'link[rel="canonical"]',
        () => Object.assign(document.createElement("link"), { rel: "canonical" }),
        pageCanonical(page),
      );
    } else if (link) {
      link.remove();
    }
  }, [pathname]);
}
