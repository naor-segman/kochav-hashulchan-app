import { Link } from "react-router-dom";
import SiteHeader from "../components/layout/SiteHeader.jsx";
import Footer from "../components/layout/Footer.jsx";
import styles from "./PricingScreen.module.css";
import { PLANS, ADDONS, PRICING_FOOTNOTE } from "../data/pricing.js";

/**
 * The pricing page. Checklist 31.
 *
 * Every number and every feature line comes from `src/data/pricing.js`, which
 * also carries the reasoning for the model. This file is layout only — if you
 * are here to change a price or a bullet, you are in the wrong file.
 *
 * ── What this replaced, and why none of it survived ─────────────────────────
 * The previous version sold ₪0 / ₪99 לחודש / בהתאמה as a SUBSCRIPTION, which
 * contradicts the decision on record (a couple has one wedding, so the price is
 * per event and one-time). Its three tiers carried an almost identical feature
 * list — the only real differences were two numeric caps — so there was nothing
 * to buy. "הושבה אוטומטית" appeared in all three including free, which gives
 * away the one thing the paid tier exists for. And a "הכי פופולרי" badge sat on
 * a product with no customers, which is the same unearned claim as the invented
 * statistics that were removed from the landing page.
 *
 * ── The beta note is gone, deliberately ─────────────────────────────────────
 * "בתקופת הבטא כל התוכניות פתוחות ללא תשלום" was correct and load-bearing while
 * nothing could be bought. It cannot stay on a page that asks for ₪690: a page
 * that quotes a price and then says everything is free is not a pricing page.
 * It comes back only if the prices come down again.
 */

/* The prices in the answers come from PLANS, not from a second copy of the
   number. Two of them were typed by hand in this file — "₪690 לאירוע" and
   "בחבילה של ₪1,290" — in the same file whose header says that if you are here
   to change a price you are in the wrong file. Change pricing.js and the FAQ
   followed the card nowhere. */
const EVENT_PRICE  = PLANS[1].price;
const ONSITE_PRICE = PLANS[2].price;

const FAQ = [
  {
    q: "זה תשלום חודשי?",
    a: "לא. תשלום אחד לאירוע, פעם אחת. לזוג יש חתונה אחת — אין סיבה שתשלמו עליה כל חודש. אחרי האירוע הרשימה וההושבה נשארות אצלכם. תמונות אתר האירוע נמחקות 30 יום אחרי האירוע.",
  },
  {
    q: "המחיר משתנה לפי מספר האורחים?",
    a: `לא. ${EVENT_PRICE} לאירוע, בין אם הזמנתם מאה אנשים ובין אם שש מאות. אין תוספת לרשומה ואין תקרה שצריך לשמור עליה.`,
  },
  {
    q: "מה באמת מקבלים בחינם?",
    a: "אישורי הגעה, אתר לאירוע, הזמנה דיגיטלית ורשימת אורחים בלי הגבלה — וגם הושבה אוטומטית עד 200 איש כדי לראות איך זה עובד. מה שבתשלום הוא ההושבה בלי תקרה, אילוצי ישיבה, מפת האולם, ההדפסות ועמדת הכניסה.",
  },
  {
    q: "מתי משלמים?",
    a: "כשאתם מחליטים. אפשר לבנות את כל הרשימה, לשלוח אישורי הגעה ולהקים את האתר בחינם, ולשדרג רק כשמגיעים לסידור השולחנות.",
  },
  {
    q: "איך האורחים מאשרים הגעה?",
    a: "כל אירוע מקבל קישור לדף אישורי הגעה. שולחים אותו בוואטסאפ, האורח עונה בלי להירשם ובלי להוריד כלום — והתשובה נכנסת לרשימה שלכם לבד.",
  },
  {
    /* This answer used to say "האורחים יכולים לתת מתנה בכרטיס אשראי" and the app
       does no such thing: GiftScreen has a name, an amount and a blessing — no
       card field, no clearing call — `submit_gift_by_token` writes paid = false
       and nothing ever flips it, and the guest's own confirmation screen says
       the gift itself is given on the day. /services/gifts on this same site
       already said that, so the site gave two answers and the false one was on
       the page with the price. The clearing arrangement is real and stays — as
       what it is: arranged with us, not a button in the app. */
    q: "מה קורה עם המתנות?",
    a: "באפליקציה האורח מצהיר על המתנה וכותב ברכה. הברכות עולות לקיר ברכות שמוקרן על מסך באולם — בלי סכומים — ואצלכם נשמרת רשימה של מי בירך ומה. הכסף עצמו עובר ביום האירוע. סליקה בכרטיס אשראי היא הסדר נפרד שאנחנו מסדרים איתכם מראש, ולא משהו שקורה דרך האתר.",
  },
  {
    q: `מי עומד בכניסה בחבילה של ${ONSITE_PRICE}?`,
    a: "מנהל הושבה מטעמנו, לאורך כל קבלת הפנים. הוא בונה איתכם את ההושבה לפני האירוע, מגיע עם התרשים וכרטיסי השם מודפסים, ומטפל בשינויים במקום.",
  },
  {
    q: "הנתונים שלי מוגנים?",
    a: "הנתונים נשמרים גם במכשיר שלכם וגם בענן, וההעברה מוצפנת. אנחנו לא מוכרים מידע לצד שלישי. אפשר בכל רגע להוריד הכל לאקסל, וגם למחוק את העותק המקומי מהמכשיר.",
  },
];

