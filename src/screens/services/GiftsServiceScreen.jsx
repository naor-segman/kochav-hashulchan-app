import { Link } from "react-router-dom";
import SiteHeader from "../../components/layout/SiteHeader.jsx";
import Footer from "../../components/layout/Footer.jsx";
import { serviceById } from "../../data/services.js";
import styles from "./ServicePage.module.css";

/**
 * Service page 6 of 6 — מתנות באשראי. Checklist 87.
 *
 * ⚠️ THE PAGE WITH THE WIDEST GAP BETWEEN ITS TITLE AND ITS CODE.
 *
 * The nav label the owner chose is "מתנות באשראי", and **charging a card does
 * not exist**. `submit_gift_by_token` hardcodes `paid = false`, nothing in the
 * repository ever sets it true, there is no Stripe webhook and there is no
 * clearing agreement. That is checklist 90 and it is the only thing on the
 * page's own title that the product cannot do today.
 *
 * So the page does not lead with it. What it sells is what is built — the
 * blessing, the declared amount, the projected wall and the host's list — and
 * the charging leg sits in the single `COMING` array, exactly as on service
 * page 4. Delete that array and the section that renders it and every unbuilt
 * claim leaves the page in one edit. Grep COMING_NOT_BUILT.
 *
 * ── Verified against the code before writing. What is NOT claimed, and why ──
 *   • NO CARD IS CHARGED, ANYWHERE. Not in the hero, not in a feature card, not
 *     implied by a verb. The gift screen itself was already de-claimed for this
 *     reason — its tag reads "ברכה ומתנה" and not "מתנה דיגיטלית", with a
 *     comment saying a tag that promises money movement is a promise the screen
 *     breaks. The same rule governs this page.
 *   • NO BIT AND NO PAYBOX. Decision 11.8 removed them: a peer-to-peer transfer
 *     app charges the HOST the fee on money collected on their behalf. The
 *     fields are gone from event setup and the RPC no longer serves them
 *     (20260818000200). The page therefore does not say the guest is shown
 *     "how to transfer" — the screen shows no transfer instructions at all.
 *     ⚠️ `shareLinks.js` and `HelpScreen.jsx` still say otherwise, in the
 *     product. Recorded as a finding; not fixed in this commit.
 *   • NO PER-GUEST ATTRIBUTION. `public.gifts` has no guest_id and no phone —
 *     only the free-text name the donor typed. So no "see who gave what" and no
 *     matching to the guest list. The app's own sample blessings are
 *     "משפחת כהן", "צוות המשרד", "סבתא מרים": none of them is a guest row.
 *   • NOT REACHABLE FROM THE RSVP LINK. RSVPScreen renders a gift button, but
 *     `public_event_by_token` returns gift_token only for the invite and gift
 *     token types, so on a real RSVP link it is always null and the button never
 *     renders. It IS reachable from the event site, which loads as `invite` —
 *     that is what the page says.
 *   • NO GIFT RECONCILIATION REPORT. Sheet 6 of the Excel export reads
 *     `giftAmount`, which nothing in src/ writes, so it is structurally empty on
 *     every event. Marketing does not point at it.
 *   • THE WALL IS NOT PRIVATE. `/gift/:token/wall` is the gift link with /wall
 *     appended, so anyone holding the gift link can open it. Nothing here says
 *     it is restricted.
 *   • MODERATION IS HIDE, NOT DELETE. `deleteEventGift` exists and has no
 *     caller; the UI offers "הסתירו מהקיר" / "החזירו לקיר" and the host keeps
 *     the row and the amount either way. Described as it is.
 *   • WITHOUT AN ACCOUNT THE LINKS DO NOT RESOLVE. ShareLinksScreen withholds
 *     them rather than showing a dead one, and the page says so in the close.
 */

const SERVICE = serviceById("gifts");

