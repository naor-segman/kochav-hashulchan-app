import { useState, useEffect, useRef, useId } from "react";
import { Link, useLocation } from "react-router-dom";
import { COMPANY } from "../../data/company.js";
import { liveServices, flagService, menuServices } from "../../data/services.js";
import styles from "./SiteHeader.module.css";

/**
 * The public marketing header. One component, every marketing page.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * There were TWO of it — LandingScreen and PricingScreen each rendered their
 * own <header>, and the CSS was copied wholesale between the two module sheets:
 * the same eight class names, ~185 lines, maintained by hand. That is bug class
 * 6 in CLAUDE.md, and it had already done what that bug class does:
 *
 *   • The hamburger existed only in the landing copy. The pricing sheet still
 *     carried the `@media (max-width: 600px)` rule that HIDES .navLinks and
 *     .navLoginBtn — so on a phone the pricing page's header was a logo and one
 *     button, with **no way to reach כניסה at all**. On the page that asks for
 *     money. A visitor with an account could not sign in from it.
 *   • `.navLinkActive` existed only in the pricing copy, so the landing page
 *     could never mark a current page even if it wanted to.
 *
 * Both are fixed by there being one of everything. The next divergence is now
 * impossible rather than merely unlikely.
 *
 * ── This commit is a REFACTOR, deliberately ─────────────────────────────────
 * The links are the same three, in the same order, with the same labels. The
 * six service pages of checklist 87 replace them one at a time, each in its own
 * commit, once the page behind the link actually exists. De-duplicating and
 * changing behaviour in one step is how a regression hides in a diff.
 *
 * ── The anchors ─────────────────────────────────────────────────────────────
 * `#features` and `#how` are sections of the landing page, so the link has to
 * be one of two different things and both are load-bearing:
 *
 *   on the landing page  → a bare <a href="#features">. It changes the hash in
 *                          place; LandingScreen's hash effect (keyed on `key`)
 *                          does the smooth scroll, because the browser's own
 *                          hash scrolling does not work there — it looks for
 *                          the element while parsing the shell, before React
 *                          has rendered anything, and never tries again.
 *   anywhere else        → <Link to="/home#features">, a real navigation.
 *
 * /home and not /, because / bounces a signed-in visitor to /app — the same
 * reason Footer.jsx gives.
 */

/* The bar (owner, 6.10): logo · השירותים ▾ · הזמנה לדוגמה · כמה זה עולה?
 * and, apart at the inline end, כניסה + הרשמה חינם. "תכונות" and "איך זה
 * עובד" left — headings of a document, not places a visitor looks for, and
 * they jumped the reader down the home page ("לא אוהב… ששולחים אותי מתחילת
 * האתר להמשך העמוד"). "מחירים" became the question the visitor is asking. */
const PRICING_LABEL = "כמה זה עולה?";

