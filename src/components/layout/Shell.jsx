import { useMemo } from "react";
import { Link } from "react-router-dom";
import { computeViolations } from "../../logic/seating.js";
import { useAuth } from "../../hooks/useAuth.js";
import { SYNC_STATUS } from "../../utils/cloudSync.js";
import NavBadge from "../navigation/NavBadge.jsx";
import styles from "./Shell.module.css";

const NAV = [
  { id: "setup",       label: "האירוע",  num: 1 },
  { id: "tables",      label: "שולחנות", num: 2 },
  { id: "guests",      label: "אורחים",  num: 3 },
  { id: "constraints", label: "אילוצים", num: 4 },
  { id: "seating",     label: "הושבה",   num: 5 },
];

export default function Shell({ screen, activeEvent, go, children, syncStatus }) {
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
    if (id === "tables")  return activeEvent.tables.length > 0;
    if (id === "guests")  return activeEvent.guests.length > 0;
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
             syncStatus === SYNC_STATUS.ERROR   ? "⚠ שגיאה" :
             syncStatus === SYNC_STATUS.SYNCED  ? "✓ נשמר בענן" :
             "✓ נשמר"}
          </span>
        )}

        {!authLoading && (
          user
            ? (
              <Link to="/account" className={styles.accountBtn} title={user.email}>
                <span className={styles.accountIcon}>👤</span>
                <span className={styles.accountLabel}>{user.email.split("@")[0]}</span>
              </Link>
            ) : (
              <Link to="/signup" className={styles.signupBtn}>
                הצטרף חינם
              </Link>
            )
        )}
      </header>

      {inEvent && (
        <nav className={styles.subnav}>
          <div className={styles.subnavInner}>
            {NAV.map((n) => {
              const isActive = screen === n.id;
              const done     = stepDone(n.id);
              const showViol = n.id === "seating" && violationCount > 0;
              return (
                <button
                  key={n.id}
                  className={[styles.subnavBtn, isActive && styles.subnavActive].filter(Boolean).join(" ")}
                  onClick={() => go(n.id)}
                >
                  <span className={[
                    styles.stepDot,
                    done && !isActive && styles.stepDotDone,
                    isActive && styles.stepDotActive,
                  ].filter(Boolean).join(" ")}>
                    {done && !isActive ? "✓" : n.num}
                  </span>
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
