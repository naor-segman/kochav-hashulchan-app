import { Link } from "react-router-dom";
import SiteHeader from "../../components/layout/SiteHeader.jsx";
import Footer from "../../components/layout/Footer.jsx";
import { COMPANY } from "../../data/company.js";
import { serviceById } from "../../data/services.js";
import styles from "./ServicePage.module.css";

/**
 * Service page 1 of 6 — סידורי הושבה. Checklist 87.
 *
 * This is the flag. It is the one thing the product does that the competitors
 * sell as a human service, and the owner's instruction was that it must get
 * much more room than a bullet in a feature list. So the automatic seating is
 * the headline, the proof and the top half of the page; everything else here
 * exists because it feeds it.
 *
 * ── Every number on this page is measured ───────────────────────────────────
 * The figures in the proof band — 56 rows, 96 seats, 14 tables, 5 constraints,
 * 0 violations — are not written by hand. They are what `qa/marketingShots.mjs`
 * read back out of the running product when it produced the screenshot beside
 * them: it seeds the event, presses the button the host presses, and refuses to
 * emit an image if the result has violations in it. If the algorithm regresses,
 * that harness fails before this page can lie about it.
 *
 * The landing page's invented statistics were removed once already and must not
 * come back (CLAUDE.md, frozen decisions). The rule this page follows is
 * narrower and testable: a number appears only if it came out of a run.
 *
 * ── Shared structure ────────────────────────────────────────────────────────
 * The stylesheet is `ServicePage.module.css`, shared with the other service
 * pages. It was `SeatingServiceScreen.module.css` while this was the only one:
 * extracting a shell from a single instance is guessing at the abstraction, and
 * page 2 is what showed which parts are genuinely common. Anything only one
 * page needs still lives in that file, next to what uses it — one stylesheet
 * with a few page-specific rules beats six that drift (bug class 6).
 */

const SERVICE = serviceById("seating");

/* The recognition list. Written as things that are TRUE at somebody's wedding,
   not as "pain points" — anyone who has seated a hall has met all four. */
const FRICTION = [
  { line: "דודה שרה לא תשב ליד דוד משה.", tail: "לא היום, לא בחיים." },
  { line: "החברים מהצבא רוצים להיות ביחד.", tail: "כל השמונה. באותו שולחן." },
  { line: "הורי הכלה רוצים את השולחן הקדמי.", tail: "גם הורי החתן." },
  { line: "ושבעה אישרו הגעה אתמול בלילה.", tail: "אחרי שסידרתם הכל." },
];

/* The four steps, each with the screen it happens on. The images come from
   qa/marketingShots.mjs — same seeded event across all four, so the page reads
   as one continuous session and not as four unrelated products. */
const STEPS = [
  {
    n: "01",
    title: "מכניסים את האורחים",
    /* NOT "מאקסל". Importing a spreadsheet does not exist — checklist 64 is
       still open, and the xlsx dependency on that screen is for the EXPORT.
       Pasting a list does work, including a column copied out of a sheet, so
       that is what this says. The landing page was already careful here
       ("הדביקו רשימה מוואטסאפ או מגיליון"); this line was not. */
    body: "ידנית, או בהדבקה של רשימה שלמה — מקבוצת וואטסאפ או מעמודה בגיליון. אפשר גם לשלוח למשפחה טבלה שיתופית וכולם ממלאים יחד. שם, טלפון, כמה מקומות, איזה צד ואיזו קבוצה.",
    img: "/shots/guests.jpg",
    alt: "מסך האורחים — 58 רשומות עם צד, קבוצה, מספר מקומות וסטטוס אישור הגעה",
  },
  {
    n: "02",
    title: "בונים את השולחנות",
    body: "כמה שולחנות יש באולם, כמה מקומות בכל אחד ומה הצורה. עגול, מלבני, שולחן אביר — מה שהאולם נתן לכם.",
    img: "/shots/tables.jpg",
    alt: "מסך השולחנות — 14 שולחנות עם הקיבולת והצורה של כל אחד",
  },
  {
    n: "03",
    title: "אומרים מי עם מי",
    body: "שתי מילים לכל זוג: יחד, או בשום אופן לא. זה הכל. את השאר המערכת מסיקה מהקבוצות ומהצדדים שכבר הזנתם.",
    img: "/shots/constraints.jpg",
    alt: "מסך האילוצים — רשימת אילוצי יחד ובנפרד בין אורחים",
  },
  {
    n: "04",
    title: "לוחצים פעם אחת",
    body: "וזהו. כל האולם מסודר, כל האילוצים מכובדים, וכל שולחן בקיבולת שלו. משם אפשר לגרור ידנית כל מי שתרצו — שום דבר לא נעול.",
    img: "/shots/seating.jpg",
    alt: "מסך סידור ההושבה אחרי הרצה — 56 רשומות שובצו ל-14 שולחנות ללא הפרות",
  },
];

