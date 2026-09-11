import { Link } from "react-router-dom";
import SiteHeader from "../../components/layout/SiteHeader.jsx";
import Footer from "../../components/layout/Footer.jsx";
import { serviceById } from "../../data/services.js";
import styles from "./ServicePage.module.css";

/**
 * Service page 2 of 6 — אתר לאירוע והזמנה דיגיטלית. Checklist 87.
 *
 * ── Written against a verified inventory, not against the feature names ─────
 * Page 1 shipped three claims the code does not support, so this one was
 * written after an audit of EventSiteScreen, EventSiteEditorScreen,
 * AnnouncementScreen, InviteScreen, AlbumScreen and ShareLinksScreen. Eight
 * things came back that look advertisable and are not. They are recorded in
 * WORKPLAN (rows נ–ש); the ones that shaped this page's copy:
 *
 *   • CUSTOM DOMAIN is dead. The editor has a "דומיין משלכם" field and even
 *     prints CNAME instructions, but `site.customDomain` is read by nothing in
 *     src/ or netlify/. Not mentioned here, at all.
 *   • The ALBUM has no host gallery and no moderation — guests upload and
 *     everyone sees everything. So this page says "כולם רואים הכל" rather than
 *     anything about controlling what is published.
 *   • The album is NOT linked from the site or the invitation; it travels as
 *     its own link. Said plainly rather than implied away.
 *   • PERSONAL QR CARDS reach five guests in practice. The card is described as
 *     the shared invitation card it actually is, and the per-guest code is not
 *     promised.
 *   • QR SCANNING at the door is Chrome/Android only — that belongs to service
 *     page 5 and is not claimed here.
 *   • PHOTO RETENTION is 30 days by a purge function that may not be deployed,
 *     so this page promises neither permanence nor cleanup and stays silent.
 *   • WhatsApp previews work for /invite/ only. Not claimed for the others.
 *
 * What IS claimed here was read out of the code: ten themes, three fonts,
 * eleven per-type starters, the publish gate, the .ics download, the Waze
 * fallback built from the address, seven fields per shuttle row, and the ten
 * links with a QR each.
 */

const SERVICE = serviceById("site");

/* The three things a host sends, in the order they are sent.
   They share the `invite` TOKEN but they are three distinct URLs, so the page
   does not call them one link. What they genuinely share is the event's own
   details — names, date, venue are entered once and appear in all three — and
   each has its own publish flag. Both were verified in the code. */
const STAGES = [
  {
    n: "01",
    when: "חצי שנה לפני",
    title: "שמרו את התאריך",
    body: "דף אחד עם השמות, התאריך וספירה לאחור. יוצא לפני שיש בכלל אולם סגור, ותפקידו היחיד הוא שהתאריך ייכנס ליומן.",
    note: "כפתור \"הוסיפו ליומן\" מוריד קובץ יומן אמיתי — לא קישור לגוגל.",
  },
  {
    n: "02",
    when: "חודש-חודשיים לפני",
    title: "ההזמנה הדיגיטלית",
    body: "אותו קישור, עכשיו עם המיקום וכפתור אישור הגעה. זה מה שנשלח בקבוצת הוואטסאפ המשפחתית.",
    note: "אפשר גם כרטיס הזמנה מעוצב עם קוד סריקה שמוביל ישר לאישור ההגעה.",
  },
  {
    n: "03",
    when: "עד הערב עצמו",
    title: "אתר האירוע",
    body: "העמוד המלא — לוז, מיקום וניווט, הסעות, קוד לבוש, קיר ברכות ותשובות לשאלות שכולם שואלים. פתוח עד הערב, ואפשר לעדכן אותו מתי שרוצים.",
    note: "הקישורים קבועים. שולחים היום, מעדכנים את התוכן מחר — בלי לשלוח שוב.",
  },
];

/* Every row here was verified against EventSiteScreen.jsx. Sections marked
   "off by default" are the host's switch, so the wording is "אפשר להדליק". */
const ONSITE = [
  { title: "ספירה לאחור חיה", body: "שעון שרץ לקראת התאריך, בראש העמוד." },
  { title: "לוז הערב", body: "קבלת פנים, חופה, ארוחה, ריקודים — שעה ושורה לכל שלב." },
  { title: "מיקום וניווט", body: "כתובת, הערת חניה, וכפתור Waze. לא הזנתם קישור? הוא נבנה לבד מהכתובת." },
  { title: "הסעות", body: "שעה, כיוון הלוך או חזור, נקודת איסוף, ואיש קשר שאפשר ללחוץ עליו בוואטסאפ." },
  { title: "קוד לבוש", body: "שורה אחת שחוסכת עשרים הודעות \"מה לובשים?\"." },
  { title: "כמה מילים עליכם", body: "הסיפור שלכם, אם בא לכם. לא חובה." },
  { title: "קיר ברכות", body: "האורחים משאירים ברכה, והיא מופיעה על העמוד — ואפשר להקרין אותו על מסך באולם." },
  { title: "שאלות נפוצות", body: "יש חניה? אפשר להביא ילדים? מתי להגיע? נענה פעם אחת, לכולם." },
];