const FRICTION = [
  { line: "מעטפות בתוך תיק, בתוך רכב, בתוך חניון.", tail: "בשלוש לפנות בוקר." },
  { line: "\"מי זה נתן? אין שם על המעטפה.\"", tail: "וגם אין למי לשאול." },
  { line: "סבתא כתבה ברכה מהלב.", tail: "על מפית. שנזרקה." },
  { line: "והברכות הכי יפות נאמרו למצלמה.", tail: "שאף אחד לא פתח מאז." },
];

/* The guest's actual flow on /gift/:token, with the screen's own labels. */
const GUEST_FLOW = [
  {
    n: "01",
    title: "פותחים קישור",
    body: "בלי הרשמה, בלי אפליקציה, בלי סיסמה. נפתח בדפדפן של הטלפון ומראה את שם האירוע ואת שמכם.",
  },
  {
    n: "02",
    title: "בוחרים סכום וכותבים ברכה",
    body: "‏₪200 · ₪300 · ₪500 · ₪1,000 בלחיצה, או סכום משלכם. ואז ברכה — כמה מילים או פסקה שלמה.",
  },
  {
    n: "03",
    title: "חותמים בשם",
    body: "\"משפחת לוי\", \"פלוגה ב׳\", \"סבתא מרים\" — איך שאתם חותמים בכרטיס ברכה. זה השם שיופיע על הקיר.",
  },
];

/* What the wall does, all of it read out of GiftWallScreen. */
const WALL = [
  {
    title: "בלי סכומים. בכלל.",
    body: "הקיר מקבל מהשרת שם, ברכה וזמן — הסכום לא נשלח אליו מלכתחילה. אף אחד באולם לא יראה מי נתן כמה, גם לא בטעות.",
  },
  {
    title: "מתעדכן לבד",
    body: "ברכה חדשה מופיעה על המסך בתוך חצי דקה, בלי שמישהו ירענן משהו. אפשר לפתוח את זה על מסך באולם ולשכוח מזה.",
  },
  {
    title: "\"לפני 4 דקות\"",
    body: "כל ברכה נושאת את הזמן שעבר מאז שנכתבה, בעברית ובלשון הנכונה — דקה, שתי דקות, שעתיים, יומיים.",
  },
];

/* The host's half — CostScreen + the moderation action. */
const HOST_SIDE = [
  {
    title: "רשימה עם הסכומים",
    body: "אצלכם, ורק אצלכם, מופיע מי הצהיר על מה — שם וסכום, מהחדש לישן, עם סך הכל.",
  },
  {
    title: "הצהרה, לא קבלה",
    body: "המספר הזה יושב בנפרד מ\"הכנסה צפויה\" ולא מתערבב בה. הוא לא נספר ככסף שנכנס, כי הוא לא כסף שנכנס.",
  },
  {
    title: "כפתור הסתרה",
    body: "מישהו כתב משהו שלא צריך להיות על מסך בחתונה? לחיצה אחת והברכה יורדת מהקיר — והשורה נשארת אצלכם ברשימה.",
  },
  {
    title: "וגם אפשר להחזיר",
    body: "ההסתרה הפיכה. הסתרתם בטעות באמצע האירוע, לחצתם \"החזירו לקיר\", וזה חזר בפולינג הבא.",
  },
];

/* ── COMING_NOT_BUILT ───────────────────────────────────────────────────────
 * Nothing in this array exists in the code.
 *
 * Blocked on, in order: the card charging → checklist 90, and it needs a
 * clearing agreement before it needs a line of code (checklist 46); sending the
 * gift link inside the day-of message → the owner's request of 10.9, which
 * rides on the automatic sending of 47–51. */
const COMING = [
  {
    title: "תשלום בכרטיס אשראי",
    body: "שהאורח יוכל להעביר את המתנה עצמה מהטלפון, ולא רק להצהיר עליה. זה בפיתוח, וזה תלוי בהסדר סליקה — לא רק בקוד. היום הכסף עובר ביום האירוע, כמו תמיד.",
  },
  {
    title: "יוצא עם ההודעה של יום האירוע",
    body: "אותה הודעה שמזכירה לאורח את מספר השולחן שלו תישא גם את קישור המתנה — כדי שלא יצטרך לחפש אותו בגלילה של חודש אחורה.",
  },
];

