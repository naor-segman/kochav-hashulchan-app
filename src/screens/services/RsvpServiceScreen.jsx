import { Link } from "react-router-dom";
import SiteHeader from "../../components/layout/SiteHeader.jsx";
import Footer from "../../components/layout/Footer.jsx";
import { serviceById } from "../../data/services.js";
import styles from "./ServicePage.module.css";

/**
 * Service page 4 of 6 — אישורי הגעה. Checklist 87.
 *
 * ⚠️ THE FIRST PAGE THAT DESCRIBES THINGS THAT DO NOT EXIST YET.
 *
 * The owner asked for the three unbuilt services to appear here — automatic
 * WhatsApp sending, the two-way bot, and three rounds of phone calls — on the
 * explicit basis that the site is not published until they are built. So they
 * are here, and they are quarantined: everything not yet built lives in the
 * single `COMING` array below and renders inside one clearly-marked section.
 * Deleting that array and the section that renders it removes every
 * unbuilt claim from the page in one edit, with nothing left behind in the
 * prose above it. Grep for COMING_NOT_BUILT to find it.
 *
 * Blockers, so nobody has to go looking: automatic sending is checklist 47–51,
 * the bot is decision 29 (closed 10.9 = bot) plus 30, and the call rounds are
 * 89. None of them has a line of code today.
 *
 * ── Verified before writing. What is NOT claimed, and why ───────────────────
 *   • THE RSVP LINK IS PER-EVENT, NOT PER-GUEST. `rsvp_token` is a column on
 *     the event; every guest gets the identical URL, and `rsvp_responses` has
 *     no guest_id. Answers are told apart only by what the guest TYPED — phone
 *     first, then a unique name. So: no "personal link", no "we know who
 *     answered", no "confirm in one tap without typing". The page says the
 *     guest writes their name, because they do.
 *   • "נכנס אוטומטית לרשימת האורחים" is the product's own subtitle and it
 *     OVERSTATES: auto-apply runs only while the host has that screen open, and
 *     only for responses it can match to an existing guest. Unmatched ones wait
 *     for a manual "+ הוסיפו לרשימה". Recorded in WORKPLAN; this page describes
 *     the matched case as matching, not as magic.
 *   • Sending is one guest at a time. There is no bulk action anywhere.
 *   • The "sent" tick is set when WhatsApp OPENS, before the host presses send
 *     inside WhatsApp. The product discloses this and so does this page.
 *   • The host RSVP screen has no "how many have not answered" figure, despite
 *     the nav hint promising one.
 *   • A guest who answers twice creates two rows; there is no edit-your-answer.
 *   • Without an account the links do not resolve at all.
 */

const SERVICE = serviceById("rsvp");

const CHASE = [
  { line: "שלחתם הזמנה לקבוצה.", tail: "ענו שבעה. מתוך מאה ועשרים." },
  { line: "\"תזכירי לי מתי זה?\"", tail: "בפרטי. בשתיים בלילה." },
  { line: "רשימה באקסל, תשובות בוואטסאפ.", tail: "ואמא שסופרת בראש." },
  { line: "והאולם רוצה מספר.", tail: "עד יום רביעי." },
];

/* The guest's actual flow, in order, with the product's own button labels. */
const GUEST_FLOW = [
  { n: "01", title: "לוחצים על הקישור", body: "נפתח בדפדפן של הטלפון. בלי הרשמה, בלי סיסמה, בלי להוריד שום דבר." },
  { n: "02", title: "בוחרים תשובה", body: "‏כן, אגיע בשמחה · עדיין לא בטוח/ה · לא אוכל להגיע. מי שלא מגיע נשאל רק לשם — בלי טלפון, בלי כמות, בלי מנה — ומסיים שם." },
  { n: "03", title: "ממלאים את הפרטים", body: "שם, טלפון אם בא להם, וכמה מגיעים. הזינו יותר מאחד? נפתחות שורות לשמות הנלווים — ואפשר גם לשלוח בלי, ולהשלים אחר כך." },
  { n: "04", title: "מנה והסעה, אם רלוונטי", body: "מנה מיוחדת מוצעת רק למי שאישר, והסעה מופיעה רק אם פרסמתם מסלולים. אורח שלא צריך אותן לא רואה אותן בכלל." },
];

