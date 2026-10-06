import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import SiteHeader from "../components/layout/SiteHeader.jsx";
import Footer from "../components/layout/Footer.jsx";
import SectionMark from "../components/ui/SectionMark.jsx";
import LaptopFrame from "../components/marketing/LaptopFrame.jsx";
import CelebrationArt from "../components/marketing/CelebrationArt.jsx";
import { ChatScene, DoorScene } from "../components/marketing/Scenes.jsx";
import { useHashScroll } from "../hooks/useHashScroll.js";
import { useStillOnly } from "../hooks/useMediaQuery.js";
import { COMPANY } from "../data/company.js";
import {
  FREE_PACKAGE, HUMAN_SERVICES, PAID_FROM, formatShekel, PRICING_RULES,
} from "../data/pricingCurve.js";
import styles from "./LandingScreen.module.css";

/**
 * The home page, rebuilt for 136 (owner 5.10) in the order he approved after
 * walking through DIGINET's home page section by section:
 *   hero → everything we do → three feelings (on a phone) → the product moving
 *   → what are you celebrating → people at the door → price → once more.
 *
 * The rule over all of it, in his words: speak to the emotion, the need and
 * the experience — "מאד מאד מאד חשוב". Square corners, our colours, nothing
 * that pops or floats. No numbers we have not earned, no press we do not have.
 * Reviews come in when there are real ones (WORKPLAN 141).
 */

const HERO_MEDIA = { video: "/hero/hero.mp4", poster: "/hero/hero.jpg", posterMobile: "/hero/hero-portrait.jpg" };

/* Every card is something that exists in the product today, in the order of
   the host's journey (owner, 6.10: "כרונולוגי ולא מעורבב"). */
const EVERYTHING = [
  { mark: "budget",  t: "תקציב וספקים",      d: "כמה יצא, וכמה עוד נשאר", to: "/services/planning" },
  { mark: "guests",  t: "רשימת אורחים",      d: "מדביקים מוואטסאפ או מאקסל", to: "/services/rsvp" },
  { mark: "site",    t: "הזמנה ואתר",        d: "הזמנה דיגיטלית, Waze והסעות", to: "/services/event-site" },
  { mark: "messages", t: "הודעות בוואטסאפ",  d: "הזמנה, תזכורת ותודה — מוכנות", to: "/services/rsvp" },
  { mark: "rsvp",    t: "אישורי הגעה",       d: "האורחים עונים בלי להירשם", to: "/services/rsvp" },
  { mark: "constraints", t: "מי ליד מי",     d: "מי חייב יחד, ומי בשום אופן לא", to: "/services/seating" },
  { mark: "seating", t: "הושבה אוטומטית",   d: "כל האולם מסודר בלחיצה", to: "/services/seating" },
  { mark: "checkin", t: "יום האירוע",        d: "עמדת כניסה וכרטיסי שם", to: "/services/event-day" },
];

const FEELINGS = [
  {
    // Owner, 6.10: "הלב של המוצר" was odd; the title was weak; the points had
    // to show how remarkable it is that the seating is fully automatic.
    eyebrow: "סידורי הושבה",
    title: "ההושבה מסתדרת לבד.",
    body: "מכניסים את המוזמנים, מסמנים מי חייב לשבת יחד ומי לא — ולוחצים. תוך שניות כל האורחים יושבים: לפי הצדדים, הקבוצות והקיבולת של כל שולחן, ושום משפחה לא מתפצלת.",
    points: [
      "לחיצה אחת — וכל האולם מסודר, גם במאות אורחים",
      "מי שחייבים יחד יושבים יחד. מי שאסור — רחוק",
      "ביטול ברגע האחרון? לוחצים שוב, והכל מסתדר מחדש",
      "מפת אולם אמיתית: רואים מי יושב איפה, ומדפיסים לאולם",
    ],
    visual: "laptop",
  },
  {
    eyebrow: "אישורי הגעה",
    title: "יודעים מי מגיע, בלי לרדוף אחרי אף אחד",
    body: "שולחים קישור אחד בוואטסאפ. האורחים עונים בלי הרשמה ובלי אפליקציה, והתשובה נכנסת לרשימה שלכם לבד — כמה מגיעים, איזו מנה ומי צריך הסעה.",
    points: ["מי אישר, מי סירב ומי עוד שותק — במבט אחד", "ההורים ממלאים את הצד שלהם בטבלה השיתופית", "הרשימה יורדת לאקסל בכל רגע"],
    visual: "chat",
  },
  {
    // Owner, 6.10: the wording here was unclear and sold nothing. Rewritten
    // around what the host feels on the night, not around the screen.
    eyebrow: "ביום האירוע",
    title: "האורחים נכנסים. אתם חוגגים.",
    body: "בכניסה מקלידים שם ורואים מיד את מספר השולחן — וכל אורח הולך ישר למקום שלו. אתם לא עומדים בדלת ולא מחפשים רשימות מודפסות, ויודעים בכל רגע כמה כבר הגיעו.",
    points: [
      "כל אורח מגיע ישר לשולחן שלו",
      "רואים בזמן אמת כמה כבר כאן",
      "כרטיסי שולחן ושם מודפסים, מוכנים לכניסה",
    ],
    visual: "door",
  },
];