export default function PricingScreen({ user }) {
  return (
    <div className={styles.root}>
      <SiteHeader user={user} active="pricing" />

      {/* ── Header ── */}
      <section className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <span className={styles.headerTag}>מחירים</span>
          <h1 className={styles.headerTitle}>תשלום אחד לאירוע</h1>
          <p className={styles.headerSub}>
            מתחילים חינם — רשימה, אתר ואישורי הגעה. משלמים רק כשמגיעים לסידור השולחנות.
          </p>
        </div>
      </section>

      {/* ── Plans ──
          Source order is free → ₪690 → ₪1,290, which is what a screen reader and
          a phone get. The grid reverses it on a wide screen so the paid tier
          lands under the reader's eye first in RTL — see the stylesheet. */}
      <section className={styles.plansSection}>
        <div className={styles.plansInner}>
          <div className={styles.plansGrid}>
            {PLANS.map(plan => (
              <div
                key={plan.key}
                className={[styles.planCard, plan.highlight && styles.planCardPro].filter(Boolean).join(" ")}
              >
                <div className={styles.planHeader}>
                  {/* h2, not a div. The group titles below are h3, so a plain
                      div here made the page jump h1 → h3 — a skipped level, the
                      exact thing qa/servicePages.mjs checks for on every other
                      marketing page. /pricing was simply not in its route list;
                      it is now. */}
                  <h2 className={styles.planName}>{plan.name}</h2>
                  <p className={styles.planDesc}>{plan.desc}</p>
                </div>

                <div className={styles.planPrice}>
                  <span className={styles.planNum}>{plan.price}</span>
                  {/* Two separate elements, and the separator is a space, not a
                      slash. "₪690/לאירוע" is the shape bug class 7 reverses. */}
                  {plan.per && <span className={styles.planPer}>{plan.per}</span>}
                </div>
                {plan.note && <p className={styles.planNote}>{plan.note}</p>}

                {/* The card carries the HEADINGS only. The full contents are one
                    section down.

                    They were in the card at first, and it did not survive being
                    looked at: the grid stretches all three to equal height, the
                    free tier holds 38 bullets and the on-site tier holds 5, so
                    the ₪1,290 card came out as a 2,664-pixel column of white
                    space with a price at the top. A pricing card's job is to be
                    compared with the two beside it, and forty bullets is not a
                    comparison — it is a document. */}
                {plan.inherits && <p className={styles.planInherits}>{plan.inherits}</p>}
                <ul className={styles.planSummary}>
                  {plan.groups.map(group => (
                    <li key={group.title} className={styles.planFeature}>
                      <span className={styles.planFeatureIcon} aria-hidden="true">✓</span>
                      <span>
                        {group.title}
                        {/* The one honest label that has to travel with the
                            line: delivered by a person, through Unica, not by
                            the software. Never colour alone. */}
                        {group.human && <span className={styles.planHuman}>בשטח</span>}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* LAST in the card, and that is load-bearing. `.planCta` carries
                    `margin-top: auto` so the three buttons line up as a row no
                    matter how much text sits above them — the stylesheet records
                    that they once sat at 1114 / 1193 / 1206 and that it is the
                    most-noticed misalignment on a pricing table. Putting the
                    button above the summary list broke exactly that again:
                    measured 745 / 875 / 1125. Anything added below it will too. */}
                <Link
                  to={plan.ctaTo}
                  className={[styles.planCta, plan.highlight && styles.planCtaPro].filter(Boolean).join(" ")}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          <p className={styles.footnote}>{PRICING_FOOTNOTE}</p>

          {/* ── Add-ons ──
              Below the table and not inside it, on purpose: these scale with
              people rather than with software, and folding them into a tier is
              how a package ends up priced under what it costs to deliver. */}
          <div className={styles.addons}>
            <h2 className={styles.addonsTitle}>תוספות</h2>
            <div className={styles.addonsGrid}>
              {ADDONS.map(a => (
                <div key={a.title} className={styles.addonCard}>
                  <div className={styles.addonHead}>
                    <h3 className={styles.addonTitle}>{a.title}</h3>
                    <span className={styles.addonPrice}>{a.price}</span>
                  </div>
                  <p className={styles.addonNote}>{a.note}</p>
                  <p className={styles.addonBody}>{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── What is actually in each package ──
          The full lists, below the cards rather than inside them. One block per
          tier, headings that continue the page's h2/h3 ladder. */}
      <section className={styles.detailSection} id="whats-inside">
        <div className={styles.detailInner}>
          <h2 className={styles.detailHeading}>מה בדיוק נכנס בכל חבילה</h2>
          {PLANS.map(plan => (
            <div key={plan.key} className={styles.detailPlan}>
              <div className={styles.detailPlanHead}>
                <h3 className={styles.detailPlanName}>{plan.name}</h3>
                <span className={styles.detailPlanPrice}>{plan.price}</span>
              </div>
              {plan.inherits && <p className={styles.detailInherits}>{plan.inherits}</p>}
              <div className={styles.detailGrid}>
                {plan.groups.map(group => (
                  <div key={group.title} className={styles.planGroup}>
                    <h4 className={styles.planGroupTitle}>
                      {group.title}
                      {group.human && <span className={styles.planHuman}>בשטח</span>}
                    </h4>
                    <ul className={styles.planFeatures}>
                      {group.items.map(text => (
                        <li key={text} className={styles.planFeature}>
                          <span className={styles.planFeatureIcon} aria-hidden="true">✓</span>
                          <span>{text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
          <p className={styles.ctaSub}>פותחים אירוע חינם, בלי כרטיס אשראי</p>
          <Link to="/signup" className={styles.ctaBtn}>מתחילים חינם ←</Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
