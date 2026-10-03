import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { COMPANY } from "../../data/company.js";
import { liveServices } from "../../data/services.js";
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

/* Landing-page sections, still linked while the six service pages are being
 * built. They go as the pages replace them — "תכונות" and "איך זה עובד" are
 * headings of a document rather than things a host searches for, which is the
 * whole reason 87 exists. The last one leaves with service page 6. */
const SECTIONS = [
  { id: "features", label: "תכונות" },
  { id: "how",      label: "איך זה עובד" },
];

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
  const onLanding = pathname === "/" || pathname === "/home";

  /* Only services whose page exists. While there are few they sit in the bar;
     the `השירותים ▾` dropdown arrives with the third, which is the point at
     which a flat bar of six labels plus מחירים stops fitting. The flag keeps
     its own slot either way — see the note in src/data/services.js. */
  const live = liveServices();

  /** A section link, in whichever of its two forms this page needs. */
  const section = ({ id, label }, className, onClick) =>
    onLanding ? (
      <a key={id} href={`#${id}`} className={className} onClick={onClick}>{label}</a>
    ) : (
      <Link key={id} to={`/home#${id}`} className={className} onClick={onClick}>{label}</Link>
    );

  const pricingClass = [styles.navLink, active === "pricing" && styles.navLinkActive]
    .filter(Boolean).join(" ");

  /* Signed in, the pair of guest actions is wrong — "התחילו חינם" to someone who
     already started. /home is reachable while signed in (the topbar links to
     it), and it used to show exactly that. */
  const actions = user ? (
    <Link to="/app" className={styles.navCta}>כניסה לאפליקציה</Link>
  ) : (
    <>
      <Link to="/login" className={styles.navLoginBtn}>כניסה</Link>
      <Link to="/signup" className={styles.navCta}>התחילו חינם</Link>
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
        <Link to="/" className={styles.navLogo}>
          <span className={styles.navLogoMark} aria-hidden="true">✦</span>
          <span className={styles.navLogoName}>{COMPANY.name}</span>
        </Link>

        <div className={styles.navLinks}>
          {live.map(s => (
            <Link key={s.id} to={s.path}
              className={[styles.navLink, active === s.id && styles.navLinkActive].filter(Boolean).join(" ")}>
              {s.label}
            </Link>
          ))}
          {SECTIONS.map(s => section(s, styles.navLink))}
          <Link to="/pricing" className={pricingClass}>מחירים</Link>
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
        <div className={styles.mobileMenu}>
          {live.map(s => (
            <Link key={s.id} to={s.path} className={styles.mobileLink} onClick={closeMenu}>{s.label}</Link>
          ))}
          {SECTIONS.map(s => section(s, styles.mobileLink, closeMenu))}
          <Link to="/pricing" className={styles.mobileLink} onClick={closeMenu}>מחירים</Link>
          {user ? (
            <Link to="/app" className={styles.mobileMenuCta} onClick={closeMenu}>כניסה לאפליקציה ←</Link>
          ) : (
            <>
              <Link to="/login" className={styles.mobileLink} onClick={closeMenu}>כניסה</Link>
              <Link to="/signup" className={styles.mobileMenuCta} onClick={closeMenu}>התחילו חינם ←</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
