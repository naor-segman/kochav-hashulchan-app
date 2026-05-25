import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { supabase } from "../lib/supabase.js";
import {
  getPlanLabel, getStatusLabel, getPlanLimits,
  PLAN_META, STATUS_META, PLAN_KEYS,
} from "../admin/lib/planConfig.js";
import { isPaidPlan } from "../admin/lib/stripeConfig.js";
import styles from "./AccountScreen.module.css";

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

async function fetchSubscription(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, started_at, expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

// ── Plan card feature rows ────────────────────────────────────────────────────

function planFeatures(key) {
  const l = getPlanLimits(key);
  return [
    {
      label:    l.maxEvents === Infinity ? "∞ אירועים" : `עד ${l.maxEvents} אירועים`,
      included: true,
    },
    {
      label:    l.maxGuests === Infinity ? "∞ אורחים"  : `עד ${l.maxGuests} אורחים`,
      included: true,
    },
    { label: "ייצוא מתקדם",  included: l.advancedExports },
    { label: "AI הושבה",     included: l.aiFeatures },
    { label: "שיתוף צוות",   included: l.collaboration },
  ];
}

// ── Upgrade button label per card (from current plan perspective) ────────────

function cardBtnLabel(cardKey, currentPlanKey) {
  if (cardKey === currentPlanKey) return "תוכנית נוכחית ✓";
  if (cardKey === "free")         return "—";
  if (cardKey === "pro")          return "שדרג ל-Pro";
  if (cardKey === "enterprise")   return "צור קשר";
  return "—";
}

// ── AccountScreen ─────────────────────────────────────────────────────────────

export default function AccountScreen({ eventCount = 0 }) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const [sub,        setSub]        = useState(undefined); // undefined=loading, null=none
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true, state: { from: "/account" } });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    fetchSubscription(user.id).then(setSub);
  }, [user]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate("/", { replace: true });
  };

  if (loading || !user) return null;

  const planKey   = sub?.plan   || "free";
  const statusKey = sub?.status || "active";
  const planMeta  = PLAN_META[planKey];
  const statusMeta = STATUS_META[statusKey];

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* Brand */}
        <div className={styles.brand}>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>כוכב השולחן</span>
        </div>

        <h1 className={styles.title}>החשבון שלי</h1>

        {/* ── User info ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionLabel}>פרטי חשבון</h2>
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>אימייל</span>
            <span className={styles.infoVal} dir="ltr">{user.email}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>מזהה משתמש</span>
            <span className={styles.infoVal} dir="ltr" style={{ fontSize: 11, color: "var(--muted)" }}>
              {user.id.slice(0, 8)}…
            </span>
          </div>
        </section>

        {/* ── Subscription info ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionLabel}>תוכנית ומנוי</h2>
          {sub === undefined ? (
            <p className={styles.loadingText}>טוען…</p>
          ) : (
            <>
              <div className={styles.infoRow}>
                <span className={styles.infoKey}>תוכנית</span>
                <span
                  className={styles.badge}
                  style={{
                    color:       planMeta?.color       || "#888",
                    background:  planMeta?.bgColor     || "#f4f4f5",
                    borderColor: planMeta?.borderColor || "#e5e7eb",
                  }}
                >
                  {getPlanLabel(planKey)}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoKey}>סטטוס</span>
                <span
                  className={styles.badge}
                  style={{
                    color:       statusMeta?.color       || "#888",
                    background:  statusMeta?.bgColor     || "#f4f4f5",
                    borderColor: statusMeta?.borderColor || "#e5e7eb",
                  }}
                >
                  {getStatusLabel(statusKey)}
                </span>
              </div>
              {sub?.started_at && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>תחילת מנוי</span>
                  <span className={styles.infoVal}>{formatDate(sub.started_at)}</span>
                </div>
              )}
              {sub?.expires_at && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>פג תוקף</span>
                  <span className={styles.infoVal}>{formatDate(sub.expires_at)}</span>
                </div>
              )}
              {!sub && (
                <p className={styles.noSubNote}>
                  אין מנוי פעיל — משתמש בתוכנית החינמית.
                </p>
              )}

              {/* Current usage */}
              {(() => {
                const { maxEvents, maxGuests } = getPlanLimits(planKey);
                return (
                  <div className={styles.usageSection}>
                    <div className={styles.usageRow}>
                      <span className={styles.usageLabel}>אירועים בשימוש</span>
                      <span className={styles.usageVal}>
                        {eventCount}
                        {" / "}
                        {maxEvents === Infinity ? "∞" : maxEvents}
                      </span>
                    </div>
                    <div className={styles.usageRow}>
                      <span className={styles.usageLabel}>מגבלת אורחים לאירוע</span>
                      <span className={styles.usageVal}>
                        {maxGuests === Infinity ? "ללא הגבלה" : `עד ${maxGuests}`}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </section>

        {/* ── Plan comparison cards ── */}
        {sub !== undefined && (
          <section className={styles.section}>
            <h2 className={styles.sectionLabel}>תוכניות ושדרוג</h2>

            <div className={styles.planGrid}>
              {PLAN_KEYS.map((key) => {
                const meta     = PLAN_META[key];
                const isCurrent = key === planKey;
                const btnLabel  = cardBtnLabel(key, planKey);
                const noAction  = btnLabel === "—";
                const features  = planFeatures(key);

                return (
                  <div
                    key={key}
                    className={[
                      styles.planCard,
                      isCurrent ? styles.planCardCurrent : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {/* Card header */}
                    <div className={styles.planCardHead}>
                      <span
                        className={styles.planCardIcon}
                        style={{ color: meta?.color || "#888" }}
                      >
                        {key === "free" ? "✦" : key === "pro" ? "★" : "◆"}
                      </span>
                      <span className={styles.planCardName}>
                        {getPlanLabel(key)}
                      </span>
                      {isCurrent && (
                        <span
                          className={styles.planCardBadge}
                          style={{
                            color:       meta?.color       || "#888",
                            background:  meta?.bgColor     || "#f4f4f5",
                            borderColor: meta?.borderColor || "#e5e7eb",
                          }}
                        >
                          פעיל
                        </span>
                      )}
                    </div>

                    {/* Feature list */}
                    <ul className={styles.planCardFeatures}>
                      {features.map((f, i) => (
                        <li
                          key={i}
                          className={[
                            styles.planCardFeature,
                            !f.included ? styles.planCardFeatureMissing : "",
                          ].filter(Boolean).join(" ")}
                        >
                          <span className={styles.planCardMark}>
                            {f.included ? "✓" : "✗"}
                          </span>
                          <span>{f.label}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Action button */}
                    {!noAction && (
                      <button
                        className={[
                          styles.planCardBtn,
                          isCurrent ? styles.planCardBtnCurrent : styles.planCardBtnUpgrade,
                        ].join(" ")}
                        disabled
                        title={isCurrent ? "זוהי התוכנית הנוכחית שלך" : "שדרוג יהיה זמין בקרוב"}
                      >
                        {isCurrent ? "תוכנית נוכחית ✓" : "בקרוב"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Billing management — shown for paid plan holders */}
            {isPaidPlan(planKey) && (
              <button
                className={styles.billingBtn}
                disabled
                title="ניהול חיוב יהיה זמין בקרוב"
              >
                ניהול חיוב ↗
              </button>
            )}

            {/* Beta note */}
            <div className={styles.inactiveNote}>
              <span className={styles.inactiveNoteIcon}>✦</span>
              <span>
                אנחנו בשלב בטא — כל הפונקציות זמינות כרגע ללא תשלום.
                שדרוג לתוכניות בתשלום יהיה זמין בקרוב. תודה שאתם איתנו!
              </span>
            </div>
          </section>
        )}

        {/* ── Actions ── */}
        <div className={styles.actions}>
          <button
            className={styles.signOutBtn}
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "מתנתק…" : "התנתקות"}
          </button>
        </div>

        <Link to="/" className={styles.backLink}>← חזרה לאפליקציה</Link>

      </div>
    </div>
  );
}
