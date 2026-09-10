import { Link } from "react-router-dom";
import SiteHeader from "../../components/layout/SiteHeader.jsx";
import Footer from "../../components/layout/Footer.jsx";
import { serviceById } from "../../data/services.js";
import styles from "./ServicePage.module.css";

/**
 * Service page 5 of 6 — יום האירוע. Checklist 87.
 *
 * Covers the door (EntranceScreen), the greeter link, the printed cards
 * (NameTagsScreen) and the three seating-screen printouts.
 *
 * ── Verified before writing. What is NOT claimed, and why ───────────────────
 *   • ARRIVALS DO NOT SYNC LIVE TO THE HOST'S DEVICE. The greeter's phone
 *     re-reads every 25 seconds; the owner's screen does not poll or subscribe
 *     at all and only refreshes on load. So the page says the door phone stays
 *     in step with a second greeter, and that the host sees the count when they
 *     open their own screen — never "watch it live from your table".
 *   • TWO GREETERS ON THE SAME ROW inside one 25s window: last write wins the
 *     whole seat array, so one tick can be lost. Different rows merge cleanly.
 *     The page claims the second, not the first.
 *   • QR SCANNING IS CHROME/EDGE/ANDROID ONLY. `isScanSupported()` gates the
 *     button on `"BarcodeDetector" in window`, so on an iPhone the button is
 *     not there at all — and an iPhone is the majority phone at an Israeli
 *     wedding. Named plainly, with the name search as the answer, which is what
 *     the product's own error string says too.
 *   • A SCAN MARKS THE WHOLE ROW, even though the code identifies one person.
 *   • THE GREETER LINK NEEDS A CONNECTION. Both its reads and its writes are
 *     Supabase RPCs with no retry queue: a failed write is discarded and
 *     re-fetched. The landing page's "עובד גם בלי רשת" is true of the HOST's
 *     own device and not of the phone at the door — recorded in WORKPLAN, and
 *     this page does not repeat it.
 *   • NO GIFT FIELD AT THE DOOR, deliberately. `giftAmount` is still read by
 *     the Excel gift report and written by nothing, so that sheet totals ₪0 on
 *     every real event. Not advertised; recorded instead.
 *   • There is no record of WHO marked an arrival.
 *   • Personal per-guest QR cards reach five guests in practice (page 2's
 *     finding), so the scan is described as a bonus, not the main route in.
 */

const SERVICE = serviceById("day");

const DOOR = [
  { line: "מאה ועשרים איש בכניסה.", tail: "בבת אחת. כולם." },
  { line: "\"באיזה שולחן אנחנו?\"", tail: "והדף מודפס. אצל מישהו." },
  { line: "דודה שהגיעה בלי לאשר.", tail: "עם שניים." },
  { line: "וכמה בעצם נכנסו עד עכשיו?", tail: "אף אחד לא יודע." },
];

/* Every row verified in EntranceScreen.jsx / arrival.js. */
const AT_THE_DOOR = [
  /* The phone half is OWNER-ONLY: the hostess RPC never returns phones, so on
     the greeter's link a phone search matches nothing, and the placeholder
     there says "שם האורח או שם מלווה". Split rather than blurred. */
  { title: "מחפשים בשם — גם של המלווה", body: "לא זוכרים על שם מי הוזמנו? החיפוש עובר גם על שמות המלווים, ואומר דרך מי נמצא. במכשיר שלכם אפשר לחפש גם לפי טלפון." },
  { title: "רואים מיד לאיזה שולחן", body: "השם, כמה מקומות, ומספר השולחן. אם מישהו עוד לא שובץ — כתוב גם את זה, במקום להמציא." },
  { title: "הגיעו שלושה מתוך חמישה", body: "אפשר לסמן משפחה שלמה בלחיצה, או לפתוח ולסמן בדיוק מי הגיע — שם-שם. הסימון הוא מתג: לחיצה נוספת מבטלת." },
  { title: "שולחן שלם בבת אחת", body: "בתצוגה לפי שולחן אפשר לסמן את כל היושבים בו יחד — נוח כשמגיעה חבורה שלמה." },
  { title: "מונה שסופר אנשים, לא שורות", body: "‏\"47 מתוך 96 אורחים\" — לפי מקומות, כי משפחה של חמישה היא חמישה אנשים בדלת. ומי שסירב לא נספר בכלל." },
  /* Owner-only — `canManage = !isToken`. The greeter cannot add anyone. */
  { title: "מי שהגיע בלי לאשר", body: "מוסיפים אותו בו במקום, והמערכת מציעה שולחנות שבאמת יש בהם מקום פנוי עכשיו — לפי הקיבולת פחות מי שכבר משובץ. זה מהמכשיר שלכם; הדיילת לא מוסיפה אורחים." },
];