const ALBUM = [
  "האורחים מעלים מהטלפון, בלי הרשמה ובלי אפליקציה.",
  "אפשר לצרף שם, כדי שתדעו מי צילם.",
  "התמונות מוקטנות בטלפון לפני ההעלאה, כך שזה עובד גם על הרשת של האולם.",
];

export default function EventSiteServiceScreen({ user = null }) {
  return (
    <div className={styles.root}>
      <SiteHeader user={user} active={SERVICE.id} />

      {/* ── The promise ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>אתר לאירוע והזמנה דיגיטלית</p>
          <h1 className={styles.h1}>
            שולחים פעם אחת.<br />
            <span className={styles.h1Soft}>מעדכנים עד הערב עצמו.</span>
          </h1>
          {/* NOT "קישור אחד", which is what this said first and is not true:
              /save-the-date/, /invitation/ and /invite/ are three different
              URLs that share one token. A host sends three. What IS true, and
              is what ShareLinksScreen itself promises, is that each address is
              permanent — the content behind it changes without resending. */}
          <p className={styles.lead}>
            שמרו את התאריך, ההזמנה ואתר האירוע — שלושה דפים לאותו אירוע, וכל אחד
            יושב בכתובת קבועה שלא משתנה. שלחתם בוואטסאפ? אפשר להמשיך לערוך את מה
            שמאחורי הקישור עד הערב, בלי לשלוח שוב ובלי שאף אחד יישאר עם גרסה ישנה.
          </p>
          <div className={styles.heroActions}>
            <Link to="/signup" className={styles.cta}>בנו אתר בחינם ←</Link>
            <a href="#onsite" className={styles.ghost}>מה יש באתר</a>
          </div>
          <p className={styles.heroNote}>
            עשר ערכות עיצוב, ותבנית מוכנה לכל סוג אירוע.
          </p>
        </div>
      </section>

      {/* ── Recognition ── */}
      <section className={styles.friction}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>השאלות שתיענו עליהן שבע-עשרה פעמים</h2>
          <ul className={styles.frictionList}>
            <li className={styles.frictionItem}>
              <span className={styles.frictionLine}>&quot;באיזו שעה זה מתחיל?&quot;</span>
              <span className={styles.frictionTail}>ההזמנה נשלחה. בקבוצה. פעמיים.</span>
            </li>
            <li className={styles.frictionItem}>
              <span className={styles.frictionLine}>&quot;יש חניה שם?&quot;</span>
              <span className={styles.frictionTail}>יש. כתוב בהזמנה.</span>
            </li>
            <li className={styles.frictionItem}>
              <span className={styles.frictionLine}>&quot;תשלחי לי שוב את הכתובת?&quot;</span>
              <span className={styles.frictionTail}>בשמחה. בפעם השביעית.</span>
            </li>
            <li className={styles.frictionItem}>
              <span className={styles.frictionLine}>&quot;מה לובשים?&quot;</span>
              <span className={styles.frictionTail}>זו הייתה דודה שרה. שוב.</span>
            </li>
          </ul>
          <p className={styles.frictionKicker}>
            אף אחת מהשאלות האלה היא לא באמת שאלה — היא בקשה לקישור אחד שאפשר
            לפתוח בטלפון ולראות בו הכל. זה מה שהעמוד הזה עושה.
          </p>
        </div>
      </section>

      {/* ── One link, three stages ── */}
      <section className={styles.proof}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>שלושה דפים, שלוש נקודות זמן</h2>
          <p className={styles.proofSub}>
            כולם נבנים מאותם פרטי אירוע — השמות, התאריך והמקום מוזנים פעם אחת
            ומופיעים בשלושתם. ולכל אחד מתג פרסום נפרד, כך שאתם מחליטים מתי כל
            אחד עולה לאוויר.
          </p>
          <div className={styles.stages}>
            {STAGES.map(s => (
              <article key={s.n} className={styles.stage}>
                <span className={styles.stageWhen}>{s.when}</span>
                <span className={styles.stepNum}>{s.n}</span>
                <h3 className={styles.h3}>{s.title}</h3>
                <p className={styles.stepBody}>{s.body}</p>
                <p className={styles.stageNote}>{s.note}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── What is on the site ── */}
      <section className={styles.how} id="onsite">
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>מה יושב על העמוד</h2>
          <p className={styles.howSub}>
            כל חלק הוא מתג. מה שלא רלוונטי לאירוע שלכם — פשוט לא מופיע.
          </p>

          <article className={styles.step}>
            <div className={styles.stepText}>
              <span className={styles.stepNum}>העורך</span>
              <h3 className={styles.h3}>ממלאים טופס, מקבלים אתר</h3>
              <p className={styles.stepBody}>
                אין גרירה, אין בונה אתרים, אין החלטות עיצוב. בוחרים ערכת צבעים
                וגופן, ממלאים את מה שרלוונטי, ומדליקים את מה שרוצים להציג.
                העמוד נבנה מזה.
              </p>
            </div>
            <figure className={styles.stepFigure}>
              <img
                className={styles.shot} src="/shots/site-editor.jpg"
                alt="עורך אתר האירוע — בחירת ערכת עיצוב וגופן, שדות לכתובת, ללוז ולהסעות, ומתגים לכל חלק בעמוד"
                width="2400" height="1520" loading="lazy"
              />
            </figure>
          </article>

          <div className={styles.depthGrid}>
            {ONSITE.map(s => (
              <div key={s.title} className={styles.depthCard}>
                <h3 className={styles.depthTitle}>{s.title}</h3>
                <p className={styles.depthBody}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Links ── */}
      <section className={styles.depth}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>כל הקישורים במסך אחד</h2>
          <p className={styles.howSub}>
            עשרה קישורים, כל אחד עם קוד QR להורדה — להדפסה על שילוט בכניסה או על
            ההזמנה עצמה. ולצד כל אחד, שורה אחת שאומרת מה האורח יעשה איתו.
          </p>
          {/* No screenshot here on purpose. The links screen is gated on an
              account, and a local build has no Supabase — see the note in
              qa/marketingShots.mjs — so the only image the harness can produce
              of it is the locked state. A picture of the product refusing to
              show a feature is worse than no picture. */}
          <div className={styles.depthGrid}>
            <div className={styles.depthCard}>
              <h3 className={styles.depthTitle}>מה ששולחים לכולם</h3>
              <p className={styles.depthBody}>
                שמרו את התאריך, ההזמנה, כרטיס ההזמנה, אתר האירוע, אישור ההגעה,
                המתנה והאלבום. שבעה קישורים, כל אחד נפתח בטלפון בלי הרשמה.
              </p>
            </div>
            <div className={styles.depthCard}>
              <h3 className={styles.depthTitle}>מה ששולחים רק למי שעוזר</h3>
              <p className={styles.depthBody}>
                הטבלה השיתופית — ולידה כתוב בפירוש שמי שמקבל אותה רואה את כל
                הרשימה. זו לא רשימת תפוצה.
              </p>
            </div>
            <div className={styles.depthCard}>
              <h3 className={styles.depthTitle}>מה שנפתח ביום האירוע</h3>
              <p className={styles.depthBody}>
                עמדת הכניסה לטלפון של מי שעומד בדלת, וקיר הברכות למסך באולם.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Album ── */}
      <section className={styles.friction}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>ואחרי הערב — האלבום</h2>
          <p className={styles.howSub}>
            קישור נפרד שהאורחים מעלים אליו את מה שצילמו, במקום שזה יסתובב בעשרים
            צ׳אטים ויאבד.
          </p>
          <ul className={styles.frictionList}>
            {ALBUM.map(line => (
              <li key={line} className={styles.frictionItem}>
                <span className={styles.frictionLine}>{line}</span>
              </li>
            ))}
          </ul>
          {/* Said out loud rather than left for a host to discover: there is no
              host gallery, no approval queue and no delete. */}
          <p className={styles.frictionKicker}>
            שקוף מראש: האלבום פתוח — מי שיש לו את הקישור מעלה ורואה את הכל, ואין
            מסך אישור לפני שתמונה מופיעה. שלחו אותו למי שהייתם מזמינים לחתונה.
          </p>
        </div>
      </section>

      {/* ── Close ── */}
      <section className={styles.close}>
        <div className={styles.closeInner}>
          <span className={styles.closeMark} aria-hidden="true">✦</span>
          <h2 className={styles.closeTitle}>תפסיקו לענות על אותה שאלה</h2>
          <p className={styles.closeSub}>
            פותחים אירוע, בוחרים עיצוב, ממלאים כתובת ושעה. הקישור מוכן — ואפשר
            לשלוח אותו עוד היום.
          </p>
          <Link to="/signup" className={styles.closeCta}>התחילו חינם ←</Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