export default function SiteHeader({ user = null, active = null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const burgerRef = useRef(null);

  // Escape closes the phone menu and gives focus back to the button that
  // opened it (37f) — the event site's own menu already did.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      burgerRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const { pathname } = useLocation();

  /* Only services whose page exists. The `השירותים ▾` dropdown was meant to
     arrive with the third; it arrived with none, and with all six flat in the
     bar plus two section links and מחירים, seven labels broke onto two lines
     at 1024, 1280 AND 1440 — "אתר לאירוע / והזמנה" stacked in a 68px bar
     (audit 3.10, P2-1, measured with the real font in qa/siteHeader.mjs).
     The flag keeps its own slot — see the note in src/data/services.js; the
     other five sit behind one disclosure button. The phone menu, which has
     the room, still lists all six. */
  const live = liveServices();
  const flag = flagService();
  const inMenu = menuServices();

  const [servicesOpen, setServicesOpen] = useState(false);
  const servicesBtnRef = useRef(null);
  const servicesWrapRef = useRef(null);
  const servicesId = useId();

  // A disclosure, not an ARIA menu: a button that says whether it is open and
  // a plain list of links, reachable with Tab like the rest of the bar.
  // Escape closes and hands focus back; so does a click or a tap anywhere
  // else, and focus leaving the whole thing (tabbing past the last link).
  useEffect(() => {
    if (!servicesOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setServicesOpen(false);
      servicesBtnRef.current?.focus();
    };
    const onPointer = (e) => {
      if (!servicesWrapRef.current?.contains(e.target)) setServicesOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [servicesOpen]);

  // Following a link closes it — whichever way the route changed. Adjusting
  // state while rendering, keyed on the pathname (React's documented pattern
  // for "reset when a prop changes"), not an effect.
  const [openedOn, setOpenedOn] = useState(pathname);
  if (openedOn !== pathname) {
    setOpenedOn(pathname);
    setServicesOpen(false);
  }

  const closeServicesOnBlur = (e) => {
    if (!servicesWrapRef.current?.contains(e.relatedTarget)) setServicesOpen(false);
  };

  const pricingClass = [styles.navLink, active === "pricing" && styles.navLinkActive]
    .filter(Boolean).join(" ");

  /* Two clear doors, apart from the links (owner, 6.10: "כפתור של כניסה,
     כפתור של הרשמה בחינם"): an outlined כניסה and the filled הרשמה חינם.
     Signed in, one door back to their events — it said "כניסה לאפליקציה",
     and this is not an app (owner, 6.10). */
  const actions = user ? (
    <Link to="/app" className={styles.navCta}>לאירועים שלי</Link>
  ) : (
    <>
      <Link to="/login" className={styles.navLoginBtn}>כניסה</Link>
      <Link to="/signup" className={styles.navCta}>הרשמה חינם</Link>
    </>
  );

  /* Skip link (AX9, as Shell has). Up to eleven links sit in this bar before
     the page itself. Every page that renders this header puts its content in
     <main id="main" tabIndex={-1}> (38a); the link focuses it directly rather
     than following the hash, because the landing page's own hash effect would
     try to scroll to a section called "main". `preventScroll`: <main> starts
     right under this sticky bar, and a plain focus() scrolled it 69px up —
     the top of the hero went under the bar (measured). */
  const skipToMain = (e) => {
    e.preventDefault();
    document.getElementById("main")?.focus({ preventScroll: true });
  };

  return (
    <header className={styles.nav}>
      <a href="#main" className={styles.skipLink} onClick={skipToMain}>דלגו לתוכן</a>
      <div className={styles.navInner}>
        {/* closeMenu: "/" and "/home" render the same landing screen, so the
            header does not remount and the phone menu stayed open over the page
            after a tap on the logo (review 5.10). */}
        <Link to="/" className={styles.navLogo} onClick={closeMenu}>
          <span className={styles.navLogoMark} aria-hidden="true">✦</span>
          <span className={styles.navLogoName}>{COMPANY.name}</span>
        </Link>

        <div className={styles.navLinks}>
          {flag && (
            <Link to={flag.path}
              className={[styles.navLink, active === flag.id && styles.navLinkActive].filter(Boolean).join(" ")}>
              {flag.label}
            </Link>
          )}
          {inMenu.length > 0 && (
            <div className={styles.servicesWrap} ref={servicesWrapRef} onBlur={closeServicesOnBlur}>
              <button
                ref={servicesBtnRef}
                type="button"
                className={[styles.navLink, styles.servicesBtn,
                  inMenu.some(s => s.id === active) && styles.navLinkActive].filter(Boolean).join(" ")}
                aria-expanded={servicesOpen}
                aria-controls={servicesId}
                onClick={() => setServicesOpen(o => !o)}
              >
                השירותים <span className={styles.servicesCaret} aria-hidden="true">▾</span>
              </button>
              <ul id={servicesId} className={styles.servicesMenu} hidden={!servicesOpen}>
                {inMenu.map(s => (
                  <li key={s.id}>
                    <Link to={s.path} className={styles.servicesItem}
                      aria-current={active === s.id ? "page" : undefined}
                      onClick={() => setServicesOpen(false)}>
                      <span className={styles.servicesLabel}>{s.label}</span>
                      <span className={styles.servicesBlurb}>{s.blurb}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link to="/pricing" className={pricingClass}>{PRICING_LABEL}</Link>
        </div>

        <div className={styles.navActions}>{actions}</div>

        <button
          ref={burgerRef}
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
        // data-site-menu-open: the cookie sheet steps aside while this is open —
        // it covered the menu's last items on a phone (review 5.10).
        <div className={styles.mobileMenu} data-site-menu-open="">
          {live.map(s => (
            <Link key={s.id} to={s.path} className={styles.mobileLink} onClick={closeMenu}>{s.label}</Link>
          ))}
          <Link to="/pricing" className={styles.mobileLink} onClick={closeMenu}>{PRICING_LABEL}</Link>
          {user ? (
            <Link to="/app" className={styles.mobileMenuCta} onClick={closeMenu}>לאירועים שלי ←</Link>
          ) : (
            <>
              <Link to="/login" className={styles.mobileLink} onClick={closeMenu}>כניסה</Link>
              <Link to="/signup" className={styles.mobileMenuCta} onClick={closeMenu}>הרשמה חינם ←</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