/* Verified against the hostess RPCs and 20260811000000_entrance_scoped_writes. */
const GREETER = [
  { title: "בלי חשבון ובלי סיסמה", body: "הדיילת פותחת קישור בטלפון שלה. זה הכל." },
  { title: "היא רואה שמות — לא טלפונים", body: "הקישור מחזיר שם, כמה מקומות ולאיזה שולחן. מספרי טלפון, מתנות, צד וקבוצה פשוט לא נשלחים אליו." },
  { title: "והיא לא יכולה לשנות כלום אחר", body: "לא להוסיף אורח, לא להזיז מישהו בין שולחנות, לא למחוק. סימון הגעה בלבד — והמגבלה נאכפת בשרת, לא רק במסך." },
  { title: "ואתם סוגרים אותו מתי שתרצו", body: "מתג אחד הופך את הקישור לצפייה בלבד. ואם חוששים שהוא הסתובב — מחליפים אותו, והקודם מפסיק לעבוד." },
];

/* Verified against NameTagsScreen.jsx and its print CSS. */
const PRINTS = [
  { title: "כרטיס שולחן שעומד לבד", body: "מודפס כפול ומתקפל על הקו — עומד על השולחן וקריא משני הצדדים. המספר גדול בכוונה: הוא צריך להיקרא מקצה אולם חשוך." },
  { title: "כרטיס מקום לכל אורח", body: "אחד לכל מושב, לא לכל הזמנה — כולל מלווים, כך שגם \"יעל\" מקבלת כרטיס משלה ולא \"דודה רחל +1\"." },
  /* SIZES in NameTagsScreen.jsx: table 2, card 8, tag 12, small 16. The first
     draft put "8, 12, 16" on the tag+sticker row, where 8 belongs to the place
     card above it. */
  { title: "תג שם ומדבקה", body: "לענידה או להדבקה, נפוץ באירועים עסקיים — שנים-עשר תגים או שש-עשרה מדבקות בעמוד. כרטיס מקום יוצא שמונה בעמוד, וכרטיס שולחן שניים." },
  { title: "דף לצוות האולם", body: "גרסה צפופה, שמות בלבד, שלוש עמודות — מה שהמלצרים צריכים ולא יותר. ולצידה גרסה מלאה עם צד, קבוצה ומלווים בשבילכם." },
];

