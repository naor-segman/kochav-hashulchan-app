import { Link } from "react-router-dom";
import Footer from "../components/layout/Footer.jsx";
import styles from "./PricingScreen.module.css";

const PLANS = [
  {
    key: "free",
    name: "חינמי",
    nameEn: "Free",
    price: "₪0",
    per: "/ לנצח",
    desc: "מושלם לחתונה אחת או אירוע ראשון",
    features: [
      { text: "אירוע 1", included: true },
      { text: "עד 80 אורחים", included: true },
      { text: "הושבה אוטומטית", included: true },
      { text: "ניהול אורחים מלא", included: true },
      { text: "ייצוא לאקסל", included: true },
      { text: "תכנית מגרש (floor plan)", included: true },
      { text: "צ׳ק-אין ביום האירוע", included: true },
      { text: "דפי אורח: אישורי הגעה, הזמנה, מתנות", included: true },
      { text: "סנכרון וגיבוי בענן", included: true },
      { text: "ייצוא PDF מפורט", included: false },
    ],
    cta: "התחילו חינם",
    ctaTo: "/signup",
    highlight: false,
  },
  {
    key: "pro",
    name: "מקצועי",
    nameEn: "Pro",
    price: "₪99",
    per: "/ חודש",
    desc: "לזוגות ומשפחות עם ציפיות גבוהות",
    badge: "הכי פופולרי",
    features: [
      { text: "עד 20 אירועים", included: true },
      { text: "עד 500 אורחים לאירוע", included: true },
      { text: "הושבה אוטומטית", included: true },
      { text: "ניהול אורחים מלא", included: true },
      { text: "ייצוא לאקסל", included: true },
      { text: "תכנית מגרש (floor plan)", included: true },
      { text: "צ׳ק-אין ביום האירוע", included: true },
      { text: "דפי אורח: אישורי הגעה, הזמנה, מתנות", included: true },
      { text: "סנכרון וגיבוי בענן", included: true },
      { text: "ייצוא PDF מפורט", included: true },
    ],
    cta: "שדרגו עכשיו",
    ctaTo: "/signup",
    highlight: true,
  },
  {
    key: "enterprise",
    name: "ארגוני",
    nameEn: "Enterprise",
    price: "בהתאמה",
    per: "",
    desc: "לאולמות אירועים, מארגנים ורשתות",
    features: [
      { text: "אירועים ואורחים ללא הגבלה", included: true },
      { text: "הושבה אוטומטית", included: true },
      { text: "ניהול אורחים מלא", included: true },
      { text: "ייצוא לאקסל", included: true },
      { text: "תכנית מגרש (floor plan)", included: true },
      { text: "צ׳ק-אין ביום האירוע", included: true },
      { text: "ייצוא PDF מפורט", included: true },
      { text: "דפי אורח: אישורי הגעה, הזמנה, מתנות", included: true },
      { text: "הושבה חכמה מבוססת AI", included: true },
      { text: "שיתוף פעולה בצוות", included: true },
    ],
    cta: "צרו קשר",
    ctaHref: "mailto:contact@kochav-hashulchan.co.il",
    highlight: false,
    external: true,
  },
];

const FAQ = [
  {
    q: "האם יש חוזה מחייב?",
    a: "לא. ניתן לבטל בכל עת, ללא קנסות ותוספות. אנחנו מאמינים שצריך להרוויח את הלקוח כל חודש מחדש.",
  },
  {
    q: "איך האורחים מאשרים הגעה?",
    a: "כל אירוע מקבל קישור אישי לדף אישורי הגעה. שולחים אותו לאורחים בווטסאפ, הם עונים בקליק — והתשובות מתעדכנות אצלכם במערכת ומזינות את סידורי ההושבה.",
  },
  {
    q: "האם הנתונים שלי מוגנים?",
    a: "כן. הנתונים מוצפנים ומאוחסנים בשרתים מאובטחים. אנחנו לא מוכרים נתונים לצדדים שלישיים ולעולם לא.",
  },
  {
    q: "מה קורה אם עברתי את מגבלת האורחים?",
    a: "המערכת תודיע לכם ותציע שדרוג. לא יימחקו לכם נתונים — כל האורחים הקיימים ישמרו.",
  },
  {
    q: "האם ניתן לייבא נתונים מאקסל?",
    a: "כן, בכל התוכניות. ניתן לייבא רשימת אורחים מקובץ Excel (XLSX) בלחיצה אחת.",
  },
];