/* The three steps (section 4). Screens from the product, as captured. */
const STEPS = [
  { t: "מכניסים את המוזמנים", d: "מקלידים, מדביקים רשימה מוואטסאפ או מאקסל, או שולחים לבני המשפחה קישור למלא בעצמם.",
    img: "/shots/guests.jpg", alt: "רשימת המוזמנים במחשב — שמות, צדדים, קבוצות ומספר מקומות" },
  { t: "שולחים הזמנה בוואטסאפ", d: "ההזמנה יוצאת לכל אורח עם קישור אישי, והתשובות נכנסות לרשימה לבד.",
    img: "/shots/messages.jpg", alt: "מסך ההודעות — הזמנה, תזכורת ותודה, מוכנות לשליחה בוואטסאפ" },
  { t: "לוחצים — וההושבה מוכנה", d: "כל האורחים משובצים לפי האילוצים שלכם. מזיזים מה שרוצים, ומדפיסים לאולם.",
    img: "/shots/seating.jpg", alt: "סידור ההושבה במחשב — כל האורחים משובצים בשולחנות" },
];

/* "Is it for me?" — the owner on DIGINET's event-type pages: it speaks to a
   need. Each type already has its own task checklist inside (taskTemplates). */
const CELEBRATIONS = [
  { k: "wedding",  t: "חתונה",        d: "התארסתם? מזל טוב. מכאן לוקחים את הרשימה, האישורים והשולחנות." },
  { k: "mitzvah",  t: "בר ובת מצווה", d: "חברים מהכיתה, דודים מכל הארץ — כולם במקום הנכון." },
  { k: "brit",     t: "ברית ובריתה",  d: "הכל קורה בתוך שבוע. מקימים אירוע בכמה דקות." },
  { k: "henna",    t: "חינה",         d: "רשימה משותפת לשתי המשפחות, ואישורים בוואטסאפ." },
  { k: "business", t: "אירוע עסקי",   d: "מאה עובדים או אלף — רשימה, אישורים וכניסה מסודרת." },
  { k: "birthday", t: "יום הולדת",    d: "גם מסיבה קטנה מגיעה לה רשימה שלא הולכת לאיבוד." },
];

const quoteHref = () => `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent("היי, אשמח להצעת מחיר לשירות באירוע")}`;

