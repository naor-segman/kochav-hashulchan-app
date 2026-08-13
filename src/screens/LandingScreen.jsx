import { useState } from "react";
import { Link } from "react-router-dom";
import Footer from "../components/layout/Footer.jsx";
import TableGlyph from "../components/ui/TableGlyph.jsx";
import styles from "./LandingScreen.module.css";
import SectionMark from "../components/ui/SectionMark.jsx";

// Four claims a visitor can check for themselves inside the product. They
// replaced four invented statistics — a new product does not have real numbers
// yet, and unverifiable ones cost more trust than they buy.
const TRUST = [
  { icon: "cloud",   title: "הנתונים שלכם, שלכם",
    desc: "נשמר אצלכם בדפדפן ומסונכרן לענן. אפשר לייצא הכל לאקסל בכל רגע." },
  { icon: "checkin", title: "עובד גם בלי רשת",
    desc: "באולם עם קליטה גרועה האפליקציה ממשיכה לעבוד, ומסתנכרנת כשחוזרת." },
  { icon: "site",   title: "האורחים לא צריכים חשבון",
    desc: "אישור הגעה, הזמנה ומתנה נפתחים מקישור אחד — בלי הרשמה ובלי אפליקציה." },
  { icon: "guests",  title: "בלי כרטיס אשראי",
    desc: "פותחים אירוע ובודקים אם זה מתאים לכם. אין תקופת ניסיון שנגמרת." },
];

// White → grey → blush. Three grounds in rotation, so scrolling reads as a
// composition rather than one long white page with rules between the parts.
const GROUND_KEYS = ["", "showcaseAlt", "showcaseBlush"];

const SHOWCASE = [
  {
    eyebrow: "הלב של המוצר",
    title:   "ההושבה נעשית לבד",
    body:    "מגדירים מי חייב לשבת יחד ומי בשום אופן לא — והאלגוריתם מסדר את כל האורחים תוך שניות, תוך כיבוד הקבוצות, הצדדים והקיבולת של כל שולחן.",
    points:  ["אילוצי \"יחד\" ו\"בנפרד\" נשמרים תמיד",
              "שולחן נעול נשאר בדיוק כפי שסידרתם",
              "אם מישהו לא נכנס — נאמר לכם בדיוק מי ולמה"],
    img: "/shots/seating.jpg",
    alt: "מסך סידור ההושבה — 14 שולחנות עם התפוסה של כל אחד, 117 מקומות שובצו ללא הפרות",
  },
  {
    eyebrow: "רשימת האורחים",
    title:   "מדביקים רשימה, מקבלים אירוע",
    body:    "הדביקו רשימה מוואטסאפ או מגיליון — השמות והטלפונים נקראים לבד, כפילויות מתמזגות, ואישורי ההגעה נכנסים לרשימה אוטומטית.",
    points:  ["צד, קבוצה, כמות מקומות ומנה לכל שורה",
              "טבלה שיתופית שההורים ממלאים בעצמם",
              "מעקב אחרי מי אישר, מי סירב ומי עוד שותק"],
    img: "/shots/guests.jpg",
    alt: "מסך ניהול האורחים — רשימה מסוננת של 58 רשומות עם צד, קבוצה, מספר מקומות ואישור הגעה",
  },
  {
    eyebrow: "ביום האירוע",
    title:   "בכניסה, בלי דפים",
    body:    "מחפשים אורח בשם או בטלפון, רואים את השולחן שלו ומסמנים הגעה. אפשר גם לסרוק את הקוד שעל ההזמנה.",
    points:  ["מונה הגעה חי לפי מקומות, לא לפי שורות",
              "קישור נפרד לדיילת — בלי גישה לשאר האירוע",
              "רישום מתנות תוך כדי"],
    img: "/shots/checkin.jpg",
    alt: "מסך הצ׳ק-אין ביום האירוע — חיפוש אורח בשם, מספר השולחן שלו וסימון הגעה, עם מונה 67 מתוך 117",
  },
];

/**
 * Full-bleed hero media.
 *
 * Both fields are null until there is real footage, and while they are null
 * the hero renders exactly as it did before — a flat ink panel. Name a file
 * here and the hero switches to the cinematic layout on its own: media behind,
 * scrim over it, headline and one button on top.
 *
 * The poster is not optional once there is a video. It is what a phone, a slow
 * connection, and anyone who asked their system for reduced motion actually
 * see, and it is the first frame everyone else sees while the video loads.
 *
 * Keep the subject off-centre-right: the text sits over the start (right) edge
 * in RTL, and a face directly behind the headline reads as a mistake.
 */
