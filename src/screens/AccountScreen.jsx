import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { supabase } from "../lib/supabase.js";
import {
  getPlanLabel, getStatusLabel, getPlanLimits,
  PLAN_META, STATUS_META, PLAN_KEYS,
} from "../admin/lib/planConfig.js";
import { isPaidPlan, isStripeConfigured } from "../admin/lib/stripeConfig.js";
import { useBilling } from "../hooks/useBilling.js";
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
    .select("plan, status, started_at, expires_at, current_period_end, payment_past_due")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
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
  const navigate  = useNavigate();
  const location  = useLocation();
  const billing   = useBilling();

  const [sub,             setSub]             = useState(undefined); // undefined=loading, null=none
  const [signingOut,      setSigningOut]      = useState(false);
  const [checkoutResult,  setCheckoutResult]  = useState(null); // "success" | "cancelled" | null

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true, state: { from: "/account" } });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    fetchSubscription(user.id).then(setSub);
  }, [user]);

  // Read and clear the ?checkout= URL param that Stripe appends after redirect.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get("checkout");
    if (result === "success" || result === "cancelled") {
      setCheckoutResult(result);
      // Remove the param from the URL so refreshing doesn't re-show the banner.
      params.delete("checkout");
      const newSearch = params.toString();
      window.history.replaceState(null, "", newSearch ? `?${newSearch}` : location.pathname);
      // Re-fetch subscription when returning from a successful checkout —
      // the webhook may have fired by now.
      if (result === "success" && user) {
        fetchSubscription(user.id).then(setSub);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        {/* ── Checkout result banners ── */}
        {checkoutResult === "success" && (
          <div className={styles.checkoutSuccessBanner}>
            ✓ ההרשמה לתוכנית הצליחה! ייתכן שיידרשו כמה שניות לעדכון התוכנית.
          </div>
        )}
        {checkoutResult === "cancelled" && (
          <div className={styles.checkoutCancelledBanner}>
            הרשמה לתוכנית בוטלה — לא חויבת. תוכל לשדרג בכל עת.
          </div>
        )}

        {/* ── Billing error ── */}
        {billing.error && (
          <p className={styles.billingError}>{billing.error}</p>
        )}

        {/* ── Plan comparison cards ── */}
        {sub !== undefined && (
          <section className={styles.section}>
            <h2 className={styles.sectionLabel}>תוכניות ושדרוג</h2>

            <div className={styles.planGrid}>
              {PLAN_KEYS.map((key) => {
                const meta      = PLAN_META[key];
                const isCurrent = key === planKey;
                const btnLabel  = cardBtnLabel(key, planKey);
                const noAction  = btnLabel === "—";
                const features  = planFeatures(key);

                // Whether this card's button is in a loading state
                const isThisLoading = billing.checkoutTarget === key;

                // Enterprise uses a contact link rather than Stripe Checkout
                const isEnterprise = key === "enterprise";

                // Upgrade button is clickable when Stripe is configured and
                // this is not the current plan
                const isClickable = !isCurrent && isStripeConfigured;

                const handleCardAction = () => {
                  if (isCurrent || billing.checkoutTarget) return;
                  if (isEnterprise) {
                    window.location.href =
                      "mailto:naor.segman@gmail.com?subject=Enterprise%20Plan%20Inquiry";
                    return;
                  }
                  billing.startCheckout(key);
                };

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
                          isCurrent      ? styles.planCardBtnCurrent :
                          isClickable    ? styles.planCardBtnUpgradeActive :
                          styles.planCardBtnUpgrade,
                        ].filter(Boolean).join(" ")}
                        disabled={isCurrent || isThisLoading}
                        onClick={handleCardAction}
                        title={
                          isCurrent       ? "זוהי התוכנית הנוכחית שלך" :
                          !isStripeConfigured && !isEnterprise ? "שדרוג יהיה זמין בקרוב" :
                          isEnterprise    ? "שלח אימייל לגבי תוכנית ארגוני" :
                          `שדרג לתוכנית ${getPlanLabel(key)}`
                        }
                      >
                        {isCurrent
                          ? "תוכנית נוכחית ✓"
                          : isThisLoading
                          ? "מעבד…"
                          : !isStripeConfigured && !isEnterprise
                          ? "בקרוב"
                          : btnLabel}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Billing management — shown for paid plan holders when Stripe is active */}
            {isPaidPlan(planKey) && (
              <button
                className={[
                  styles.billingBtn,
                  isStripeConfigured ? styles.billingBtnActive : "",
                ].filter(Boolean).join(" ")}
                disabled={!isStripeConfigured || billing.checkoutTarget === "portal"}
                onClick={isStripeConfigured ? billing.openPortal : undefined}
                title={isStripeConfigured ? "נהל מנוי, שנה תשלום, או בטל" : "ניהול חיוב יהיה זמין בקרוב"}
              >
                {billing.checkoutTarget === "portal" ? "פותח…" : "ניהול חיוב ↗"}
              </button>
            )}

            {/* Beta / inactive note — shown only when Stripe is not yet configured */}
            {!isStripeConfigured && (
              <div className={styles.inactiveNote}>
                <span className={styles.inactiveNoteIcon}>✦</span>
                <span>
                  אנחנו בשלב בטא — כל הפונקציות זמינות כרגע ללא תשלום.
                  שדרוג לתוכניות בתשלום יהיה זמין בקרוב. תודה שאתם איתנו!
                </span>
              </div>
            )}
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

        <a
          href="mailto:naor.segman@gmail.com?subject=%D7%9E%D7%A9%D7%95%D7%91%20%D7%A2%D7%9C%20%D7%9B%D7%95%D7%9B%D7%91%20%D7%94%D7%A9%D7%95%D7%9C%D7%97%D7%9F&body=%D7%A9%D7%9C%D7%95%D7%9D%2C%0A%0A%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%A9%D7%AA%D7%A3%20%D7%9E%D7%A9%D7%95%D7%91%2F%D7%A8%D7%A2%D7%99%D7%95%D7%9F%3A%0A%0A"
          className={styles.feedbackLink}
          target="_blank"
          rel="noreferrer"
        >
          ✉ שלח משוב / דווח על בעיה
        </a>

        <p className={styles.versionLabel}>גרסה 0.1 · בטא מוקדמת</p>

        <Link to="/" className={styles.backLink}>← חזרה לאפליקציה</Link>

      </div>
    </div>
  );
}
