import { useState, useEffect } from "react";
import SiteHeader from "../components/layout/SiteHeader.jsx";
import { Link, useLocation } from "react-router-dom";
import Footer from "../components/layout/Footer.jsx";
import TableGlyph from "../components/ui/TableGlyph.jsx";
import styles from "./LandingScreen.module.css";
import { contactMailto } from "../data/company.js";
import SectionMark from "../components/ui/SectionMark.jsx";
import { MOCK_TABLES, MOCK_SEATED, MOCK_GUESTS } from "../data/landingMock.js";
import { liveServices } from "../data/services.js";

// Four claims a visitor can check for themselves inside the product. They
// replaced four invented statistics — a new product does not have real numbers
// yet, and unverifiable ones cost more trust than they buy.
const TRUST = [
  /* "לייצא הכל לאקסל" was not true. There are exactly three xlsx exports —
     the guest list, תוכנית ההושבה and the shared table — and none of them is
     everything: משימות, תקציב, ספקים, הודעות, כרטיסי שם, אישורי הגעה, מתנות
     and the album do not export at all. The claim is now the three that do. */
  { icon: "cloud",   title: "הנתונים שלכם, שלכם",
    desc: "נשמר אצלכם בדפדפן ומסונכרן לענן. רשימת האורחים, תוכנית ההושבה והטבלה המשותפת יורדות לאקסל בכל רגע." },
  /* ⚠️ THE CLAIM THAT WAS FALSE, AND THE ICON THAT PROVED IT.
     This card used to read "עובד גם בלי רשת · באולם עם קליטה גרועה האפליקציה
     ממשיכה לעבוד" and it was illustrated with the `checkin` glyph — i.e. with
     the ONE screen for which it is false. The host's own device is genuinely
     offline-capable (localStorage). The GREETER's link is not: hostess_data_by_token
     and hostess_mark_arrival_by_token are bare RPCs, read and write, and
     retryQueue.js has exactly one consumer and it is useCollabSync. Without a
     connection the greeter gets a connection error and a failed tick is
     DISCARDED. The sentence was worded around the exact scenario where the
     relevant half does not work. WORKPLAN row א2. */
  { icon: "cloud",   title: "המכשיר שלכם עובד גם בלי רשת",
    desc: "האירוע נשמר בדפדפן שלכם, אז עריכה בלי קליטה ממשיכה לעבוד ומסתנכרנת אחר כך. הקישור של הדיילת צריך רשת." },
  /* "מקישור אחד" was false: shareLinks.js defines eight guest links over three
     different tokens. RSVP and gift are simply different URLs. */
  { icon: "site",   title: "האורחים לא צריכים חשבון",
    desc: "אישור הגעה, הזמנה ומתנה נפתחים מקישור בוואטסאפ — בלי הרשמה ובלי אפליקציה." },
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
    /* "נשמרים תמיד" was overstated and the engine says so itself: seating.js
       builds a violations[] array with together/apart/capacity entries, and
       deliberately takes a MINIMAL violation when a cluster cannot fit. What is
       true — and better — is that it tells you. "ולמה" was removed outright:
       the unassigned list names WHO, and the only reason it ever gives is the
       generic "הוסיפו מקומות נוספים". */
    points:  ["אילוץ שלא הסתדר מסומן לכם, ולא נבלע",
              "שולחן נעול נשאר בדיוק כפי שסידרתם",
              "אם מישהו לא נכנס — רואים בדיוק מי"],
    img: "/shots/seating.jpg",
    /* 117 was the seed's TOTAL seats; what the picture actually renders is
       96/96 over 14 tables with 0 violations. Read off the pixels, 11.9. */
    alt: "מסך סידור ההושבה אחרי הרצה — 96 מתוך 96 מקומות שובצו ב-14 שולחנות, אפס הפרות",
  },
  {
    eyebrow: "רשימת האורחים",
    title:   "מדביקים רשימה, מקבלים אירוע",
    /* "כפילויות מתמזגות" was false. importReview.js flags a duplicate with a
       warn chip reading "כבר ברשימה" and says outright that a duplicate has
       never been a block; the only removal is the host clicking the row away.
       Nothing merges — and flagging before the import is the better behaviour
       anyway, so the sentence now describes it. */
    body:    "הדביקו רשימה מוואטסאפ או מגיליון — השמות והטלפונים נקראים לבד, כפילויות מסומנות לפני שהן נכנסות, ואישורי ההגעה נכנסים לרשימה אוטומטית.",
    points:  ["צד, קבוצה, כמות מקומות ומנה לכל שורה",
              "טבלה שיתופית שההורים ממלאים בעצמם",
              "מעקב אחרי מי אישר, מי סירב ומי עוד שותק"],
    img: "/shots/guests.jpg",
    /* Not "מסוננת" — all three filters in the shot read "כל ה…". */
    alt: "מסך ניהול האורחים — 58 רשומות עם צד, קבוצה, מספר מקומות ואישור הגעה",
  },
  {
    eyebrow: "ביום האירוע",
    title:   "בכניסה, בלי דפים",
    /* Two removals here.
       "אפשר גם לסרוק את הקוד שעל ההזמנה" — isScanSupported() gates on
       "BarcodeDetector" in window, so the button does not exist on an iPhone,
       and an iPhone is most of the room at an Israeli wedding. A scan also
       marks the WHOLE row rather than the person it identified.
       "רישום מתנות תוך כדי" — that field was DELETED from this screen on
       purpose (a greeter cannot know what is in an envelope), and nothing in
       src/ writes giftAmount. It advertised a feature the product removed. */
    body:    "מחפשים אורח בשם, רואים את השולחן שלו ומסמנים הגעה. גם מי שהגיע עם חצי מהמשפחה.",
    /* "חי" was false: the greeter's phone re-reads every 25 seconds and the
       owner's screen does not poll or subscribe at all. Per SEAT is the true
       half and it is the one that matters — arrivedSeats is per person. */
    points:  ["מונה הגעה לפי מקומות, לא לפי שורות",
              "קישור נפרד לדיילת — בלי גישה לשאר האירוע",
              "כרטיסי שם ומפת אולם להדפסה"],
    img: "/shots/checkin.jpg",
    /* Re-shot 11.9 — the previous file showed an empty search box and
       "0 מתוך 96". This alt is read off the new pixels. */
    alt: "עמדת הכניסה באמצע האירוע — חיפוש שם מחזיר שלושה אורחים, לכל אחד מספר השולחן שלו וכפתור סימון הגעה, מעליהם מונה 58 מתוך 96",
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

/* This WAS a hand-written array of six features, and it was the page's oldest
 * problem rather than one of its claims.
 *
 * It derived from nothing, so the product walked away from it: sixteen screens
 * exist and that array named six, with משימות, תקציב, ספקים, הודעות and
 * כרטיסי שם appearing nowhere on the home page at all. WORKPLAN 87 opens on
 * exactly this — "במוצר 16 מסכים, דף הבית מפרסם 6, וההדר 0". It also carried
 * two claims that were not true: "תצוגה חזותית מושלמת" is puffery, and the
 * section's own subtitle promised "רשימה שיודעת כמה שולחנות צריך", which
 * nothing computes — the venue sizes the tables and the app never recommends a
 * number.
 *
 * It is now `liveServices()`: the same six headings the header, the dropdown
 * and the six landing pages use, from src/data/services.js. A seventh service
 * is one entry there and appears here on its own.
 *
 * And the cards are LINKS. Six landing pages were built to be found in search,
 * and the page most visitors actually land on linked to none of them — the
 * footer's whole "מוצר" column pointed back into two anchors of this same page.
 */

/* Read once at module scope — liveServices() filters a frozen array. */
const SERVICE_CARDS = liveServices();

const HOW_IT_WORKS = [
  { num: "01", title: "צרו אירוע", desc: "בחרו סוג אירוע, הזינו תאריך ומקום" },
  { num: "02", title: "הוסיפו אורחים", desc: "שלחו קישור למשפחה שתמלא יחד, הדביקו רשימה, או הוסיפו ידנית" },
  { num: "03", title: "בנו שולחנות", desc: "הגדירו מספר מקומות וצורת ישיבה לכל שולחן" },
  { num: "04", title: "הגדירו אילוצים", desc: "מי ישב יחד, מי חייב להיות בנפרד" },
  { num: "05", title: "סדרו בלחיצה", desc: "המערכת משבצת את כולם, ואומרת לכם אם משהו לא הסתדר" },
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
    /* "תמיכה מועדפת" was here and on no other surface. There is no support-tier
       mechanism anywhere in src/ — one WhatsApp button and one mailto, identical
       for every plan — and PricingScreen, the page a buyer would actually check,
       does not list it. Replaced with a line that is on both. */
    features: [
      "עד 20 אירועים",
      "עד 500 אורחים לאירוע",
      "טבלה שיתופית ואתר לאירוע",
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
    /* "SLA ותמיכה ייעודית" — same problem, same fix. No SLA exists, and
       PricingScreen's Enterprise column has no such line. */
    features: [
      "אירועים ואורחים ללא הגבלה",
      "ליווי בהקמה ובאירוע הראשון",
    ],
    cta: "צרו קשר",
    // `null`, and resolved at render below. The address used to be baked into
    // this module-level constant, which is evaluated once at import — so the
    // whole point of centralising it (change one line, everything follows)
    // would have been defeated by a value frozen before `COMPANY` is read.
    ctaHref: null,
    highlight: false,
    external: true,
  },
];

export default function LandingScreen({ user = null }) {
  // ── Arriving with a #hash ───────────────────────────────────────────────────
  //
  // The browser's own hash scrolling does not work on this page, and only
  // measuring finds that out: loading /#features fresh leaves scrollY at 0 while
  // the section sits at y=3320. The browser looks for the element while parsing
  // the HTML shell, long before React has rendered anything, finds nothing, and
  // never tries again.
  //
  // So every link into a section was broken for EVERY visitor, not only for the
  // signed-in ones who got redirected to /app — "תכונות" and "איך זה עובד" in
  // the pricing nav and in the footer simply dropped you at the top of the page.
  //
  // Keyed on `key` as well as `hash`, and both are load-bearing:
  //
  //   hash — a footer link clicked while already on this page changes the hash
  //          without remounting anything.
  //   key  — react-router mints a new one PER NAVIGATION. Without it, clicking
  //          the same anchor twice was a dead click: the second click produces
  //          a new location object carrying the identical hash string, the
  //          dependency array does not change, and nothing scrolls. Measured:
  //          first click landed at y=3324, scroll back to 0, second click left
  //          it at 0.
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!hash) return;
    // decodeURIComponent throws URIError on a lone `%` — and a throw in an
    // effect reaches the root ErrorBoundary, so `/home#50%` white-screened the
    // PUBLIC MARKETING PAGE with "אירעה שגיאה בלתי צפויה". Measured before this
    // guard on all of `#50%`, `#%E0` and `#utm_x%`. That is one mangled or
    // tracking-suffixed link away from being what a visitor sees.
    //
    // The decode itself was added for a Hebrew id that does not exist yet, so
    // the raw hash is the right fallback: it is what the browser would have
    // matched anyway.
    let id;
    try { id = decodeURIComponent(hash.slice(1)); }
    catch { id = hash.slice(1); }
    // Two frames, not zero: the section sits below the hero, whose height
    // settles after its media lays out. Scrolling immediately lands short.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    return () => cancelAnimationFrame(raf);
  }, [hash, key]);

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
      {/* `user` was not passed, and /home IS reachable while signed in (the
          topbar links to it) — so a signed-in visitor was shown "כניסה" and
          "התחילו חינם", the exact pair SiteHeader branches on `user` to avoid.
          PricingScreen has always passed it. */}
      <SiteHeader user={user} />

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
            <p className={styles.heroNote}>ללא כרטיס אשראי · המסלול החינמי נשאר חינמי</p>
          </div>
          <div className={styles.heroVisual} aria-hidden="true">
            <div className={styles.mockCard}>
              <div className={styles.mockCardHead}>
                <span className={styles.mockCardMark}>✦</span>
                <span className={styles.mockCardTitle}>תוכנית ישיבה</span>
                <span className={styles.mockCardStat}>{MOCK_GUESTS} אורחים</span>
              </div>
              <div className={styles.mockTables}>
                {MOCK_TABLES.map(t => (
                  <div key={t.name} className={styles.mockTable}>
                    <TableGlyph shape={t.shape} capacity={t.total} taken={t.filled} size={54} />
                    <span className={styles.mockTableLabel}>{t.name}</span>
                  </div>
                ))}
              </div>
              <div className={styles.mockCardFoot}>
                <span className={styles.mockCardFootBadge}>✓ {MOCK_SEATED} מתוך {MOCK_GUESTS} אורחים סודרו</span>
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
                {/* The files are 2400×1520. Declaring 1200×720 reserved a box of
                    the WRONG SHAPE while they load, which is the layout shift
                    these attributes exist to prevent — `height: auto` in the
                    stylesheet kept it from distorting and hid the mistake. */}
                <img className={styles.shotImg} src={sc.img} alt={sc.alt}
                     loading="lazy" width="2400" height="1520" />
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
                product in this category. This says what the reader stops doing.
                The old subtitle promised "רשימה שיודעת כמה שולחנות צריך" —
                nothing derives a table count from a headcount, and the venue is
                the one who decides it. */}
            <span className={styles.sectionTag}>מה נכנס למקום אחד</span>
            <h2 className={styles.sectionTitle}>הכל מדבר עם הכל</h2>
            <p className={styles.sectionSub}>
              אישור הגעה שנכנס לרשימה לבד, רשימה שיודעת מי באמת מגיע,
              והושבה שמחושבת לפיה
            </p>
          </div>
          <div className={styles.featuresGrid}>
            {SERVICE_CARDS.map((sv, i) => (
              <Link key={sv.id} to={sv.path}
                    className={[styles.featureCard, styles.featureLink].join(" ")}>
                <div className={styles.featureIconWrap}>
                  {/* Every third badge sits on the ink ground, where an ink hairline is
                      invisible — the same "measured against the wrong ground" trap the
                      hostess chips hit. Those get the mark's onDark tone. */}
                  <SectionMark
                    name={sv.mark}
                    size={28}
                    tone={i % 3 === 2 ? "ondark" : "brand"}
                    className={styles.featureIcon}
                  />
                </div>
                <h3 className={styles.featureTitle}>{sv.label}</h3>
                <p className={styles.featureDesc}>{sv.blurb}</p>
                <span className={styles.featureMore}>לפרטים ←</span>
              </Link>
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
              מרשימה מפוזרת לתוכנית ישיבה<br />ב-5 צעדים
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
                  <a href={plan.ctaHref ?? contactMailto()} className={[styles.planCta, plan.highlight && styles.planCtaPro].filter(Boolean).join(" ")}>
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
          {/* "ביטול בכל עת" described a subscription that cannot be entered —
              stripe.js throws without a key and the account screen says
              "ניהול חיוב יהיה זמין בקרוב". Nothing to cancel, so nothing to
              promise about cancelling. */}
          <p className={styles.ctaNote}>ללא כרטיס אשראי · האירוע נשאר שלכם</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