const HERO_MEDIA = {
  video:        "/hero/hero.mp4",
  poster:       "/hero/hero.jpg",
  // A phone's hero is TALL. Covering it from the landscape frame crops to a
  // narrow vertical slice of the middle, which throws away the chuppah and the
  // horizon — the two things that make the shot. The portrait crop of the same
  // moment is a separate file for that reason.
  posterMobile: "/hero/hero-portrait.jpg",
};

// The five places a guest list actually lives today. Written as a list of
// PLACES, not of problems, because the recognition has to be instant — anyone
// who has produced an event has all five open at once.
const PROBLEM = [
  { where: "גיליון אקסל",        what: "שמישהו אחר ערך, ואף אחד לא זוכר מתי" },
  { where: "קבוצת וואטסאפ",      what: "עם מאתיים הודעות ושלושה אישורים שאבדו בהן" },
  { where: "רשימה על נייר",      what: "שנמצאת בכניסה, ורק אצל מי שמחזיק אותה" },
  { where: "שיחות טלפון",        what: "לכל מי שלא ענה, פעמיים" },
  { where: "סידור על מפית",      what: "בשתיים בלילה, שבוע לפני" },
];

const FEATURES = [
  { icon: "seating", title: "הושבה אוטומטית",
    desc: "אלגוריתם חכם שמסדר את כל האורחים תוך שניות, תוך שמירה על כל האילוצים שהגדרתם" },
  { icon: "guests", title: "ניהול אורחים",
    desc: "טבלה שיתופית שהמשפחה ממלאת מהטלפון, הדבקת רשימה מוכנה, ומעקב אישורי הגעה לפי קבוצות" },
  { icon: "tables", title: "תכנית מגרש",
    desc: "גררו שולחנות על תמונת האולם ותקבלו תצוגה חזותית מושלמת של הסידור" },
  { icon: "checkin", title: "צ׳ק-אין ביום האירוע",
    desc: "מצאו כל אורח בשניות וראו את מספר השולחן שלו — מצב מושלם לכניסה לאולם" },
  { icon: "site", title: "דפי אורח דיגיטליים",
    desc: "הזמנה, אישור הגעה, מתנה וברכות — קישור אישי לכל אירוע שנשלח לאורחים בקליק" },
  { icon: "cloud", title: "סנכרון ענן",
    desc: "גישה מכל מכשיר, שמירה אוטומטית — עבדו מהמחשב, המשיכו מהטלפון" },
];

const HOW_IT_WORKS = [
  { num: "01", title: "צרו אירוע", desc: "בחרו סוג אירוע, הזינו תאריך ומקום" },
  { num: "02", title: "הוסיפו אורחים", desc: "שלחו קישור למשפחה שתמלא יחד, הדביקו רשימה, או הוסיפו ידנית" },
  { num: "03", title: "בנו שולחנות", desc: "הגדירו מספר מקומות וצורת ישיבה לכל שולחן" },
  { num: "04", title: "הגדירו אילוצים", desc: "מי ישב יחד, מי חייב להיות בנפרד" },
  { num: "05", title: "סדרו בלחיצה", desc: "קבלו תוכנית ישיבה מושלמת תוך שניות" },
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
      "SLA ותמיכה ייעודית",
    ],
    cta: "צרו קשר",
    ctaHref: "mailto:contact@kochav-hashulchan.co.il",
    highlight: false,
    external: true,
  },
];