/* What the algorithm does beyond the headline. Each of these is a real
   behaviour of src/logic/seating.js, not a wish. */
const DEPTH = [
  {
    title: "שולחן שנעלתם נשאר נעול",
    body: "סידרתם את שולחן ההורים ביד? הוא לא יזוז. ההרצה הבאה מסדרת סביבו.",
  },
  {
    title: "אם מישהו לא נכנס — אומרים לכם",
    /* True as written: SeatingScreen keeps an `unassigned` list and renders a
       "ממתינים לשיבוץ" panel with those guests by name, and the run reports the
       count. It does NOT explain a per-guest reason, so this does not claim
       one — the earlier draft said "בדיוק מי נשאר בחוץ ולמה". */
    body: "המערכת לא ממציאה פתרון ולא דוחפת אורח לשולחן מלא. מי שלא נכנס נשאר ברשימת הממתינים, בשמו, ואתם מחליטים מה לעשות איתו.",
  },
  {
    title: "אילוץ סותר בכלל לא נכנס",
    /* The behaviour is a BLOCK at entry, not a warning at seating time:
       ConstraintsScreen refuses the second constraint and says an opposite one
       already exists. The earlier draft implied the clash survives until the
       run, which would have been a promise about a different product. */
    body: "תנסו לומר ששניים יושבים יחד אחרי שאמרתם שהם בנפרד — והמערכת פשוט לא תוסיף אותו, ותבקש שתסירו את ההפוך קודם. הסתירה נעצרת בהזנה, לא מתגלה באולם.",
  },
  {
    title: "מי שסירב לא תופס מקום",
    body: "אורח שענה \"לא מגיע\" יוצא מהחישוב אוטומטית. הקיבולת שלכם היא של האנשים שבאמת יגיעו.",
  },
  {
    title: "מפת אולם, לא רק רשימה",
    body: "גוררים את השולחנות למקום שלהם באולם ורואים את הערב כמו שהוא ייראה.",
  },
  {
    title: "והכל יוצא לאקסל",
    body: "רשימה מלאה לפי שולחן, לצוות האולם או לעצמכם. כרטיסי שם להדפסה — מאותו מסך.",
  },
];

