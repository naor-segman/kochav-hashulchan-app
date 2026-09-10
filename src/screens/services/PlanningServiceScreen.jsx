import { Link } from "react-router-dom";
import SiteHeader from "../../components/layout/SiteHeader.jsx";
import Footer from "../../components/layout/Footer.jsx";
import { serviceById } from "../../data/services.js";
import styles from "./ServicePage.module.css";

/**
 * Service page 3 of 6 — תכנון האירוע. Checklist 87.
 *
 * Covers three screens: לוח משימות, תכנון תקציב, ספקים.
 *
 * ── Audited before it was written ───────────────────────────────────────────
 * Nine things came back that look advertisable and are not. The ones that
 * shaped this copy:
 *
 *   • VENDORS DO NOT FLOW INTO THE BUDGET. vendorConstants.js says in a comment
 *     that the category ids mirror the budget's "so spend lines up without a
 *     mapping" — and no code path anywhere joins them. The ids do match; that
 *     is all. A vendor's ₪45,000 does not prefill a budget row, does not appear
 *     in a total, and does not warn about a mismatch. This is the single most
 *     tempting thing to claim on this page, so the page says the opposite out
 *     loud rather than leaving a buyer to assume it.
 *   • The vendor `payment` tag (לא שולם / מקדמה / שולם) is chosen by hand and
 *     is NOT derived from price/paid. A row can read שולם with ₪0 paid. Never
 *     described here as automatic.
 *   • TASKS HAVE NO REMINDERS, no notifications and no assignees. Said plainly
 *     — a host who assumes their phone will buzz has bought the wrong thing.
 *   • `doneAt` is written and never read, so there is no completion history.
 *   • The starter list is offered ONCE, on an empty board, and is unreachable
 *     after the first task exists. Described as a starting point, not a
 *     library you can dip into.
 *   • Seeded due dates VANISH for offsets already in the past, so "a schedule"
 *     is qualified: dates that have not passed yet.
 *   • The budget has no record of money actually received — "הכנסה צפויה" is
 *     the host's own per-guest estimate and the gift figure is a declaration.
 *     Neither is claimed as income here; that belongs to service page 6.
 *   • There is no tel: link anywhere in the app. WhatsApp only.
 *
 * The figures in the budget screenshot are a seeded example, not a claim, and
 * the page does not repeat them as statistics.
 */

const SERVICE = serviceById("planning");

const CHAOS = [
  { line: "האולם בוואטסאפ.", tail: "הצלם במייל." },
  { line: "המחיר של הדי-ג׳יי בצילום מסך.", tail: "איפשהו." },
  { line: "מה סוכם עם הקייטרינג?", tail: "מישהו זוכר. לא אתם." },
  { line: "וכמה כבר הוצאנו בעצם?", tail: "עדיף לא לדעת." },
];

/* Every row verified in TasksScreen.jsx / taskTemplates.js. */
const TASKS = [
  { title: "רשימת התחלה לפי סוג האירוע", body: "לחתונה נטענות 15 משימות, לבר מצווה 9, לברית 7 — עם התאריכים שלהן, שנספרים אחורה מתאריך האירוע. אתם מוחקים את מה שלא רלוונטי ומוסיפים את שלכם." },
  { title: "שלוש עמודות, לא רשימה אחת", body: "לביצוע · בתהליך · הושלם. עוברים בין העמודות בלחיצה, ורואים בעין כמה נשאר." },
  { title: "מה שבאיחור צובע את עצמו", body: "משימה שהתאריך שלה עבר ולא הושלמה מקבלת תג אדום, ומונה \"באיחור\" עולה בראש המסך." },
  { title: "עדיפות, הערה ותאריך", body: "גבוהה, רגילה או נמוכה; שורת הערה לפרטים — מספר טלפון, סכום, מה סוכם." },
];

/* Every row verified in CostScreen.jsx. */
const BUDGET = [
  { title: "מתוכנן מול בפועל, שורה בשורה", body: "שבע קטגוריות מוכנות — אולם, קייטרינג, מוזיקה, צלם, פרחים, הזמנות, אחר — ואפשר להוסיף משלכם. כל שורה מראה את ההפרש בפני עצמה." },
  { title: "עלות לאורח", body: "ההוצאה בפועל חלקי מספר האורחים. המספר הזה הוא מה שבאמת עוזר להחליט אם להוסיף עוד עשרה." },
  { title: "בדיקת שפיות לקייטרינג", body: "המערכת מפרקת לכם את שורת הקייטרינג למנה: כך וכך אורחים כפול כך וכך לאורח. שם מתגלות רוב ההפתעות." },
  { title: "חריגה נראית מיד", body: "עברתם את התקציב? הסכום נצבע, וההפרש מופיע ליד הקטגוריה שגרמה לו." },
];