export default function LandingScreen() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  const hasHeroMedia = Boolean(HERO_MEDIA.video || HERO_MEDIA.poster);
  // Decided once, in the initializer, rather than in an effect — an effect would
  // paint the video first and swap it out, which is the opposite of what someone
  // who asked for reduced motion wants. Phones get the still too: the hero is
  // the first thing on the page and a video is a slow way to say hello on 4G.
  const [stillOnly] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    // Was "any screen under 700px", which meant every phone in the world got
    // the still — including the owner's, who then could not find the video he
    // had just supplied. A phone is not a slow connection; most of them are on
    // wifi, and the clip is 2MB. Ask about the CONNECTION instead, which is the
    // thing that actually made the rule worth having.
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c && (c.saveData || /^(slow-)?2g$/.test(c.effectiveType || ""))) return true;
    return false;
  });

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

          <button
            type="button"
            className={styles.navBurger}
            aria-label={menuOpen ? "סגירת תפריט" : "פתיחת תפריט"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            <span className={[styles.burgerBar, menuOpen && styles.burgerBar1].filter(Boolean).join(" ")} />
            <span className={[styles.burgerBar, menuOpen && styles.burgerBar2].filter(Boolean).join(" ")} />
            <span className={[styles.burgerBar, menuOpen && styles.burgerBar3].filter(Boolean).join(" ")} />
          </button>
        </div>

        {menuOpen && (
          <div className={styles.mobileMenu}>
            <a href="#features" className={styles.mobileLink} onClick={closeMenu}>תכונות</a>
            <a href="#how" className={styles.mobileLink} onClick={closeMenu}>איך זה עובד</a>
            <Link to="/pricing" className={styles.mobileLink} onClick={closeMenu}>מחירים</Link>
            <Link to="/login" className={styles.mobileLink} onClick={closeMenu}>כניסה</Link>
            <Link to="/signup" className={styles.mobileMenuCta} onClick={closeMenu}>התחילו חינם ←</Link>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section className={[styles.hero, hasHeroMedia ? styles.heroCinematic : ""].filter(Boolean).join(" ")}>
        {hasHeroMedia ? (
          <div className={styles.heroMedia} aria-hidden="true">
            {HERO_MEDIA.video && !stillOnly ? (
              <video
                className={styles.heroMediaLayer}
                src={HERO_MEDIA.video}
                poster={HERO_MEDIA.poster || undefined}
                autoPlay muted loop playsInline preload="metadata"
              />
            ) : (
              <img
                className={styles.heroMediaLayer}
                src={stillOnly && HERO_MEDIA.posterMobile
                  ? HERO_MEDIA.posterMobile
                  : HERO_MEDIA.poster}
                alt=""
              />
            )}
            <div className={styles.heroScrim} />
          </div>
        ) : (
          <div className={styles.heroDecor} aria-hidden="true">
            <span className={styles.decorOrb1} />
            <span className={styles.decorOrb2} />
            <span className={styles.decorStar1}>✦</span>
            <span className={styles.decorStar2}>✦</span>
          </div>
        )}
        <div className={styles.heroLayout}>
          <div className={styles.heroInner}>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot} />
              כל ההפקה של האירוע במקום אחד
            </div>
            <h1 className={styles.heroHeadline}>
              כל האורחים<br />
              <span className={styles.heroGold}>במקום הנכון</span>
            </h1>
            {/* AIDA — Attention. The old line was a feature list, and a feature
                list is something the reader has to work through before they know
                whether it is for them. This says the thesis: one place instead of
                five, and the hard part solves itself. */}
            <p className={styles.heroSub}>
              אירוע אחד — לא חמישה ערוצים. רשימת האורחים, אישורי ההגעה
              וסידור השולחנות במקום אחד, וההושבה מסתדרת לבד.
            </p>
            <div className={styles.heroActions}>
              <Link to="/signup" className={styles.heroCta}>התחילו חינם ←</Link>
              {/* Over footage the page carries one button. The second route in
                  stays available as a quiet link rather than competing. */}
              <a href="#how" className={hasHeroMedia ? styles.heroQuietLink : styles.heroSecondary}>
                ראו איך זה עובד
              </a>
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
                  { name: "שולחן 1",   total: 10, filled: 10, shape: "round"  },
                  { name: "שולחן 2",   total: 8,  filled: 7,  shape: "square" },
                  { name: "שולחן 3",   total: 10, filled: 9,  shape: "round"  },
                  { name: "אביר",      total: 12, filled: 8,  shape: "rect"   },
                  { name: "שולחן 5",   total: 10, filled: 6,  shape: "round"  },
                  { name: "שולחן VIP", total: 8,  filled: 8,  shape: "oval"   },
                  // The mock used a flat row of dots per table — a picture of
                  // nothing in particular. These are the same glyphs the
                  // product actually draws, so the landing page shows the real
                  // thing rather than an illustration of it.
                ].map(t => (
                  <div key={t.name} className={styles.mockTable}>
                    <TableGlyph shape={t.shape} capacity={t.total} taken={t.filled} size={54} />
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

      {/* ── Trust band ──
          This replaced four invented statistics ("10,000+ אירועים", "4.9 ★").
          Numbers nobody can verify are the fastest way to lose the trust they
          are meant to buy — and a product this new does not have them yet.
          These four claims are all checkable inside the app. */}
      <div className={styles.trust}>
        <div className={styles.sectionInner}>
          <div className={styles.trustGrid}>
            {TRUST.map(t => (
              <div key={t.title} className={styles.trustItem}>
                <SectionMark name={t.icon} size={22} className={styles.trustChip} />
                <div>
                  <p className={styles.trustTitle}>{t.title}</p>
                  <p className={styles.trustDesc}>{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AIDA — Interest. The page went straight from the promise to the
          features, which asks the reader to recognise their own problem in a
          list of solutions. This names the problem first, in the words anyone
          who has produced an event would use, and it is the owner's own
          description of why he built this: everything in one place instead of
          working across several channels at once. */}
      <section className={styles.problem} id="problem">
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>למי שכבר הפיק אירוע</span>
            <h2 className={styles.sectionTitle}>הרשימה נמצאת בחמישה מקומות שונים</h2>
            <p className={styles.sectionSub}>
              וכל אחד מהם מעודכן ליום אחר
            </p>
          </div>
          <div className={styles.problemGrid}>
            {PROBLEM.map(p => (
              <div key={p.where} className={styles.problemItem}>
                <p className={styles.problemWhere}>{p.where}</p>
                <p className={styles.problemWhat}>{p.what}</p>
              </div>
            ))}
          </div>
          <p className={styles.problemTurn}>
            ואז מישהו מבטל שלושה ימים לפני, ומתחילים את סידור השולחנות מהתחלה.
          </p>
        </div>
      </section>

      {/* ── Product showcase — real screenshots of the running app ── */}
      {SHOWCASE.map((sc, i) => (
        <section key={sc.title}
                 className={[styles.showcase, styles[GROUND_KEYS[i % GROUND_KEYS.length]]]
                   .filter(Boolean).join(" ")}>
          {/* Decorative only — a flat diamond and a soft wash, alternating side
              so consecutive sections don't mirror each other. */}
          <span className={styles.gfxWash} aria-hidden="true"
                style={{ width: 380, height: 380, top: -110,
                         [i % 2 ? "insetInlineStart" : "insetInlineEnd"]: -130,
                         background: i % 2 ? "var(--blush)" : "var(--accent-bg)" }} />
          <span className={styles.gfxDiamond} aria-hidden="true"
                style={{ width: 116, height: 116, bottom: 60,
                         [i % 2 ? "insetInlineEnd" : "insetInlineStart"]: -40,
                         background: "rgba(var(--text-rgb), .05)" }} />
          <div className={styles.sectionInner}>
            <div className={styles.showcaseGrid}>
              <div className={styles.showcaseText}>
                <span className={styles.showcaseEyebrow}>{sc.eyebrow}</span>
                <h2 className={styles.showcaseTitle}>{sc.title}</h2>
                <p className={styles.showcaseBody}>{sc.body}</p>
                <ul className={styles.showcaseList}>
                  {sc.points.map(pt => (
                    <li key={pt}>
                      <span className={styles.showcaseTick} aria-hidden="true">✓</span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.shotFrame}>
                <span className={styles.shotPlinth} aria-hidden="true" />
                <img className={styles.shotImg} src={sc.img} alt={sc.alt}
                     loading="lazy" width="1200" height="720" />
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* ── Features ── */}
      <section className={styles.features} id="features">
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            {/* AIDA — Desire. "כל מה שצריך לאירוע מושלם" could sit on any
                product in this category. This says what the reader stops doing. */}
            <span className={styles.sectionTag}>מה נכנס למקום אחד</span>
            <h2 className={styles.sectionTitle}>הכל מדבר עם הכל</h2>
            <p className={styles.sectionSub}>
              אישור הגעה שנכנס לרשימה לבד, רשימה שיודעת כמה שולחנות צריך,
              ושולחנות שמסתדרים לפי מי שבאמת מגיע
            </p>
          </div>
          <div className={styles.featuresGrid}>
            {FEATURES.map((f, i) => (
              <div key={f.title} className={styles.featureCard}>
                <div className={styles.featureIconWrap}>
                  {/* Every third badge sits on the ink ground, where an ink hairline is
                      invisible — the same "measured against the wrong ground" trap the
                      hostess chips hit. Those get the mark's onDark tone. */}
                  <SectionMark
                    name={f.icon}
                    size={28}
                    tone={i % 3 === 2 ? "ondark" : "brand"}
                    className={styles.featureIcon}
                  />
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

      {/* ── Pricing teaser ── */}
      <section className={styles.pricingSection}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>מחירים</span>
            <h2 className={styles.sectionTitle}>תוכנית לכל צורך</h2>
            <p className={styles.sectionSub}>התחילו חינם, שדרגו כשצריך</p>
          </div>

          {/* The numbers on the cards describe the planned model, not what the
              app does today — nothing is capped while there is no way to pay.
              Saying so here keeps the page from advertising a limit a visitor
              will not actually meet. The pricing screen carries the same note. */}
          <p className={styles.betaNote}>
            בתקופת הבטא כל התוכניות פתוחות ללא תשלום — המגבלות שלמטה מתארות את המודל המתוכנן.
          </p>

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
          <h2 className={styles.ctaTitle}>האירוע הבא שלכם, בלי חמישה מקומות</h2>
          <p className={styles.ctaSub}>
            בלי התקנה ובלי כרטיס אשראי — נכנסים, מזינים אורחים, ומקבלים סידור.
          </p>
          <Link to="/signup" className={styles.ctaBtn}>הצטרפו חינם עכשיו ←</Link>
          <p className={styles.ctaNote}>ללא כרטיס אשראי · ביטול בכל עת</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