export default function PricingScreen({ user }) {
  return (
    <div className={styles.root}>
      {/* ── Nav ── */}
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link to="/" className={styles.navLogo}>
            <span className={styles.navLogoMark}>✦</span>
            <span className={styles.navLogoName}>כוכב השולחן</span>
          </Link>
          <div className={styles.navLinks}>
            <Link to="/#features" className={styles.navLink}>תכונות</Link>
            <Link to="/#how" className={styles.navLink}>איך זה עובד</Link>
            <Link to="/pricing" className={[styles.navLink, styles.navLinkActive].join(" ")}>מחירים</Link>
          </div>
          <div className={styles.navActions}>
            {user ? (
              <Link to="/app" className={styles.navCta}>כניסה לאפליקציה</Link>
            ) : (
              <>
                <Link to="/login" className={styles.navLoginBtn}>כניסה</Link>
                <Link to="/signup" className={styles.navCta}>התחילו חינם</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Header ── */}
      <section className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <span className={styles.headerTag}>מחירים</span>
          <h1 className={styles.headerTitle}>שקוף, פשוט, הוגן</h1>
          <p className={styles.headerSub}>
            התחילו חינם — ללא כרטיס אשראי. שדרגו רק כשאתם צריכים יותר.
          </p>
        </div>
      </section>

      {/* ── Plans ── */}
      <section className={styles.plansSection}>
        <div className={styles.plansInner}>
          <div className={styles.plansGrid}>
            {PLANS.map(plan => (
              <div
                key={plan.key}
                className={[styles.planCard, plan.highlight && styles.planCardPro].filter(Boolean).join(" ")}
              >
                {plan.badge && <div className={styles.planBadge}>{plan.badge}</div>}
                <div className={styles.planHeader}>
                  <div className={styles.planName}>{plan.name}</div>
                  <p className={styles.planDesc}>{plan.desc}</p>
                </div>
                <div className={styles.planPrice}>
                  <span className={styles.planNum}>{plan.price}</span>
                  {plan.per && <span className={styles.planPer}>{plan.per}</span>}
                </div>
                <ul className={styles.planFeatures}>
                  {plan.features.map(f => (
                    <li key={f.text} className={[styles.planFeature, !f.included && styles.planFeatureNo].join(" ")}>
                      <span className={styles.planFeatureIcon}>{f.included ? "✓" : "—"}</span>
                      {f.text}
                    </li>
                  ))}
                </ul>
                {plan.external ? (
                  <a
                    href={plan.ctaHref}
                    className={[styles.planCta, plan.highlight && styles.planCtaPro].filter(Boolean).join(" ")}
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <Link
                    to={plan.ctaTo}
                    className={[styles.planCta, plan.highlight && styles.planCtaPro].filter(Boolean).join(" ")}
                  >
                    {plan.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className={styles.faqSection}>
        <div className={styles.faqInner}>
          <div className={styles.faqHeader}>
            <span className={styles.faqTag}>שאלות נפוצות</span>
            <h2 className={styles.faqTitle}>יש לכם שאלות? יש לנו תשובות</h2>
          </div>
          <div className={styles.faqGrid}>
            {FAQ.map(item => (
              <div key={item.q} className={styles.faqCard}>
                <h3 className={styles.faqQ}>{item.q}</h3>
                <p className={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={styles.ctaBanner}>
        <div className={styles.ctaInner}>
          <span className={styles.ctaStar} aria-hidden="true">✦</span>
          <h2 className={styles.ctaTitle}>מוכנים להתחיל?</h2>
          <p className={styles.ctaSub}>הצטרפו חינם עוד היום — ללא כרטיס אשראי</p>
          <Link to="/signup" className={styles.ctaBtn}>הצטרפו חינם ←</Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
