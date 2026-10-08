import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import styles from "./SampleDemo.module.css";

/* The sample invitation (/sample-invitation) is for LOOKING (owner, 8.10):
 * "מסך המתנה נותן באמת למלא מתנה, זה אמור להיות דוגמא… כנ״ל באישורי הגעה…
 * יש אופציה ממש להיכנס דרך האייפון הזה למשתמש אמיתי, זה לא תקין".
 *
 * Two pieces, both inert for every real token:
 *   <DemoOnly demo what="…"> — on the sample, the controls inside are shown but
 *     frozen (a disabled <fieldset> disables every descendant control
 *     natively), under one line that says this is an example.
 *   <SampleLinkGuard /> — mounted once; while a sample guest page is open, a
 *     link that leads anywhere but another sample guest page does nothing:
 *     not the app, not signup, not Waze, not the privacy page. */

export const SAMPLE_GUEST_PATH = /^\/(invitation|invite|rsvp|gift|card|save-the-date|album)\/sample(\/[^/]*)?\/?$/;

export function DemoOnly({ demo, what, children }) {
  if (!demo) return children;
  return (
    <>
      <p className={styles.notice} role="note">
        זו הזמנה לדוגמה. כאן האורחים שלכם {what} — בדוגמה אי אפשר לשלוח.
      </p>
      <fieldset disabled className={styles.frozen}>{children}</fieldset>
    </>
  );
}

export function SampleLinkGuard() {
  const { pathname } = useLocation();
  const active = SAMPLE_GUEST_PATH.test(pathname);
  useEffect(() => {
    if (!active) return undefined;
    const onClick = (e) => {
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a) return;
      const url = new URL(a.getAttribute("href"), window.location.href);
      const stays = url.origin === window.location.origin && SAMPLE_GUEST_PATH.test(url.pathname)
        && (!a.target || a.target === "_self");
      if (stays) return;
      // Capture phase on document: runs before React Router's own handler.
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);
  return null;
}
