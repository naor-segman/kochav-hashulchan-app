import { Link } from "react-router-dom";
import SiteHeader from "../components/layout/SiteHeader.jsx";
import Footer from "../components/layout/Footer.jsx";
import SectionMark from "../components/ui/SectionMark.jsx";
import PackagePicker from "../components/marketing/PackagePicker.jsx";
import { COMPANY } from "../data/company.js";
import { FREE_PACKAGE, HUMAN_SERVICES, GUESTS_MAX } from "../data/pricingCurve.js";
import { PLAN_LIMITS } from "../admin/lib/planConfig.js";
import { PLANS, PRICING_FOOTNOTE } from "../data/pricing.js";
import styles from "./PricingScreen.module.css";
import { useHashScroll } from "../hooks/useHashScroll.js";

/**
 * The pricing page — 136/139, the model the owner approved on 5.10:
 * free to try · two self-serve packages priced by your guest count · people at
 * the event by quote. Every number comes from src/data/pricingCurve.js.
 */

const quoteHref = () => `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent("היי, אשמח להצעת מחיר לשירות באירוע")}`;

const FAQ = [
  { q: "למה המחיר לפי מספר המוזמנים?",
    a: "כי כל מוזמן מקבל הודעות בוואטסאפ, תזכורת, מספר שולחן — ובחבילה המלאה גם שיחה. אירוע קטן לא צריך לשלם כמו חתונה של אלף איש, ואתם רואים את המחיר המדויק שלכם לפני שמשלמים." },
  { q: "ואם מספר המוזמנים משתנה?",
    a: "משדרגים בכל רגע ומשלמים רק את ההפרש. מה שכבר בניתם — הרשימה, האישורים וההושבה — נשאר בדיוק כמו שהוא." },
  { q: "זה מנוי?",
    a: "לא. תשלום אחד לאירוע, פעם אחת. אחרי האירוע הרשימה וההושבה נשארות אצלכם." },
  { q: "מה מקבלים בחינם?",
    a: `הזמנה דיגיטלית, אתר לאירוע, אישורי הגעה בקישור, רשימת אורחים בלי הגבלה, והושבה אוטומטית עד ${PLAN_LIMITS.free.maxSeatedSeats} מוזמנים — כדי שתרגישו איך זה עובד לפני שמחליטים.` },
  { q: "מי מתקשר לאורחים בחבילה המלאה?",
    a: "נציג אנושי שלנו מתקשר למי שלא ענה בוואטסאפ, והתשובה נכנסת לרשימה שלכם לבד. אתם לא מתקשרים לאף אחד." },
  /* The gift answer has to match /services/gifts — card payment is not live
     (WORKPLAN 90). serviceClaims.test.js pins the two pages to one answer. */
  { q: "מה קורה עם המתנות?",
    a: "באפליקציה האורח מצהיר על המתנה וכותב ברכה. הברכות עולות לקיר ברכות שמוקרן על מסך באולם — בלי סכומים — ואצלכם נשמרת רשימה של מי בירך ומה. הכסף עצמו עובר ביום האירוע, כמו תמיד. תשלום המתנה בכרטיס אשראי מהטלפון נמצא בפיתוח ועוד לא זמין." },
  { q: "הנתונים שלי מוגנים?",
    a: "הנתונים נשמרים גם במכשיר שלכם וגם בענן, וההעברה מוצפנת. אנחנו לא מוכרים מידע לצד שלישי. אפשר בכל רגע להוריד את הרשימה וההושבה לאקסל, וגם למחוק את העותק המקומי מהמכשיר." },
  { q: "אפשר לבטל ולקבל החזר?",
    a: "כן. בתוך 14 יום מהרכישה אפשר לבטל ולקבל את הכסף בחזרה. כל הפרטים בעמוד ״ביטול עסקה והחזרים״." },
];