/* Every row verified in VendorsScreen.jsx / vendorConstants.js. */
const VENDORS = [
  { title: "אחד-עשר סוגי ספקים", body: "אולם, קייטרינג, מוזיקה, צילום, פרחים, הזמנות, שמלה וחליפה, איפור ושיער, רב, הסעות ואחר." },
  { title: "ארבעה מצבים", body: "בבירור · קיבלנו הצעה · סגור · לא ממשיכים. הפילטר למעלה מראה רק את מה שאתם צריכים עכשיו." },
  { title: "כמה נשאר לשלם", body: "מחיר מוסכם מול מה ששילמתם, וסיכום של היתרה. מי שסומן \"לא ממשיכים\" לא נספר — אין התחייבות למי שלא נסגר." },
  { title: "וואטסאפ בלחיצה", body: "מספר הטלפון הופך לקישור וואטסאפ עם קידומת ישראלית, כדי שלא תחפשו אותו שוב." },
];

export default function PlanningServiceScreen({ user = null }) {
  return (
    <div className={styles.root}>
      <SiteHeader user={user} active={SERVICE.id} />

      {/* ── The promise ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>תכנון האירוע</p>
          <h1 className={styles.h1}>
            מה נשאר לעשות, כמה זה עולה,<br />
            <span className={styles.h1Soft}>ומי כבר סגור.</span>
          </h1>
          <p className={styles.lead}>
            שלושה מסכים לכל מה שקורה בחודשים שלפני: לוח משימות שמגיע עם רשימה
            מוכנה לסוג האירוע שלכם, תקציב שמראה מתוכנן מול בפועל, ורשימת ספקים
            עם מה סוכם וכמה נשאר לשלם.
          </p>
          <div className={styles.heroActions}>
            <Link to="/signup" className={styles.cta}>התחילו לתכנן ←</Link>
            <a href="#tasks" className={styles.ghost}>מה יש בפנים</a>
          </div>
          {/* "מסתנכרן בין המחשב לטלפון" alone was an over-claim: without an
              account the data is localStorage on ONE device. Cloud sync is on
              the free plan, but it needs the account, so the note says so. */}
          <p className={styles.heroNote}>
            הכל נשמר אוטומטית תוך כדי — ועם חשבון חינמי גם מסתנכרן בין המחשב לטלפון.
          </p>
        </div>
      </section>

      {/* ── Recognition ── */}
      <section className={styles.friction}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>איפה נמצא התכנון שלכם היום</h2>
          <ul className={styles.frictionList}>
            {CHAOS.map(c => (
              <li key={c.line} className={styles.frictionItem}>
                <span className={styles.frictionLine}>{c.line}</span>
                <span className={styles.frictionTail}>{c.tail}</span>
              </li>
            ))}
          </ul>
          <p className={styles.frictionKicker}>
            אף אחד לא מתכנן אירוע בחוסר ארגון בכוונה. זה פשוט מה שקורה כשכל פיסת
            מידע מגיעה בערוץ אחר, בשעה אחרת, ממישהו אחר.
          </p>
        </div>
      </section>

      {/* ── Tasks ── */}
      <section className={styles.how} id="tasks">
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>לוח משימות שכבר יודע מה צריך</h2>
          <p className={styles.howSub}>
            אתם לא פותחים דף ריק. בוחרים סוג אירוע ומקבלים רשימה מלאה, עם
            תאריכים שנספרים אחורה מהתאריך שלכם.
          </p>

          <article className={styles.step}>
            <div className={styles.stepText}>
              <span className={styles.stepNum}>משימות</span>
              <h3 className={styles.h3}>לביצוע · בתהליך · הושלם</h3>
              <p className={styles.stepBody}>
                לוח פשוט שאפשר לסרוק בשנייה. המשימות מגיעות מסודרות לפי מה
                שקורה קודם — לסגור אולם, לבחור צלם, לשלוח הזמנות, לתדרך את
                הדיילת — ואתם מוחקים, מוסיפים ומזיזים כרצונכם.
              </p>
            </div>
            <figure className={styles.stepFigure}>
              <img
                className={styles.shot} src="/shots/tasks.jpg"
                alt="לוח המשימות — שלוש עמודות לביצוע, בתהליך והושלם, עם תאריכי יעד ותג עדיפות לכל משימה"
                width="2400" height="1520" loading="lazy"
              />
            </figure>
          </article>

          <div className={styles.depthGrid}>
            {TASKS.map(t => (
              <div key={t.title} className={styles.depthCard}>
                <h3 className={styles.depthTitle}>{t.title}</h3>
                <p className={styles.depthBody}>{t.body}</p>
              </div>
            ))}
          </div>

          {/* Said plainly. A host who assumes their phone will buzz has bought
              the wrong thing, and nothing in the app sends a task reminder. */}
          <p className={styles.frictionKicker}>
            ובלי התראות. זה לוח שנפתח כשרוצים לדעת מה נשאר — לא עוד אפליקציה
            שמצלצלת לכם באמצע היום.
          </p>
        </div>
      </section>

      {/* ── Budget ── */}
      <section className={styles.proof}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>תקציב שאומר את האמת</h2>
          <p className={styles.proofSub}>
            מתוכנן מול בפועל, לפי קטגוריה, עם ההפרש ליד כל שורה. בלי נוסחאות
            באקסל ובלי לגלות בסוף.
          </p>

          <figure className={styles.shotFigure}>
            <img
              className={styles.shot} src="/shots/costs.jpg"
              alt="מסך תכנון התקציב — תקציב מתוכנן מול בפועל, עלות לאורח, ופירוט לפי קטגוריה עם ההפרש בכל שורה"
              width="2400" height="1520" loading="lazy"
            />
          </figure>

          <div className={styles.depthGrid}>
            {BUDGET.map(b => (
              <div key={b.title} className={styles.depthCard}>
                <h3 className={styles.depthTitle}>{b.title}</h3>
                <p className={styles.depthBody}>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Vendors ── */}
      <section className={styles.how}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>ספקים — מי סגור, מי עוד באוויר</h2>

          <article className={[styles.step, styles.stepFlip].join(" ")}>
            <div className={styles.stepText}>
              <span className={styles.stepNum}>ספקים</span>
              <h3 className={styles.h3}>הכל על ספק אחד, בשורה אחת</h3>
              <p className={styles.stepBody}>
                שם, קטגוריה, איש קשר, טלפון, מחיר מוסכם, כמה שולם, ומה סוכם.
                במקום להיזכר באיזה צ׳אט זה היה.
              </p>
            </div>
            <figure className={styles.stepFigure}>
              <img
                className={styles.shot} src="/shots/vendors.jpg"
                alt="מסך הספקים — סיכום של סך מחויב, שולם ונותר לשלם, ורשימת ספקים עם סטטוס ומחיר לכל אחד"
                width="2400" height="1520" loading="lazy"
              />
            </figure>
          </article>

          <div className={styles.depthGrid}>
            {VENDORS.map(v => (
              <div key={v.title} className={styles.depthCard}>
                <h3 className={styles.depthTitle}>{v.title}</h3>
                <p className={styles.depthBody}>{v.body}</p>
              </div>
            ))}
          </div>

          {/* The claim this page most wants to make and cannot. Better said by
              us than discovered by a host after they have entered 12 vendors. */}
          <p className={styles.frictionKicker}>
            שקוף מראש: הספקים והתקציב הם שני מסכים נפרדים. המחיר שסגרתם עם הצלם
            לא קופץ לבד לשורת התקציב — את התקציב אתם ממלאים בעצמכם. זה בכוונה
            פשוט, וזה גם משהו שאנחנו רוצים לחבר.
          </p>
        </div>
      </section>

      {/* ── Close ── */}
      <section className={styles.close}>
        <div className={styles.closeInner}>
          <span className={styles.closeMark} aria-hidden="true">✦</span>
          <h2 className={styles.closeTitle}>תפתחו את זה פעם אחת</h2>
          <p className={styles.closeSub}>
            בוחרים סוג אירוע, מקבלים רשימת משימות עם תאריכים, וממלאים תקציב
            בזמן שאתם ממילא מתמחרים. משם זה רק להמשיך.
          </p>
          <Link to="/signup" className={styles.closeCta}>התחילו חינם ←</Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