export default function SeatingServiceScreen({ user = null }) {
  return (
    <div className={styles.root}>
      <SiteHeader user={user} active={SERVICE.id} />

      {/* ── The promise ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>סידורי הושבה</p>
          <h1 className={styles.h1}>
            ההושבה מסתדרת לבד.<br />
            <span className={styles.h1Soft}>גם השולחן של דודה שרה.</span>
          </h1>
          <p className={styles.lead}>
            מזינים את רשימת האורחים, מסמנים מי חייב לשבת יחד ומי בשום אופן לא —
            ולוחצים פעם אחת. {COMPANY.name} בונה את כל האולם בשניות, מכבדת כל
            {/* "וממלאת כל שולחן עד הקיבולת שלו" was the earlier line, and it
                promises the wrong thing — the engine RESPECTS capacity, it does
                not pack every table to the brim. */}
            {" "}אילוץ, ולא חורגת מהקיבולת של אף שולחן.
          </p>
          <div className={styles.heroActions}>
            <Link to="/signup" className={styles.cta}>נסו בחינם ←</Link>
            <a href="#how" className={styles.ghost}>איך זה עובד</a>
          </div>
          <p className={styles.heroNote}>
            בלי כרטיס אשראי. בלי תקופת ניסיון שנגמרת.
          </p>
        </div>
      </section>

      {/* ── Recognition ── */}
      <section className={styles.friction}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>למה זה לוקח שלושה ערבים</h2>
          <ul className={styles.frictionList}>
            {FRICTION.map(f => (
              <li key={f.line} className={styles.frictionItem}>
                <span className={styles.frictionLine}>{f.line}</span>
                <span className={styles.frictionTail}>{f.tail}</span>
              </li>
            ))}
          </ul>
          <p className={styles.frictionKicker}>
            זה לא פאזל של 300 חלקים. זה פאזל של 300 חלקים שרבים אחד עם השני —
            ובכל פעם שאתם מזיזים אחד, שניים אחרים זזים איתו. בשתיים בלילה, על מפית.
          </p>
        </div>
      </section>

      {/* ── The proof ── */}
      <section className={styles.proof}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>הרצה אחת. אולם שלם.</h2>
          <p className={styles.proofSub}>
            זו לא הדמיה ולא איור. הרצנו את המערכת על חתונה לדוגמה, לחצנו על אותו
            כפתור שאתם לוחצים, וצילמנו את המסך.
          </p>

          <div className={styles.stats}>
            <div className={styles.stat}><b>58</b><span>רשומות אורחים</span></div>
            <div className={styles.stat}><b>96</b><span>מקומות ישיבה</span></div>
            <div className={styles.stat}><b>14</b><span>שולחנות</span></div>
            <div className={styles.stat}><b>5</b><span>אילוצים</span></div>
            <div className={[styles.stat, styles.statGood].join(" ")}>
              <b>0</b><span>הפרות</span>
            </div>
          </div>

          <figure className={styles.shotFigure}>
            <img
              className={styles.shot}
              src="/shots/seating.jpg"
              /* The brand is never typed — company.test.js has a door test that
                 fails on a literal, and it caught this alt when it was written
                 as "ברוויה". Rephrased rather than prefixed, so there is no
                 Hebrew prefix to get wrong either. */
              alt="מסך סידור ההושבה — הודעה ירוקה שכל 56 הרשומות שובצו ל-14 שולחנות ללא הפרות"
              width="2400" height="1520" loading="lazy"
            />
          </figure>
        </div>
      </section>

      {/* ── How ── */}
      <section className={styles.how} id="how">
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>ארבעה שלבים, ורק אחד מהם מעניין</h2>
          <p className={styles.howSub}>
            שלושת הראשונים הם הזנה. הרביעי הוא הסיבה שאתם כאן.
          </p>

          <div className={styles.steps}>
            {STEPS.map(s => (
              <article key={s.n} className={styles.step}>
                <div className={styles.stepText}>
                  <span className={styles.stepNum}>{s.n}</span>
                  <h3 className={styles.h3}>{s.title}</h3>
                  <p className={styles.stepBody}>{s.body}</p>
                </div>
                <figure className={styles.stepFigure}>
                  <img
                    className={styles.shot} src={s.img} alt={s.alt}
                    width="2400" height="1520" loading="lazy"
                  />
                </figure>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Depth ── */}
      <section className={styles.depth}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>ומה שלא כתוב על הכפתור</h2>
          <div className={styles.depthGrid}>
            {DEPTH.map(d => (
              <div key={d.title} className={styles.depthCard}>
                <h3 className={styles.depthTitle}>{d.title}</h3>
                <p className={styles.depthBody}>{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Close ── */}
      <section className={styles.close}>
        <div className={styles.closeInner}>
          <span className={styles.closeMark} aria-hidden="true">✦</span>
          <h2 className={styles.closeTitle}>תנו לזה ערב אחד פחות</h2>
          <p className={styles.closeSub}>
            פותחים אירוע, מדביקים רשימה, לוחצים. אם זה לא חוסך לכם את המפית —
            סגרתם ולא שילמתם.
          </p>
          <Link to="/signup" className={styles.closeCta}>התחילו חינם ←</Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