const HOST_SIDE = [
  { title: "התשובה מתחברת לאורח הנכון", body: "ההתאמה נעשית לפי הטלפון, ואם אין — לפי שם. מה שהתאים מתעדכן ברשימה; מה שלא, מחכה לכם בלחיצה אחת של \"הוסיפו לרשימה\"." },
  { title: "כמה מנות להזמין", body: "המערכת מחשבת תחזית מנות מהמאשרים, עם מקדם אי-הגעה שאתם קובעים. זה המספר שהאולם מבקש." },
  { title: "מי נרשם להסעות", body: "אם פרסמתם הסעות — תראו כמה מקומות נתפסו בכל נקודת איסוף." },
  /* Meal IS a column in the Excel export (exportHelpers.js — "מנה"), and is
     NOT on the printed name tags: NameTagsScreen has no mention of it. The
     first draft claimed both. */
  { title: "מנה מיוחדת נשמרת על האורח", body: "טבעוני, כשר מהדרין, ילדים — נכנס לשורה של האורח ברשימה, ויוצא איתו בייצוא לאקסל." },
];

/* The six-stage sequence — content, audiences and the tracker all exist. */
const SEQUENCE = [
  { when: "3–6 חודשים לפני", label: "שמרו את התאריך", who: "כל האורחים" },
  { when: "4–6 שבועות לפני", label: "ההזמנה",         who: "כל האורחים" },
  { when: "שבועיים לפני",     label: "תזכורת ראשונה",  who: "רק מי שלא ענה" },
  { when: "שבוע לפני",        label: "תזכורת אחרונה",  who: "רק מי שלא ענה" },
  { when: "2–3 ימים לפני",    label: "פרטי הגעה",      who: "רק מי שאישר" },
  { when: "1–2 ימים אחרי",    label: "תודה",           who: "רק מי שהגיע" },
];

/* ── COMING_NOT_BUILT ───────────────────────────────────────────────────────
 * Nothing in this array exists in the code. Delete the array and the section
 * that renders it to strip every unbuilt claim from the page.
 *
 * Blocked on, in order: automatic sending → checklist 47–51; the guest
 * answering inside WhatsApp → decision 29 (closed 10.9 as the two-way bot) and
 * 30; the phone rounds → 89.
 *
 * These were fields on the rows first, and nothing rendered them — a value
 * written and never read, which is the exact thing the other service pages
 * call out in the product. They belong in a comment, so here they are. */
const COMING = [
  {
    title: "שליחה אוטומטית",
    body: "הרצף יוצא לבד, בתאריכים שנקבעו מראש — בלי שתפתחו את הטלפון לכל אורח בנפרד.",
  },
  {
    title: "האורח עונה בתוך וואטסאפ",
    body: "בלי לצאת לדפדפן: לוחץ \"מגיע\", עונה כמה, בוחר הסעה — והכל נוחת ברשימה. ההחלטה על מודל הבוט נסגרה; זה מה שנבנה אחריה.",
  },
  {
    title: "שלושה סבבי שיחות טלפון",
    body: "למי שלא ענה גם אחרי התזכורות. שירות בתוספת תשלום, כי בסוף מישהו צריך להרים טלפון.",
  },
];

