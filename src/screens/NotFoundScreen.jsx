import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { NOT_FOUND_TITLE } from "../data/seo.js";
import styles from "./NotFoundScreen.module.css";

/* The page's one <main> (38a) — except inside an event, where it renders in
   Shell's <main> and a second one would be two landmarks of the same kind.
   EventRoutes passes `landmark={false}` for that case.

   `hasApp`: whether there is a dashboard to go back to. Every 404 offered
   "חזרה לדשבורד" — including to a visitor who followed a mistyped link from
   WhatsApp and has never used the product, whom /app greets with an empty
   dashboard (audit 3.10, P2-9). Inside an event there always is one; at the
   top level App passes it (signed in, or events in this browser). */
export default function NotFoundScreen({ landmark = true, hasApp = !landmark }) {
  const Root = landmark ? "main" : "div";

  // The tab says so too (audit 3.10, P2-6) — it read the site's home title.
  // Keyed on the path: one 404 to another keeps this screen mounted, and the
  // route default (PageMeta, an earlier sibling) rewrites the title each time.
  const { pathname } = useLocation();
  useEffect(() => { document.title = NOT_FOUND_TITLE; }, [pathname]);

  return (
    <Root className={styles.root}>
      <span className={styles.star} aria-hidden="true">✦</span>
      <h1 className={styles.title}>הדף לא נמצא</h1>
      <p className={styles.text}>הכתובת שביקשתם לא קיימת.</p>
      {hasApp ? (
        <Link to="/app" className={styles.action}>חזרה לאירועים שלי</Link>
      ) : (
        // /home, not /: the same page, and / would bounce a signed-in visitor
        // to /app (Footer.jsx gives the same reason).
        <Link to="/home" className={styles.action}>לדף הבית</Link>
      )}
    </Root>
  );
}