export default function EventDayServiceScreen({ user = null }) {
  return (
    <div className={styles.root}>
      <SiteHeader user={user} active={SERVICE.id} />

      {/* ── The promise ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>יום האירוע</p>
          <h1 className={styles.h1}>
            בדלת אין זמן לחפש.<br />
            <span className={styles.h1Soft}>שם, שולחן, הלאה.</span>
          </h1>
          <p className={styles.lead}>
            {/* Not "you see it live": the greeter's phone re-reads every 25s,
                and the host's own screen does not poll at all — it shows the
                count when they open it. */}
            מי שעומד בכניסה מקליד שם ומקבל מספר שולחן. הוא מסמן מי נכנס ורואה
            כמה כבר בפנים, ואתם פותחים את המסך שלכם ורואים את אותו מספר.
          </p>
          <div className={styles.heroActions}>
            <Link to="/signup" className={styles.cta}>נסו בחינם ←</Link>
            <a href="#door" className={styles.ghost}>איך זה עובד בכניסה</a>
          </div>
          <p className={styles.heroNote}>
            כולל כרטיסי שולחן להדפסה ודף לצוות האולם.
          </p>
        </div>
      </section>

      {/* ── Recognition ── */}
      <section className={styles.friction}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>עשרים הדקות הכי עמוסות בערב</h2>
          <ul className={styles.frictionList}>
            {DOOR.map(d => (
              <li key={d.line} className={styles.frictionItem}>
                <span className={styles.frictionLine}>{d.line}</span>
                <span className={styles.frictionTail}>{d.tail}</span>
              </li>
            ))}
          </ul>
          <p className={styles.frictionKicker}>
            רשימה מודפסת עובדת בדיוק עד הרגע שבו שני אנשים צריכים אותה, או שמישהו
            הגיע ולא נמצא עליה. ואז מתחיל חיפוש, והתור מתארך, וזה נראה בדיוק כמו
            שזה נשמע.
          </p>
        </div>
      </section>

      {/* ── The door ── */}
      <section className={styles.proof} id="door">
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>עמדת כניסה בטלפון</h2>
          <p className={styles.proofSub}>
            מסך כהה, שדה חיפוש אחד, וכפתור אחד גדול לכל אורח. בנוי לאולם חשוך
            וליד אחת.
          </p>

          <figure className={styles.shotFigure}>
            <img
              className={styles.shot} src="/shots/checkin.jpg"
              alt="עמדת הכניסה — מונה של כמה אורחים כבר נכנסו מתוך הסך הכל, חיפוש לפי שם או לפי שולחן, וקישור לדיילת"
              width="2400" height="1520" loading="lazy"
            />
          </figure>

          <div className={styles.depthGrid}>
            {AT_THE_DOOR.map(d => (
              <div key={d.title} className={styles.depthCard}>
                <h3 className={styles.depthTitle}>{d.title}</h3>
                <p className={styles.depthBody}>{d.body}</p>
              </div>
            ))}
          </div>

          {/* Named rather than buried: the scan button does not exist on an
              iPhone, and an iPhone is the phone at the door. */}
          <p className={styles.frictionKicker}>
            יש גם סריקת קוד מההזמנה, ושווה לדעת את המגבלה מראש: היא עובדת בכרום
            ובאנדרואיד ולא בספארי, כלומר לא באייפון. החיפוש בשם עובד בכל מכשיר,
            והוא הדרך המרכזית — הסריקה היא קיצור דרך למי שיש לו אותה.
          </p>
        </div>
      </section>

      {/* ── The greeter link ── */}
      <section className={styles.how}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>הדיילת מקבלת קישור, לא את החשבון שלכם</h2>
          <p className={styles.howSub}>
            זה נשמע כמו פרט טכני, וזה לא: החשבון שלכם הוא גם רשימת הטלפונים של
            כל המוזמנים, גם היכולת לערוך את הרשימה, וגם למחוק את האירוע.
          </p>
          <div className={styles.depthGrid}>
            {GREETER.map(g => (
              <div key={g.title} className={styles.depthCard}>
                <h3 className={styles.depthTitle}>{g.title}</h3>
                <p className={styles.depthBody}>{g.body}</p>
              </div>
            ))}
          </div>
          {/* Both halves are true and both are worth saying. */}
          <p className={styles.frictionKicker}>
            שקוף מראש: הקישור לדיילת עובד מול הרשת. באולם עם קליטה גרועה שווה
            לבדוק אותה מראש — ולהחזיק דף מודפס בצד, כמו שממילא עושים.
          </p>
        </div>
      </section>

      {/* ── Prints ── */}
      <section className={styles.depth}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>ומה שיושב על השולחנות</h2>

          <article className={[styles.step, styles.stepFlip].join(" ")}>
            <div className={styles.stepText}>
              <span className={styles.stepNum}>הדפסה</span>
              <h3 className={styles.h3}>ישר מהדפדפן, בלי תוכנה</h3>
              <p className={styles.stepBody}>
                בוחרים גודל, בוחרים למי, ולוחצים הדפסה. המערכת אומרת מראש כמה
                כרטיסים יצאו וכמה דפים זה — לפני שהמדפסת מתחילה.
              </p>
            </div>
            <figure className={styles.stepFigure}>
              <img
                className={styles.shot} src="/shots/nametags.jpg"
                alt="מסך כרטיסי השולחן ותגי השם — ארבעה גדלים לבחירה, בחירת קהל, ומונה של כמה כרטיסים וכמה דפים יודפסו"
                width="2400" height="1520" loading="lazy"
              />
            </figure>
          </article>

          <div className={styles.depthGrid}>
            {PRINTS.map(p => (
              <div key={p.title} className={styles.depthCard}>
                <h3 className={styles.depthTitle}>{p.title}</h3>
                <p className={styles.depthBody}>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Close ── */}
      <section className={styles.close}>
        <div className={styles.closeInner}>
          <span className={styles.closeMark} aria-hidden="true">✦</span>
          <h2 className={styles.closeTitle}>שהערב יתחיל בזמן</h2>
          <p className={styles.closeSub}>
            הכל כבר במערכת מהשלבים הקודמים. ביום האירוע נשאר רק לפתוח את הקישור
            ולתת אותו למי שעומד בדלת.
          </p>
          <Link to="/signup" className={styles.closeCta}>התחילו חינם ←</Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
