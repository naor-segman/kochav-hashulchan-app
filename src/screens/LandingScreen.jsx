import { Link } from "react-router-dom";
import Footer from "../components/layout/Footer.jsx";
import styles from "./LandingScreen.module.css";

// Clean line icons (stroke = currentColor) — replaces emoji so the page reads
// as one designed system rather than a template.
const I = (paths) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
);
const ICONS = {
  seating: I(<><circle cx="12" cy="12" r="4" /><circle cx="12" cy="3.5" r="1.4" /><circle cx="12" cy="20.5" r="1.4" /><circle cx="3.5" cy="12" r="1.4" /><circle cx="20.5" cy="12" r="1.4" /></>),
  guests:  I(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" /><path d="M17 14.2A5.5 5.5 0 0 1 20.5 19" /></>),
  plan:    I(<><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M3.5 9.5h17M9.5 9.5v11" /></>),
  checkin: I(<><path d="M20 7 10 17l-5-5" /></>),
  pages:   I(<><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></>),
  cloud:   I(<><path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17.5 11 3.5 3.5 0 0 1 17 18Z" /></>),
};

const FEATURES = [
  { icon: "seating", title: "הושבה אוטומטית",
    desc: "אלגוריתם חכם שמסדר את כל האורחים תוך שניות, תוך שמירה על כל האילוצים שהגדרתם" },
  { icon: "guests", title: "ניהול אורחים",
    desc: "ייבוא מאקסל, הוספה ידנית, מעקב אישורי הגעה לפי קבוצות — הכל בממשק אחד נוח" },
  { icon: "plan", title: "תכנית מגרש",
    desc: "גררו שולחנות על תמונת האולם ותקבלו תצוגה חזותית מושלמת של הסידור" },
  { icon: "checkin", title: "צ׳ק-אין ביום האירוע",
    desc: "מצאו כל אורח בשניות וראו את מספר השולחן שלו — מצב מושלם לכניסה לאולם" },
  { icon: "pages", title: "דפי אורח דיגיטליים",
    desc: "הזמנה, אישור הגעה, מתנה וברכות — קישור אישי לכל אירוע שנשלח לאורחים בקליק" },
  { icon: "cloud", title: "סנכרון ענן",
    desc: "גישה מכל מכשיר, שמירה אוטומטית — עבדו מהמחשב, המשיכו מהטלפון" },
];

const HOW_IT_WORKS = [
  { num: "01", title: "צרו אירוע", desc: "בחרו סוג אירוע, הזינו תאריך ומקום" },
  { num: "02", title: "הוסיפו אורחים", desc: "ייבאו מאקסל, הוסיפו ידנית, קבלו אישורי הגעה" },
  { num: "03", title: "בנו שולחנות", desc: "הגדירו מספר מקומות וצורת ישיבה לכל שולחן" },
  { num: "04", title: "הגדירו אילוצים", desc: "מי ישב יחד, מי חייב להיות בנפרד" },
  { num: "05", title: "סדרו בלחיצה", desc: "קבלו תוכנית ישיבה מושלמת תוך שניות" },
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
    cta: "התחילו חינם",
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
      "ייצוא PDF וסידור מפורט",
      "תמיכה מועדפת",
    ],
    cta: "התחילו חינם",
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
    cta: "צרו קשר",
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
            <Link to="/signup" className={styles.navCta}>התחילו חינם</Link>
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
        <div className={styles.heroLayout}>
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
              <Link to="/signup" className={styles.heroCta}>התחילו חינם ←</Link>
              <a href="#how" className={styles.heroSecondary}>ראו איך זה עובד</a>
            </div>
            <p className={styles.heroNote}>ללא כרטיס אשראי · ניסיון חינם לכל החיים</p>
          </div>
          <div className={styles.heroVisual} aria-hidden="true">
            <div className={styles.mockCard}>
              <div className={styles.mockCardHead}>
                <span className={styles.mockCardMark}>✦</span>
                <span className={styles.mockCardTitle}>תוכנית ישיבה</span>
                <span className={styles.mockCardStat}>58 אורחים</span>
              </div>
              <div className={styles.mockTables}>
                {[
                  { name: "שולחן 1",   total: 10, filled: 10 },
                  { name: "שולחן 2",   total: 8,  filled: 7  },
                  { name: "שולחן 3",   total: 10, filled: 9  },
                  { name: "שולחן 4",   total: 8,  filled: 8  },
                  { name: "שולחן 5",   total: 10, filled: 6  },
                  { name: "שולחן VIP", total: 8,  filled: 8  },
                ].map(t => (
                  <div key={t.name} className={styles.mockTable}>
                    <div className={styles.mockTableDots}>
                      {Array.from({ length: t.total }).map((_, i) => (
                        <span
                          key={i}
                          className={i < t.filled ? styles.mockDotFull : styles.mockDotEmpty}
                        />
                      ))}
                    </div>
                    <span className={styles.mockTableLabel}>{t.name}</span>
                  </div>
                ))}
              </div>
              <div className={styles.mockCardFoot}>
                <span className={styles.mockCardFootBadge}>✓ 48 מתוך 54 אורחים סודרו</span>
              </div>
            </div>
          </div>
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
                  <span className={styles.featureIcon}>{ICONS[f.icon]}</span>
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
            <p className={styles.sectionSub}>התחילו חינם, שדרגו כשצריך</p>
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
          <h2 className={styles.ctaTitle}>מוכנים להתחיל?</h2>
          <p className={styles.ctaSub}>
            הצטרפו לאלפי מארגנים שכבר חסכו שעות של עבודה
          </p>
          <Link to="/signup" className={styles.ctaBtn}>הצטרפו חינם עכשיו ←</Link>
          <p className={styles.ctaNote}>ללא כרטיס אשראי · ביטול בכל עת</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
