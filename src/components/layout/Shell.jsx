import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { computeViolations } from "../../logic/seating.js";
import { useAuth } from "../../hooks/useAuth.js";
import { SYNC_STATUS } from "../../utils/cloudSync.js";
import { AREAS, areaOfScreen, areaLanding } from "../../data/eventAreas.js";
import NavBadge from "../navigation/NavBadge.jsx";
import SectionMark from "../ui/SectionMark.jsx";
import styles from "./Shell.module.css";
import Icon from "../ui/Icon.jsx";

// ── Two tiers, because there are two questions ────────────────────────────────
//
// The rail used to carry all fourteen tools at once. That is not a menu, it is
// an inventory: nothing on it said which four things belong together, which are
// due this month and which are only opened at the door — and on a phone a host
// always saw the same first four whichever screen they were actually on.
//
// Tier 1 (on the dark chrome, because it is STRUCTURE) — the three areas.
// Tier 2 (the white rail, because it is CONTENT)      — only that area's screens.
//
// Nothing here hard-codes a route list any more; `data/eventAreas.js` is the
// single source of truth, so a screen that gets renamed or added is one edit.
// A screen id the model does not know about simply shows no active tab rather
// than throwing — other people are renaming routes in parallel.

export default function Shell({ screen, activeEvent, go, children, syncStatus, showToast }) {
  const { user, loading: authLoading } = useAuth();
  const isHub   = screen === "hub";
  const inEvent = !!activeEvent && screen !== "dashboard";
  const area    = areaOfScreen(screen);

  const violationCount = useMemo(() => {
    if (!activeEvent) return 0;
    return computeViolations(
      activeEvent.guests, activeEvent.tables,
      activeEvent.constraints, activeEvent.seating
    ).length;
  }, [activeEvent]);

  const stepDone = (id) => {
    if (!activeEvent) return false;
    if (id === "setup")   return !!activeEvent.name;
    if (id === "site")    return !!activeEvent.eventSite?.enabled;
    if (id === "tables")  return activeEvent.tables.length > 0;
    if (id === "guests")  return activeEvent.guests.length > 0;
    if (id === "rsvps")   return activeEvent.guests.some(g => g.rsvp === "confirmed" || g.rsvp === "declined" || g.rsvp === "maybe");
    if (id === "seating") return Object.keys(activeEvent.seating).length > 0;
    return false;
  };

  const showAutoSave = inEvent && !isHub && screen !== "setup";

  // ── The tool rail ──────────────────────────────────────────────────────
  // It never scrolled: scrollLeft was 0 on every screen, so at 1024 the active
  // tab sat at left −323 / right −232 (entirely off-screen) and at 390 it was
  // ~900px past the edge. With one area's items on it the rail now fits at most
  // widths, but the centring stays — it is what makes the seventh item on a
  // phone reachable.
  const subnavRef = useRef(null);

  // Written straight to the DOM rather than through state: this is a
  // scroll-position readout, not application state, and it fires on every
  // scroll frame. `none` when the rail fits, so a rail with nothing hidden is
  // never faded.
  const syncNavFade = useCallback(() => {
    const sc = subnavRef.current;
    if (!sc) return;
    const max = sc.scrollWidth - sc.clientWidth;
    if (max <= 1) { sc.dataset.fade = "none"; return; }
    // Chrome reports RTL scrollLeft as 0 → −max; other engines as 0 → max.
    const off = Math.abs(sc.scrollLeft);
    sc.dataset.fade = off <= 1 ? "end" : off >= max - 1 ? "start" : "both";
  }, []);

  useLayoutEffect(() => {
    const sc = subnavRef.current;
    const btn = sc?.querySelector(`[data-nav="${screen}"]`);
    if (!sc || !btn) return;
    const scBox = sc.getBoundingClientRect();
    const bBox  = btn.getBoundingClientRect();
    // Delta from measured boxes, so this is correct in RTL without caring how
    // the engine signs scrollLeft.
    const delta = (bBox.left - scBox.left) - (sc.clientWidth - bBox.width) / 2;
    // reset.css sets `html { scroll-behavior: smooth }`. That property is not
    // inherited, but state it anyway: putting the active tool on screen is not
    // a movement the host asked for, and it must not animate.
    sc.scrollBy({ left: delta, behavior: "auto" });
    syncNavFade();
  }, [screen, inEvent, syncNavFade]);

  useEffect(() => {
    const sc = subnavRef.current;
    if (!sc) return;
    sc.addEventListener("scroll", syncNavFade, { passive: true });
    window.addEventListener("resize", syncNavFade);
    return () => {
      sc.removeEventListener("scroll", syncNavFade);
      window.removeEventListener("resize", syncNavFade);
    };
  }, [area, inEvent, syncNavFade]);

  // A tool is only reachable once the event has a name — the whole product
  // keys off it. The start screen now collects it before the event exists, so
  // this is a backstop for older drafts, not the normal path.
  const openScreen = (id) => {
    if (id !== "setup" && !activeEvent?.name?.trim()) {
      showToast?.("יש להזין שם לאירוע לפני המשך", "err");
      go("setup");
      return;
    }
    go(id);
  };

  return (
    <div className={styles.root}>
      <header className={styles.topbar}>
        <button className={styles.logo} onClick={() => go("dashboard")}>
          <span className={styles.logoMark}>✦</span>
          <span className={styles.logoName}>כוכב השולחן</span>
          <span className={styles.betaBadge}>בטא</span>
        </button>

        {inEvent && (
          <div className={styles.breadcrumb}>
            {/* The label is a span so a phone can drop it. It was a bare text
                node holding this button at a flex-shrink:0 111px, which on every
                phone width left the event name beside it exactly 12px — its text
                overflowed the collapsed box, rendered underneath the header's
                own buttons, and was invisible. Measured at 360/390/430: name box
                12px, name text 125px, first legible at 768. The arrow alone
                still says "back", and which event you are in is the more useful
                of the two. */}
            <button className={styles.bcBack} onClick={() => go("dashboard")}
                    aria-label="כל האירועים">
              <Icon name="arrowRight" size={14} />
              <span className={styles.bcBackLabel}>כל האירועים</span>
            </button>
            <span className={styles.bcSep}>/</span>
            {/* The event name is the way back to its own map. It used to be
                inert text, so the only way out of a screen was the browser. */}
            {isHub ? (
              <span className={styles.bcCurrent}>{activeEvent.name || "אירוע חדש"}</span>
            ) : (
              <button className={styles.bcCurrentLink} onClick={() => go("hub")}>
                {/* The ellipsis lives on an INNER span. Putting overflow:hidden
                    on the button itself clipped its own 44px tap pseudo-element,
                    so the control measured 28px on every event screen — the
                    exact trap the .bcBack comment at the bottom of the
                    stylesheet already documents, re-entered from a new angle. */}
                <span className={styles.bcCurrentText}>{activeEvent.name || "אירוע חדש"}</span>
              </button>
            )}
          </div>
        )}

        {showAutoSave && (
          <span className={[
            styles.autoSave,
            syncStatus === SYNC_STATUS.SYNCING ? styles.autoSaving  : null,
            syncStatus === SYNC_STATUS.ERROR   ? styles.autoSaveErr : null,
          ].filter(Boolean).join(" ")}>
            {syncStatus === SYNC_STATUS.SYNCING ? "שומר..." :
             syncStatus === SYNC_STATUS.ERROR   ? "שגיאה בשמירה" :
             syncStatus === SYNC_STATUS.SYNCED  ? <><Icon name="check" size={12} /> נשמר בענן</> :
             <><Icon name="check" size={12} /> נשמר</>}
          </span>
        )}

        <div className={styles.topRight}>
          {/* The wordmark goes to the event list, which is where a logged-in
              host wants to be nine times out of ten — but that left NO way back
              out to the public site short of typing the address, and "/" bounces
              a logged-in user straight back into the app. This is that way out. */}
          <Link to="/home" className={styles.homeBtn} title="לעמוד הבית של האתר">
            <Icon name="arrowRight" size={13} />
            <span className={styles.homeLabel}>עמוד הבית</span>
          </Link>

          {!authLoading && (
            user
              ? (
                <Link to="/account" className={styles.accountBtn} title={user.email}>
                  <span className={styles.accountIcon}><Icon name="users" size={15} /></span>
                  <span className={styles.accountLabel}>{user.email.split("@")[0]}</span>
                </Link>
              ) : (
                <Link to="/signup" className={styles.signupBtn}>
                  הצטרפו חינם
                </Link>
              )
          )}
        </div>
      </header>

      {/* ── Tier 1: the three areas, on the chrome ── */}
      {inEvent && (
        <nav className={styles.areaBar} aria-label="אזורי האירוע">
          <div className={styles.areaInner}>
            <button
              className={[styles.areaTab, isHub && styles.areaTabActive].filter(Boolean).join(" ")}
              onClick={() => go("hub")}
              aria-current={isHub ? "page" : undefined}
            >
              <span className={styles.areaLabel}>מפת האירוע</span>
              <span className={styles.areaLabelShort}>המפה</span>
            </button>
            {AREAS.map(a => {
              const isActive = area?.id === a.id;
              return (
                <button
                  key={a.id}
                  className={[styles.areaTab, isActive && styles.areaTabActive].filter(Boolean).join(" ")}
                  onClick={() => openScreen(areaLanding(a))}
                  aria-current={isActive ? "page" : undefined}
                  title={a.sub}
                >
                  <span className={styles.areaLabel}>{a.label}</span>
                  <span className={styles.areaLabelShort}>{a.short || a.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ── Tier 2: only the current area's screens ── */}
      {inEvent && area && (
        <nav className={styles.subnav} ref={subnavRef} data-fade="none" aria-label={area.label}>
          <div className={styles.subnavInner}>
            {area.items.map((n, i) => {
              const isActive = screen === n.id;
              const done     = stepDone(n.id);
              const showViol = n.id === "seating" && violationCount > 0;
              const firstTool = !n.num && !!area.items[i - 1]?.num;
              return (
                <button
                  key={n.id}
                  data-nav={n.id}
                  data-firsttool={firstTool ? "1" : undefined}
                  className={[styles.subnavBtn, isActive && styles.subnavActive].filter(Boolean).join(" ")}
                  onClick={() => openScreen(n.id)}
                >
                  {n.num ? (
                    <span className={[
                      styles.stepDot,
                      done && !isActive && styles.stepDotDone,
                      isActive && styles.stepDotActive,
                    ].filter(Boolean).join(" ")}>
                      {done && !isActive ? <Icon name="check" size={11} /> : n.num}
                    </span>
                  ) : (
                    <SectionMark name={n.mark} size={17} className={styles.navMark} />
                  )}
                  <span className={styles.subnavLabel}>{n.short || n.label}</span>
                  {n.id === "tables"      && activeEvent.tables.length > 0      && <NavBadge n={activeEvent.tables.length} />}
                  {n.id === "guests"      && activeEvent.guests.length > 0      && <NavBadge n={activeEvent.guests.length} />}
                  {n.id === "constraints" && activeEvent.constraints.length > 0 && <NavBadge n={activeEvent.constraints.length} />}
                  {showViol && <NavBadge n={violationCount} tone="danger" />}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <main className={styles.main}>{children}</main>
    </div>
  );
}