export default function LandingScreen({ user = null }) {
  useHashScroll();
  const stillOnly = useStillOnly();
  const heroRef = useRef(null);
  const [heroPaused, setHeroPaused] = useState(false);
  const toggleHero = () => {
    const v = heroRef.current;
    if (!v) return;
    /* Follow the button's own state, not v.paused: a browser that has not
       started the loop yet (or cannot decode it) reports paused, and the
       button would then "play" on the press that was meant to stop it. */
    if (heroPaused) { v.play()?.catch?.(() => {}); setHeroPaused(false); }
    else { v.pause(); setHeroPaused(true); }
  };

  return (
    <div className={styles.root}>
      <SiteHeader user={user} />
      <main id="main" tabIndex={-1} className={styles.main}>

        {/* 1 · Hero — who we are, what we do, and two free ways in. */}
        <section className={styles.hero}>
          <div className={styles.heroMedia} aria-hidden="true">
            {HERO_MEDIA.video && !stillOnly ? (
              <video ref={heroRef} className={styles.heroLayer} src={HERO_MEDIA.video} poster={HERO_MEDIA.poster} autoPlay muted loop playsInline preload="metadata" />
            ) : (
              <img className={styles.heroLayer} src={HERO_MEDIA.posterMobile} alt="" />
            )}
            <span className={styles.heroScrim} />
          </div>
          {/* A 16s loop behind the title needs a way to stop it (WCAG 2.2.2). */}
          {HERO_MEDIA.video && !stillOnly && (
            <button type="button" className={styles.heroPause} onClick={toggleHero}
                    aria-label={heroPaused ? "הפעלת סרטון הרקע" : "עצירת סרטון הרקע"}>
              <span aria-hidden="true">{heroPaused ? "▶" : "❚❚"}</span>
            </button>
          )}
          <div className={styles.heroInner}>
            {/* Owner, 6.10: the site does planning and management end to end, not
                "הושבה ואישורי הגעה"; the title has to be exact — it is the
                first thing anyone reads; and the hero is seen whole, with no
                scrolling. The second button opens a page of its own (the
                sample invitation), not a jump down this one. */}
            <p className={styles.heroEyebrow}>תכנון וניהול אירועים</p>
            <h1 className={styles.heroTitle}>מתכננים אירוע?<br /><span>מכאן הכל פשוט.</span></h1>
            <p className={styles.heroSub}>
              מערכת אחת לתכנון וניהול האירוע: הזמנה דיגיטלית, אישורי הגעה בוואטסאפ,
              הושבה אוטומטית ועמדת כניסה. הכל מתעדכן לבד, ואתם נהנים מהדרך.
            </p>
            <div className={styles.heroActions}>
              <Link to="/app" className={styles.btnPrimary}>התחילו חינם ←</Link>
              <Link to="/sample-invitation" className={styles.btnGhostDark}>צפו בהזמנה לדוגמה</Link>
            </div>
            <p className={styles.heroFree}>מתחילים בחינם · בלי כרטיס אשראי · בלי התחייבות</p>
          </div>
        </section>

        {/* 2 · Everything, before any single service (owner: one service right
            after the hero pins the visitor to it). */}
        <section className={styles.everything} id="features">
          <div className={styles.inner}>
            <div className={styles.head}>
              {/* Owner, 6.10: about the person, not the event. His wording. */}
              <h2 className={styles.title}>כל מה שתצטרכו בדרך לאירוע.</h2>
              <p className={styles.sub}>וזה רק חלק ממה שמחכה לכם בפנים.</p>
            </div>
            <div className={styles.grid}>
              {EVERYTHING.map(e => (
                <Link key={e.t} to={e.to} className={styles.tile}>
                  <SectionMark name={e.mark} size={34} className={styles.tileMark} />
                  <h3 className={styles.tileTitle}>{e.t}</h3>
                  <p className={styles.tileText}>{e.d}</p>
                </Link>
              ))}
            </div>
            <div className={styles.center}>
              <Link to="/app" className={styles.btnPrimary}>התחילו חינם ←</Link>
            </div>
          </div>
        </section>

        {/* 3 · Three feelings, each on a phone. */}
        {FEELINGS.map((f, i) => (
          <section key={f.title} className={[styles.feeling, i % 2 ? styles.feelingAlt : ""].join(" ")}>
            <div className={[styles.inner, styles.feelingGrid].join(" ")}>
              <div className={styles.feelingText}>
                <p className={styles.eyebrow}>{f.eyebrow}</p>
                <h2 className={styles.title}>{f.title}</h2>
                <p className={styles.body}>{f.body}</p>
                <ul className={styles.points}>
                  {f.points.map(pt => <li key={pt}><span aria-hidden="true">✓</span>{pt}</li>)}
                </ul>
              </div>
              <div className={styles.visual}>
                {/* The computer alone here; the phone belongs to the RSVP part
                    below, where the guest holds it (owner, 6.10). */}
                {f.visual === "laptop" && (
                  <LaptopFrame src="/shots/seating.jpg" alt="מסך סידור ההושבה במחשב — 56 רשומות שובצו ב-14 שולחנות, אפס הפרות" className={styles.duoLaptop} />
                )}
                {f.visual === "chat" && <ChatScene />}
                {f.visual === "door" && <DoorScene />}
              </div>
            </div>
          </section>
        ))}

        {/* 4 · How it goes, in three steps (owner, 6.10: the "לחיצה אחת" video
            did not say what was happening or why). One picture per step, from
            the product, and one plain sentence under it. */}
        <section className={styles.watch} id="how">
          <div className={styles.inner}>
            <div className={styles.head}>
              <p className={styles.eyebrow}>איך זה עובד</p>
              <h2 className={styles.title}>מהרשימה ועד השולחן, בשלושה צעדים</h2>
            </div>
            <ol className={styles.steps}>
              {STEPS.map((st, i) => (
                <li key={st.t} className={styles.step}>
                  <span className={styles.stepNum} aria-hidden="true">{i + 1}</span>
                  <h3 className={styles.stepTitle}>{st.t}</h3>
                  <p className={styles.stepText}>{st.d}</p>
                  <img className={styles.stepShot} src={st.img} alt={st.alt} loading="lazy" width="2400" height="1520" />
                </li>
              ))}
            </ol>
            <div className={styles.center}>
              <Link to="/app" className={styles.btnPrimary}>התחילו חינם ←</Link>
            </div>
          </div>
        </section>

        {/* 5 · What are you celebrating? */}
        <section className={styles.celebrate}>
          <div className={styles.inner}>
            <div className={styles.head}>
              <h2 className={styles.title}>אז מה אתם חוגגים?</h2>
              <p className={styles.sub}>לכל סוג אירוע מחכה בפנים רשימת משימות מוכנה.</p>
            </div>
            <div className={styles.celebrateGrid}>
              {CELEBRATIONS.map(c => (
                <Link key={c.t} to="/app" className={styles.celebrateCard}>
                  <span className={styles.celebrateArt}><CelebrationArt kind={c.k} /></span>
                  <span className={styles.celebrateName}>{c.t}</span>
                  <span className={styles.celebrateText}>{c.d}</span>
                  <span className={styles.celebrateGo}>מתחילים ←</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* 6 · People at the event — by quote, never a fixed price. */}
        <section className={styles.human} id="human">
          <div className={[styles.inner, styles.humanGrid].join(" ")}>
            <div className={styles.humanPhoto}>
              <img src="/hero/hero-portrait.jpg" alt="חופה מוכנה על חוף הים, כיסאות לבנים ופנסים לאורך המעבר" loading="lazy" />
            </div>
            <div>
              <p className={styles.eyebrow}>אנחנו שם איתכם</p>
              <h2 className={styles.title}>רוצים שמישהו שלנו יעמוד בדלת?</h2>
              <p className={styles.body}>
                כל השאר אתם עושים לבד, מהטלפון. אבל בערב עצמו — מנהל הושבה, דיילות או
                ניהול האירוע כולו. אנשים שלנו, באירוע שלכם, במחיר לפי האולם, התאריך וכמות האורחים.
              </p>
              <div className={styles.humanList}>
                {HUMAN_SERVICES.map(h => (
                  <div key={h.title} className={styles.humanItem}>
                    <SectionMark name={h.mark} size={26} />
                    <div><h3>{h.title}</h3><p>{h.body}</p></div>
                  </div>
                ))}
              </div>
              <a href={quoteHref()} className={styles.btnOutline} target="_blank" rel="noreferrer">בקשת הצעת מחיר בוואטסאפ ←</a>
            </div>
          </div>
        </section>

        {/* 7 · Price — free first, then "from". The full price lives on the
            pricing page, at the visitor's own guest count. */}
        <section className={styles.price}>
          <div className={styles.inner}>
            <div className={styles.head}>
              <h2 className={styles.title}>מתחילים בחינם. משדרגים כשרוצים.</h2>
              <p className={styles.sub}>{PRICING_RULES.join(" · ")}</p>
            </div>
            <div className={styles.priceGrid}>
              <article className={styles.freeCard}>
                <p className={styles.eyebrow}>{FREE_PACKAGE.name}</p>
                <p className={styles.freeAmount}>{FREE_PACKAGE.price}</p>
                <p className={styles.body}>{FREE_PACKAGE.lead}</p>
                <ul className={styles.freeLines}>
                  {FREE_PACKAGE.lines.filter(l => l.ok).map(l => <li key={l.t}><span aria-hidden="true">✓</span>{l.t}</li>)}
                </ul>
                <Link to="/app" className={styles.btnPrimaryBlock}>{FREE_PACKAGE.cta} ←</Link>
              </article>
              <article className={styles.paidCard}>
                <p className={styles.eyebrow}>כשתרצו שהכל יקרה לבד</p>
                <p className={styles.paidFrom}>חבילות החל מ-<span>{formatShekel(PAID_FROM)}</span></p>
                <p className={styles.body}>
                  וואטסאפ אוטומטי, הושבה בלי תקרה, מפת האולם ועמדת הכניסה —
                  ובחבילה המלאה גם שיחות טלפון למי שלא ענה. המחיר לפי מספר המוזמנים שלכם.
                </p>
                <Link to="/pricing" className={styles.btnOutlineBlock}>חשבו את המחיר שלכם ←</Link>
              </article>
            </div>
          </div>
        </section>

        {/* 8 · Reviews — WORKPLAN 141: only real ones, and only from three. */}

        {/* 9 · Once more. */}
        <section className={styles.close}>
          <div className={[styles.inner, styles.closeInner].join(" ")}>
            <h2 className={styles.closeTitle}>רוצים גם?</h2>
            <p className={styles.closeText}>האירוע הבא שלכם מתחיל כאן — בלי הרשמה, בלי כרטיס אשראי.</p>
            <Link to="/app" className={styles.btnLight}>התחילו חינם ←</Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
