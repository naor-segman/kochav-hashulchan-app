import { useMemo } from "react";
import { Link } from "react-router-dom";
import { computeViolations } from "../../logic/seating.js";
import { useAuth } from "../../hooks/useAuth.js";
import { SYNC_STATUS } from "../../utils/cloudSync.js";
import NavBadge from "../navigation/NavBadge.jsx";
import SectionMark from "../ui/SectionMark.jsx";
import styles from "./Shell.module.css";
import Icon from "../ui/Icon.jsx";

// 5 numbered core steps (the build spine) + un-numbered tools, so the nav
// matches the "שלב X מתוך 5" badges the screens show.
// The five numbered steps keep their number — a number carries an order, and
// the order is the whole point of the spine. The tools have no order, so their
// dot said "•", which carried nothing at all; each now shows its own section
// mark instead. Numbers where there is a sequence, drawings where there is not.
const NAV = [
  { id: "setup",       label: "האירוע",       num: 1 },
  { id: "tables",      label: "שולחנות",      num: 2 },
  { id: "guests",      label: "אורחים",       num: 3 },
  { id: "constraints", label: "אילוצים",      num: 4 },
  { id: "seating",     label: "הושבה",        num: 5 },
  { id: "rsvps",       label: "אישורים",      tool: true, mark: "rsvp" },
  { id: "collab",      label: "טבלה שיתופית", tool: true, mark: "collab" },
  { id: "site",        label: "אתר האירוע",   tool: true, mark: "site" },
  { id: "costs",       label: "תקציב",        tool: true, mark: "budget" },
  { id: "tasks",       label: "משימות",       tool: true, mark: "tasks" },
  { id: "announce",    label: "הזמנות",       tool: true, mark: "announcements" },
  { id: "vendors",     label: "ספקים",        tool: true, mark: "vendors" },
  { id: "messages",    label: "הודעות",       tool: true, mark: "messages" },
  { id: "nametags",    label: "כרטיסי שם",    tool: true, mark: "nameTags" },
];

export default function Shell({ screen, activeEvent, go, children, syncStatus, showToast }) {
  const { user, loading: authLoading } = useAuth();
  const inEvent = !!activeEvent && screen !== "dashboard";

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

  const showAutoSave = inEvent && screen !== "setup";

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
            <button className={styles.bcBack} onClick={() => go("dashboard")}>← כל האירועים</button>
            <span className={styles.bcSep}>/</span>
            <span className={styles.bcCurrent}>
              {activeEvent.name || "אירוע חדש"}
            </span>
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
             syncStatus === SYNC_STATUS.SYNCED  ? "✓ נשמר בענן" :
             "✓ נשמר"}
          </span>
        )}

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
      </header>

      {inEvent && (
        <nav className={styles.subnav}>
          <div className={styles.subnavInner}>
            {NAV.map((n, i) => {
              const isActive = screen === n.id;
              const done     = stepDone(n.id);
              const showViol = n.id === "seating" && violationCount > 0;
              const firstTool = n.tool && !NAV[i - 1]?.tool;
              return (
                <button
                  key={n.id}
                  data-firsttool={firstTool ? "1" : undefined}
                  className={[styles.subnavBtn, isActive && styles.subnavActive].filter(Boolean).join(" ")}
                  onClick={() => {
                    if (n.id !== "setup" && !activeEvent.name?.trim()) {
                      showToast?.("יש להזין שם לאירוע לפני המשך", "err");
                      go("setup");
                      return;
                    }
                    go(n.id);
                  }}
                >
                  {n.mark ? (
                    <SectionMark name={n.mark} size={17} className={styles.navMark} />
                  ) : (
                    <span className={[
                      styles.stepDot,
                      done && !isActive && styles.stepDotDone,
                      isActive && styles.stepDotActive,
                    ].filter(Boolean).join(" ")}>
                      {done && !isActive ? "✓" : n.num}
                    </span>
                  )}
                  <span className={styles.subnavLabel}>{n.label}</span>
                  {n.id === "tables"      && activeEvent.tables.length > 0      && <NavBadge n={activeEvent.tables.length} />}
                  {n.id === "guests"      && activeEvent.guests.length > 0      && <NavBadge n={activeEvent.guests.length} />}
                  {n.id === "constraints" && activeEvent.constraints.length > 0 && <NavBadge n={activeEvent.constraints.length} />}
                  {showViol && <NavBadge n={violationCount} color="var(--red)" />}
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