export default function RsvpServiceScreen({ user = null }) {
  return (
    <div className={styles.root}>
      <SiteHeader user={user} active={SERVICE.id} />

      {/* ── The promise ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>אישורי הגעה</p>
          <h1 className={styles.h1}>
            הם עונים בטלפון שלהם.<br />
            <span className={styles.h1Soft}>הרשימה מתעדכנת אצלכם.</span>
          </h1>
          <p className={styles.lead}>
            קישור אחד שנשלח בוואטסאפ, ונפתח אצל האורח בלי הרשמה ובלי אפליקציה.
            הוא בוחר תשובה, כותב שם, ושולח — ואתם מקבלים מספר אמיתי במקום ספירה
            בראש.
          </p>
          <div className={styles.heroActions}>
            <Link to="/signup" className={styles.cta}>התחילו לאסוף אישורים ←</Link>
            <a href="#flow" className={styles.ghost}>מה האורח רואה</a>
          </div>
          <p className={styles.heroNote}>
            כולל תחזית מנות, הרשמה להסעות ומנות מיוחדות.
          </p>
        </div>
      </section>

      {/* ── Recognition ── */}
      <section className={styles.friction}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>איך זה נראה בלי זה</h2>
          <ul className={styles.frictionList}>
            {CHASE.map(c => (
              <li key={c.line} className={styles.frictionItem}>
                <span className={styles.frictionLine}>{c.line}</span>
                <span className={styles.frictionTail}>{c.tail}</span>
              </li>
            ))}
          </ul>
          <p className={styles.frictionKicker}>
            רדיפה אחרי אישורי הגעה היא לא בעיה של ארגון. היא בעיה של ערוץ: אתם
            שואלים בקבוצה, והם עונים מתי שנוח להם, במקום שנוח להם, ולפעמים בכלל
            לא.
          </p>
        </div>
      </section>

      {/* ── The guest's side ── */}
      <section className={styles.proof} id="flow">
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>מה האורח עושה — פחות מדקה</h2>
          <p className={styles.proofSub}>
            האורח לא פותח חשבון ולא מוריד כלום. הוא לוחץ על קישור, ורואה את שם
            האירוע, התאריך והמקום — ואז שלושה כפתורים.
          </p>
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

      {/* ── The host's side ── */}
      <section className={styles.how}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>ומה קורה אצלכם</h2>

          <article className={styles.step}>
            <div className={styles.stepText}>
              <span className={styles.stepNum}>הרשימה</span>
              <h3 className={styles.h3}>כל אורח עם הסטטוס שלו</h3>
              <p className={styles.stepBody}>
                אישר, סירב, או עדיין שותק — ליד השם, בצבע, בלי לחפש. אפשר לסנן
                לפי סטטוס, לפי צד ולפי קבוצה, ולהוריד את הכל לאקסל בכל רגע.
              </p>
            </div>
            <figure className={styles.stepFigure}>
              <img
                className={styles.shot} src="/shots/guests.jpg"
                alt="רשימת האורחים — לכל שורה סטטוס אישור הגעה, צד, קבוצה, מספר מקומות ושיוך לשולחן"
                width="2400" height="1520" loading="lazy"
              />
            </figure>
          </article>

          <div className={styles.depthGrid}>
            {HOST_SIDE.map(h => (
              <div key={h.title} className={styles.depthCard}>
                <h3 className={styles.depthTitle}>{h.title}</h3>
                <p className={styles.depthBody}>{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The sequence ── */}
      <section className={styles.depth}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>שש הודעות, ולא אחת מיותרת</h2>
          <p className={styles.howSub}>
            הטקסטים מוכנים ואתם עורכים אותם. מה שחשוב הוא למי כל אחת יוצאת —
            תזכורת שנשלחת גם למי שכבר אישר היא הדרך הבטוחה לגרום לאנשים להשתיק
            את הקבוצה.
          </p>

          <ul className={styles.frictionList}>
            {SEQUENCE.map(s => (
              <li key={s.label} className={styles.frictionItem}>
                <span className={styles.frictionLine}>{s.label}</span>
                <span className={styles.frictionTail}>{s.when} · {s.who}</span>
              </li>
            ))}
          </ul>

          <article className={[styles.step, styles.stepFlip].join(" ")}>
            <div className={styles.stepText}>
              <span className={styles.stepNum}>הודעות</span>
              <h3 className={styles.h3}>ומעקב מי כבר קיבל מה</h3>
              <p className={styles.stepBody}>
                כל אורח מסומן אחרי שנשלח אליו, כך שאתם לא מתחילים לספור מהתחלה
                בכל פעם. ההודעה יוצאת מהוואטסאפ שלכם — ולכן היא לא עולה כלום.
              </p>
            </div>
            <figure className={styles.stepFigure}>
              <img
                className={styles.shot} src="/shots/messages.jpg"
                alt="מסך ההודעות לאורחים — שישה שלבים עם מונה נשלחו מתוך מי שאפשר לשלוח אליו, וטקסט שניתן לעריכה"
                width="2400" height="1520" loading="lazy"
              />
            </figure>
          </article>

          {/* The product discloses this in the UI; so does the page. */}
          <p className={styles.frictionKicker}>
            שקוף מראש: כרגע שולחים אורח-אורח. לחיצה על “שלחו” פותחת את
            וואטסאפ עם הטקסט מוכן ומסמנת את האורח — ועדיין צריך ללחוץ “שלח”
            בוואטסאפ עצמו.
          </p>
        </div>
      </section>

      {/* ── Coming ── COMING_NOT_BUILT: this whole section is unbuilt. ── */}
      <section className={styles.friction}>
        <div className={styles.sectionInner}>
          <h2 className={styles.h2}>ומה שנבנה עכשיו</h2>
          <p className={styles.howSub}>
            שלושת אלה בפיתוח. הם לא זמינים היום, והם כתובים כאן כדי שתדעו לאן זה
            הולך — לא כדי להיראות גדולים.
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
          <h2 className={styles.closeTitle}>תפסיקו לספור בראש</h2>
          <p className={styles.closeSub}>
            פותחים אירוע, מעלים רשימה, שולחים קישור. המספר שהאולם מבקש יהיה
            מחכה לכם במסך אחד.
          </p>
          <Link to="/signup" className={styles.closeCta}>התחילו חינם ←</Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
