import { Link } from "react-router-dom";
import Footer from "../components/layout/Footer.jsx";
import styles from "./LandingScreen.module.css";

const FEATURES = [
  {
    icon: "✦",
    title: "הושבה אוטומטית",
    desc: "אלגוריתם חכם שמסדר את כל האורחים תוך שניות, תוך שמירה על כל האילוצים שהגדרת",
  },
  {
    icon: "📋",
    title: "ניהול אורחים",
    desc: "ייבוא מאקסל, הוספה ידנית, מעקב אישורי הגעה לפי קבוצות — הכל בממשק אחד נוח",
  },
  {
    icon: "🗺",
    title: "תכנית מגרש",
    desc: "גרור שולחנות על תמונת האולם ותקבל תצוגה חזותית מושלמת של הסידור",
  },
  {
    icon: "✅",
    title: "צ׳ק-אין ביום האירוע",
    desc: "מצא כל אורח בשניות וראה את מספר השולחן שלו — מצב מלופית מושלם לכניסה לאולם",
  },
  {
    icon: "📱",
    title: "WhatsApp ו-SMS",
    desc: "שלח אישורי הגעה, תזכורות ומספרי שולחן אוטומטיים ישירות לנייד של כל אורח",
  },
  {
    icon: "☁",
    title: "סנכרון ענן",
    desc: "גישה מכל מכשיר, שמירה אוטומטית — עבוד מהמחשב, המשך מהטלפון",
  },
];

const HOW_IT_WORKS = [
  { num: "01", title: "צור אירוע", desc: "בחר סוג אירוע, הזן תאריך ומקום" },
  { num: "02", title: "הוסף אורחים", desc: "ייבא מאקסל, הוסף ידנית, קבל אישורי הגעה" },
  { num: "03", title: "בנה שולחנות", desc: "הגדר מספר מקומות וצורת ישיבה לכל שולחן" },
  { num: "04", title: "הגדר אילוצים", desc: "מי ישב יחד, מי חייב להיות בנפרד" },
  { num: "05", title: "סדר בלחיצה", desc: "קבל תוכנית ישיבה מושלמת תוך שניות" },
];

const TESTIMONIALS = [
  {
    name: "שירה לוי",
    role: "מארגנת אירועים",
    text: "חסכתי 6 שעות עבודה על סידור השולחנות. הכלי הכי שימושי שיש לי היום.",
  },
  {
    name: "דוד כהן",
    role: "הורה לחתן",
    text: "ניהלנו 350 אורחים בקלות מדהימה. כל הקידוד של משפחות ואורחים VIP עבד מצוין.",
  },
  {
    name: "מיכל ברק",
    role: "מנהלת אולם אירועים",
    text: "אנחנו משתמשים בזה לכל אירוע. הלקוחות שלנו מתרשמים מהרמה המקצועית.",
  },
];

const PRICING_PLANS = [
  {
    key: "free",
    name: "חינמי",
    price: "₪0",
    per: "/ לנצח",
    features: ["אירוע 1", "עד 80 אורחים", "הושבה אוטומטית", "ייצוא לאקסל"],
    cta: "התחל חינם",
    ctaHref: "/signup",
    highlight: false,
  },
  {
    key: "pro",
    name: "מקצועי",
    price: "₪99",
    per: "/ חודש",
    badge: "הכי פופולרי",
    features: [
      "עד 20 אירועים",
      "עד 500 אורחים לאירוע",
      "WhatsApp ו-SMS אוטומטיים",
      "ייצוא PDF וסידור מפורט",
      "תמיכה מועדפת",
    ],
    cta: "שדרג עכשיו",
    ctaHref: "/signup",
    highlight: true,
  },
  {
    key: "enterprise",
    name: "ארגוני",
    price: "בהתאמה",
    per: "",
    features: [
      "אירועים ואורחים ללא הגבלה",
      "הושבה חכמה מבוססת AI",
      "שיתוף פעולה בצוות",
      "SLA ותמיכה ייעודית",
    ],
    cta: "צור קשר",
    ctaHref: "mailto:contact@kochav-hashulchan.co.il",
    highlight: false,
    external: true,
  },
];