export default function GiftsServiceScreen({ user = null }) {
  return (
    <div className={styles.root}>
      <SiteHeader user={user} active={SERVICE.id} />

      {/* ── The promise ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>מתנות וברכות</p>
          <h1 className={styles.h1}>
            הכסף עובר באולם.<br />
            <span className={styles.h1Soft}>הברכה נשארת לתמיד.</span>
          </h1>
          <p className={styles.lead}>
            קישור אחד שהאורח פותח בטלפון: בוחר סכום, כותב ברכה, חותם בשם. הברכה
            עולה על מסך באולם — בלי הסכום — ואצלכם נשמרת רשימה מסודרת של מי
            הצהיר על מה.
          </p>
          <div className={styles.heroActions}>
            <Link to="/signup" className={styles.cta}>פתחו דף מתנה ←</Link>
            <a href="#wall" className={styles.ghost}>איך הקיר נראה</a>
          </div>
          <p className={styles.heroNote}>
            שקוף מראש: כרגע זו הצהרה וברכה. תשלום בכרטיס אשראי בפיתוח — למטה.
          </p>
        </div>
      </section>

      {/* ── Recognition ── */}
      <section className={styles.friction}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>מה קורה למעטפות</h2>
          <ul className={styles.frictionList}>
            {FRICTION.map(f => (
              <li key={f.line} className={styles.frictionItem}>
                <span className={styles.frictionLine}>{f.line}</span>
                <span className={styles.frictionTail}>{f.tail}</span>
              </li>
            ))}
          </ul>
          <p className={styles.frictionKicker}>
            המתנה עוברת ביום אחד. הברכה שנכתבה איתה אמורה להישאר הרבה אחריו —
            ובפועל היא זו שנעלמת ראשונה.
          </p>
        </div>
      </section>

      {/* ── The guest's side ── */}
      <section className={styles.proof} id="flow">
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>מה האורח עושה — חצי דקה</h2>
          <p className={styles.proofSub}>
            שלושה שדות, בעברית, בלי חשבון ובלי הורדה. זה המסך שהוא רואה.
          </p>

          <article className={styles.step}>
            <div className={styles.stepText}>
              <span className={styles.stepNum}>הדף עצמו</span>
              <h3 className={styles.h3}>אומר בדיוק מה יקרה</h3>
              <p className={styles.stepBody}>
                לפני הכפתור, לא אחריו, כתוב מה קורה בלחיצה: הברכה והסכום נרשמים
                ומופיעים בקיר הברכות, ואת המתנה עצמה מעניקים ביום האירוע. אורח
                שמצפה למסך תשלום לא יופתע — כי לא הבטחנו לו אחד.
              </p>
            </div>
            <figure className={[styles.stepFigure, styles.stepFigurePortrait].join(" ")}>
              <img
                className={styles.shot} src="/shots/gift-form.jpg"
                alt="דף המתנה בטלפון — שם האירוע, ארבעה סכומים לבחירה וסכום חופשי, תיבת ברכה אישית, שם השולח וכרטיס שמסביר מה קורה בלחיצה"
                width="1280" height="2200" loading="lazy"
              />
            </figure>
          </article>

          <div className={styles.stages}>
            {GUEST_FLOW.map(g => (
              <article key={g.n} className={styles.stage}>
                <span className={styles.stepNum}>{g.n}</span>
                <h3 className={styles.h3}>{g.title}</h3>
                <p className={styles.stepBody}>{g.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── The wall ── */}
      <section className={styles.how} id="wall">
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>וזה עולה על מסך באולם</h2>
          <p className={styles.howSub}>
            קישור שני, שנפתח על כל מסך שיש באולם — טלוויזיה, מקרן, לפטופ. הברכות
            נכנסות אליו לבד לאורך הערב.
          </p>

          <figure className={styles.shotFigure}>
            <img
              className={styles.shot} src="/shots/gift-wall.jpg"
              alt="קיר הברכות מוקרן על מסך — כרטיסים כהים ובכל אחד שם המברך, הברכה שכתב והזמן שעבר מאז, בלי אף סכום"
              width="2400" height="1520" loading="lazy"
            />
          </figure>

          <div className={styles.depthGrid}>
            {WALL.map(w => (
              <div key={w.title} className={styles.depthCard}>
                <h3 className={styles.depthTitle}>{w.title}</h3>
                <p className={styles.depthBody}>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The host's side ── */}
      <section className={styles.depth}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>ומה קורה אצלכם</h2>
          <p className={styles.howSub}>
            שני דברים שהאורחים לא רואים: הסכומים, וכפתור אחד שמוריד ברכה מהמסך.
          </p>
          <div className={styles.depthGrid}>
            {HOST_SIDE.map(h => (
              <div key={h.title} className={styles.depthCard}>
                <h3 className={styles.depthTitle}>{h.title}</h3>
                <p className={styles.depthBody}>{h.body}</p>
              </div>
            ))}
          </div>
          <p className={styles.frictionKicker}>
            אנחנו לא נוגעים בכסף שלכם — לא מחזיקים אותו, לא מעבירים אותו ולא
            גוזרים ממנו. מה שהמערכת שומרת זה הברכה, הסכום שהאורח הצהיר עליו,
            והשם שהוא חתם בו.
          </p>
        </div>
      </section>

      {/* ── On the event site ── */}
      <section className={styles.how}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>וגם באתר של האירוע</h2>
          <article className={[styles.step, styles.stepFlip].join(" ")}>
            <div className={styles.stepText}>
              <span className={styles.stepNum}>אתר האירוע</span>
              <h3 className={styles.h3}>שתי מקטעות, ואתם מחליטים אם בכלל</h3>
              <p className={styles.stepBody}>
                לאתר האירוע נכנסים בלאו הכי — בשביל הכתובת, הוויז וההסעות. שם
                יושבים גם כפתור למסך המתנה וגם קיר ברכות מוקטן עם הברכות
                האחרונות. שניהם מתג במסך העריכה, ואפשר לכבות כל אחד מהם בנפרד.
              </p>
            </div>
            <figure className={styles.stepFigure}>
              <img
                className={styles.shot} src="/shots/site-editor.jpg"
                alt="מסך עריכת אתר האירוע — בחירת עיצוב, שדות התוכן והמתגים שמחליטים אילו מקטעים יופיעו לאורחים"
                width="2400" height="1520" loading="lazy"
              />
            </figure>
          </article>
        </div>
      </section>

      {/* ── Coming ── COMING_NOT_BUILT: this whole section is unbuilt. ── */}
      <section className={styles.friction}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>ומה שנבנה עכשיו</h2>
          <p className={styles.howSub}>
            שניהם בפיתוח ואף אחד מהם לא זמין היום. הם כתובים כאן כדי שתדעו לאן
            זה הולך — לא כדי להיראות גדולים.
          </p>
          <div className={styles.depthGrid}>
            {COMING.map(c => (
              <div key={c.title} className={styles.depthCard}>
                <span className={styles.stageWhen}>בפיתוח</span>
                <h3 className={styles.depthTitle}>{c.title}</h3>
                <p className={styles.depthBody}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Close ── */}
      <section className={styles.close}>
        <div className={styles.closeInner}>
          <span className={styles.closeMark} aria-hidden="true">✦</span>
          <h2 className={styles.closeTitle}>שהברכות ישרדו את הערב</h2>
          <p className={styles.closeSub}>
            פותחים אירוע, מקבלים את שני הקישורים — אחד לאורחים, אחד למסך באולם.
            הקישורים נפתחים אחרי פתיחת חשבון, והיא חינם.
          </p>
          <Link to="/signup" className={styles.closeCta}>התחילו חינם ←</Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