export default function PricingScreen({ user }) {
  useHashScroll();   // /pricing#human, /services/…#how — links shared from outside (review 5.10)
  return (
    <div className={styles.root}>
      <SiteHeader user={user} active="pricing" />
      <main id="main" tabIndex={-1} className={styles.main}>

        <section className={styles.top}>
          <div className={styles.inner}>
            {/* eyebrowDark: --accent-text on this dark band was 2.64:1 (bug class 4). */}
            <p className={styles.eyebrowDark}>מחירים</p>
            <h1 className={styles.h1}>המחיר של האירוע שלכם. בדיוק.</h1>
            <p className={styles.lede}>
              בוחרים כמה מוזמנים — ורואים כמה זה עולה. בלי מחירים כלליים, בלי תוספות
              בהמשך ובלי לחשב לבד.
            </p>
          </div>
        </section>

        <section className={styles.pick}>
          <div className={styles.inner}>
            <PackagePicker initial={300} />
          </div>
        </section>

        {/* The full contents, one block per package — every line is a claim
            checked against the code in src/data/pricing.js. */}
        <section className={styles.detail} id="whats-inside">
          <div className={styles.inner}>
            <h2 className={[styles.h2, styles.center].join(" ")}>מה בדיוק נכנס בכל חבילה</h2>
            <p className={[styles.small, styles.footnote].join(" ")}>{PRICING_FOOTNOTE}</p>
            {PLANS.map(plan => (
              <details key={plan.key} className={styles.detailPlan} open={plan.key === "event"}>
                <summary>
                  <span className={styles.detailName}>{plan.name}</span>
                  <span className={styles.detailPrice}>{plan.price}</span>
                </summary>
                {plan.inherits && <p className={styles.inherits}>{plan.inherits}</p>}
                <div className={styles.detailGrid}>
                  {plan.groups.map(group => (
                    <div key={group.title} className={styles.group}>
                      <h3 className={styles.groupTitle}>{group.title}</h3>
                      <ul className={styles.groupList}>
                        {group.items.map(text => <li key={text}><span aria-hidden="true">✓</span>{text}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.free}>
          <div className={[styles.inner, styles.freeGrid].join(" ")}>
            <div>
              <p className={styles.eyebrow}>עוד לא בטוחים?</p>
              <h2 className={styles.h2}>מתחילים בחינם, ורק אחר כך מחליטים</h2>
              <p className={styles.text}>{FREE_PACKAGE.lead}. בונים את הרשימה, שולחים את האישורים ורואים את ההושבה עובדת — וכשתרצו שהכל יקרה לבד, משדרגים.</p>
              <Link to="/app" className={styles.btnPrimary}>{FREE_PACKAGE.cta} ←</Link>
            </div>
            <article className={styles.freeCard}>
              <div className={styles.freeHead}><h3>{FREE_PACKAGE.name}</h3><span>{FREE_PACKAGE.price}</span></div>
              <ul className={styles.lines}>
                {FREE_PACKAGE.lines.map(l => (
                  <li key={l.t} className={l.ok ? styles.yes : styles.no}>
                    <span aria-hidden="true">{l.ok ? "✓" : "✕"}</span>
                    <span>{!l.ok && <span className="sr-only">לא כלול: </span>}{l.t}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className={styles.human} id="human">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>אנשים באירוע</p>
            <h2 className={styles.h2}>מה שדורש מישהו בדלת — בהצעת מחיר</h2>
            <p className={styles.text}>
              את כל השאר עושים לבד, מהטלפון. שירות שבו מישהו שלנו מגיע לאירוע מתומחר
              לפי האולם, התאריך וכמות האורחים. גם אירוע של יותר מ-{GUESTS_MAX.toLocaleString("en-US")} מוזמנים — דברו איתנו.
            </p>
            <div className={styles.humanGrid}>
              {HUMAN_SERVICES.map(h => (
                <div key={h.title} className={styles.humanItem}>
                  <SectionMark name={h.mark} size={28} />
                  <h3>{h.title}</h3>
                  <p>{h.body}</p>
                </div>
              ))}
            </div>
            <a href={quoteHref()} className={styles.btnPrimary} target="_blank" rel="noreferrer">בקשת הצעת מחיר בוואטסאפ ←</a>
          </div>
        </section>

        <section className={styles.faq}>
          <div className={styles.inner}>
            <h2 className={[styles.h2, styles.center].join(" ")}>שאלות שכולם שואלים</h2>
            <div className={styles.faqList}>
              {FAQ.map(f => (
                <details key={f.q} className={styles.faqItem}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
            <p className={styles.small}>
              אפשר לבטל בתוך 14 יום — הפרטים ב<Link to="/refunds">מדיניות הביטול וההחזרים</Link>.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