export default function LandingScreen() {
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
            <a href="#features" className={styles.navLink}>תכונות</a>
            <a href="#how" className={styles.navLink}>איך זה עובד</a>
            <Link to="/pricing" className={styles.navLink}>מחירים</Link>
          </div>

          <div className={styles.navActions}>
            <Link to="/login" className={styles.navLoginBtn}>כניסה</Link>
            <Link to="/signup" className={styles.navCta}>התחל חינם</Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroDecor} aria-hidden="true">
          <span className={styles.decorOrb1} />
          <span className={styles.decorOrb2} />
          <span className={styles.decorStar1}>✦</span>
          <span className={styles.decorStar2}>✦</span>
        </div>
        <div className={styles.heroInner}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeDot} />
            הפלטפורמה המובילה לסידור הושבה בישראל
          </div>
          <h1 className={styles.heroHeadline}>
            כל האורחים<br />
            <span className={styles.heroGold}>במקום הנכון</span>
          </h1>
          <p className={styles.heroSub}>
            סידור הושבה אוטומטי, ניהול אורחים חכם, אישורי הגעה בוואטסאפ —
            הכל במקום אחד, לאירוע שתמיד חלמתם עליו
          </p>
          <div className={styles.heroActions}>
            <Link to="/signup" className={styles.heroCta}>התחל חינם ←</Link>
            <a href="#how" className={styles.heroSecondary}>ראה איך זה עובד</a>
          </div>
          <p className={styles.heroNote}>ללא כרטיס אשראי · ניסיון חינם לכל החיים</p>
        </div>
      </section>

      {/* ── Stats ── */}
      <div className={styles.statsBar}>
        <div className={styles.statsInner}>
          {[
            { num: "10,000+", label: "אירועים מנוהלים" },
            { num: "500,000+", label: "אורחים סודרו" },
            { num: "4.9 ★", label: "דירוג ממוצע" },
            { num: "6 שעות", label: "נחסכות לאירוע" },
          ].map((s, i) => (
            <div key={s.label} className={styles.statItem}>
              {i > 0 && <div className={styles.statDivider} />}
              <span className={styles.statNum}>{s.num}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section className={styles.features} id="features">
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>מה יש בפנים</span>
            <h2 className={styles.sectionTitle}>כל מה שצריך לאירוע מושלם</h2>
            <p className={styles.sectionSub}>
              פלטפורמה מלאה שמחליפה מסמכי Excel, וואטסאפ קבוצתי, ורשימות נייר
            </p>
          </div>
          <div className={styles.featuresGrid}>
            {FEATURES.map(f => (
              <div key={f.title} className={styles.featureCard}>
                <div className={styles.featureIconWrap}>
                  <span className={styles.featureIcon}>{f.icon}</span>
                </div>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className={styles.howSection} id="how">
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTagLight}>תהליך פשוט</span>
            <h2 className={styles.sectionTitleLight}>
              מ-0 לתוכנית ישיבה מושלמת<br />ב-5 צעדים
            </h2>
          </div>
          <div className={styles.howGrid}>
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.num} className={styles.howStep}>
                <div className={styles.howNum}>{step.num}</div>
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className={styles.howConnector} aria-hidden="true" />
                )}
                <h3 className={styles.howTitle}>{step.title}</h3>
                <p className={styles.howDesc}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className={styles.testimonials}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>מה הלקוחות אומרים</span>
            <h2 className={styles.sectionTitle}>אלפי זוגות ומשפחות כבר בחרו בנו</h2>
          </div>
          <div className={styles.testGrid}>
            {TESTIMONIALS.map(t => (
              <div key={t.name} className={styles.testCard}>
                <div className={styles.testStars}>★★★★★</div>
                <p className={styles.testQuote}>&ldquo;{t.text}&rdquo;</p>
                <div className={styles.testMeta}>
                  <div className={styles.testAvatar}>{t.name[0]}</div>
                  <div>
                    <div className={styles.testName}>{t.name}</div>
                    <div className={styles.testRole}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ── */}
      <section className={styles.pricingSection}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>מחירים</span>
            <h2 className={styles.sectionTitle}>תוכנית לכל צורך</h2>
            <p className={styles.sectionSub}>התחל חינם, שדרג כשצריך</p>
          </div>

          <div className={styles.pricingGrid}>
            {PRICING_PLANS.map(plan => (
              <div
                key={plan.key}
                className={[styles.pricingCard, plan.highlight && styles.pricingCardPro].filter(Boolean).join(" ")}
              >
                {plan.badge && <div className={styles.planBadge}>{plan.badge}</div>}
                <div className={styles.planName}>{plan.name}</div>
                <div className={styles.planPriceRow}>
                  <span className={styles.planNum}>{plan.price}</span>
                  {plan.per && <span className={styles.planPer}>{plan.per}</span>}
                </div>
                <ul className={styles.planFeatures}>
                  {plan.features.map(f => <li key={f}>{f}</li>)}
                </ul>
                {plan.external ? (
                  <a href={plan.ctaHref} className={[styles.planCta, plan.highlight && styles.planCtaPro].filter(Boolean).join(" ")}>
                    {plan.cta}
                  </a>
                ) : (
                  <Link to={plan.ctaHref} className={[styles.planCta, plan.highlight && styles.planCtaPro].filter(Boolean).join(" ")}>
                    {plan.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>

          <div className={styles.pricingFooter}>
            <Link to="/pricing" className={styles.pricingMoreLink}>
              השוואת תוכניות מלאה ←
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA banner ── */}
      <section className={styles.ctaBanner}>
        <div className={styles.ctaBannerInner}>
          <div className={styles.ctaStar} aria-hidden="true">✦</div>
          <h2 className={styles.ctaTitle}>מוכן להתחיל?</h2>
          <p className={styles.ctaSub}>
            הצטרף לאלפי מארגנים שכבר חסכו שעות של עבודה
          </p>
          <Link to="/signup" className={styles.ctaBtn}>הצטרף חינם עכשיו ←</Link>
          <p className={styles.ctaNote}>ללא כרטיס אשראי · ביטול בכל עת</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
