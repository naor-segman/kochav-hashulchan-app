import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SiteHeader from "../components/layout/SiteHeader.jsx";
import Footer from "../components/layout/Footer.jsx";
import { SAMPLE_TOKEN } from "../data/sampleEvent.js";
import styles from "./SampleInvitationScreen.module.css";

/* "צפו בהזמנה לדוגמה" — its own page, not a jump down the home page (owner,
 * 6.10: "אהבתי בדיגינט… עמוד נחיתה נפרד… ממש הראה לי איך ההזמנה נראית וממש
 * מאפשר לעבוד איתה").
 *
 * The phone holds the REAL guest page — /invitation/sample, the same screen a
 * guest opens from WhatsApp — answered from data/sampleEvent.js instead of the
 * database. It is for looking (owner, 8.10): the RSVP, gift and album forms
 * are shown frozen, and a link out of the sample does nothing
 * (components/guest/SampleDemo.jsx). Once the visitor has gone somewhere
 * inside the phone, a button beside it brings the invitation back.
 *
 * The page inside is laid out for a phone (390px). The phone on this page is
 * narrower, so the frame is drawn at 390 and scaled down to the screen — the
 * page is seen as a guest sees it, not squeezed into a column it was never
 * designed for. */
const GUEST_W = 390;

const TRY = [
  "ההזמנה עצמה, עם ספירה לאחור והוספה ליומן",
  "אתר האירוע: לו״ז, ניווט, הסעות ושאלות נפוצות",
  "אישור ההגעה ומסך המתנה והברכות",
];

export default function SampleInvitationScreen({ user = null }) {
  const screenRef = useRef(null);
  const frameRef = useRef(null);
  const [away, setAway] = useState(false);
  const [scale, setScale] = useState(0.7);
  useEffect(() => {
    const el = screenRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / GUEST_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const src = `/invitation/${SAMPLE_TOKEN}`;

  // The pages inside move with the router (pushState), which fires no load
  // event — so the frame's path is read on a short interval instead.
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const path = frameRef.current?.contentWindow?.location.pathname;
        if (path) setAway(path !== src);
      } catch { /* same origin; nothing to do if it is not loaded yet */ }
    }, 400);
    return () => clearInterval(id);
  }, [src]);
  const backToInvitation = () => {
    // replace(), not assign(): the parent page's Back button stays the parent's.
    frameRef.current?.contentWindow?.location.replace(src);
    setAway(false);
  };

  return (
    <div className={styles.root}>
      <SiteHeader user={user} active="sample" />
      <main id="main" tabIndex={-1} className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.inner}>
            <div className={styles.text}>
              <p className={styles.eyebrow}>הזמנה לדוגמה</p>
              <h1 className={styles.title}>ככה האורחים שלכם יקבלו את ההזמנה</h1>
              <p className={styles.lead}>
                זה בדיוק מה שהאורחים יפתחו מהוואטסאפ. אפשר לדפדף בתוך הטלפון ולראות:
              </p>
              <ul className={styles.tryList}>
                {TRY.map(t => <li key={t}><span aria-hidden="true">✓</span>{t}</li>)}
              </ul>
              <p className={styles.note}>זו דוגמה לצפייה — אישור ההגעה והמתנה מוצגים, אבל אי אפשר לשלוח אותם.</p>
              <div className={styles.actions}>
                <Link to="/app" className={styles.btnPrimary}>צרו הזמנה לאירוע שלכם ←</Link>
                <a href={src} className={styles.btnOutline} target="_blank" rel="noopener">פתחו במסך מלא</a>
              </div>
            </div>

            <div className={styles.deviceCol}>
              <div className={styles.device} aria-label="ההזמנה לדוגמה, בתוך טלפון">
                <span className={styles.island} aria-hidden="true" />
                <div className={styles.screen} ref={screenRef}>
                  <iframe
                    ref={frameRef}
                    className={styles.frame}
                    src={src}
                    title="הזמנה לדוגמה — החתונה של נועה וטל"
                    style={{ width: GUEST_W, height: `${100 / scale}%`, transform: `scale(${scale})` }}
                  />
                </div>
              </div>
              {away && (
                <button type="button" className={styles.backBtn} onClick={backToInvitation}>
                  חזרה להזמנה
                </button>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
