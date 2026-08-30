import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { supabase } from "../lib/supabase.js";
import {
  getPlanLabel, getStatusLabel, getPlanLimits,
  PLAN_KEYS, getPlanMeta, getStatusMeta,
} from "../admin/lib/planConfig.js";
import { isPaidPlan, isStripeConfigured } from "../admin/lib/stripeConfig.js";
import { useBilling } from "../hooks/useBilling.js";
import { useSubscription } from "../hooks/useSubscription.js";
import styles from "./AccountScreen.module.css";
import Loading from "../components/feedback/Loading.jsx";
import SectionMark from "../components/ui/SectionMark.jsx";
import Icon from "../components/ui/Icon.jsx";
import { useConfirm } from "../components/ui/useConfirm.jsx";
import { userStorageKey, loadState, clearState, isCloudBacked } from "../utils/storage.js";
import { COMPANY, supportMailto } from "../data/company.js";

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
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
    // Advanced export, AI seating and team collaboration are in planConfig and
    // on nothing else — none of the three is built. They are off the customer
    // screens until they exist; the plan document keeps them as candidates.
  ];
}

// ── Upgrade button label per card (from current plan perspective) ────────────

function cardBtnLabel(cardKey, currentPlanKey) {
  if (cardKey === currentPlanKey) return "תוכנית נוכחית ✓";
  if (cardKey === "free")         return "—";
  if (cardKey === "pro")          return "שדרגו ל-Pro";
  if (cardKey === "enterprise")   return "צרו קשר";
  return "—";
}

// ── AccountScreen ─────────────────────────────────────────────────────────────

export default function AccountScreen({ eventCount = 0, showToast }) {
  const { confirm, dialog } = useConfirm();
  const { user, loading, signOut } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const billing   = useBilling();

  const {
    subscription:    sub,
    planKey,
    statusKey,
    isPaymentFailed,
    isCancelling,
    refresh:         refreshSub,
  } = useSubscription();
  const [signingOut,      setSigningOut]      = useState(false);
  const [checkoutResult,  setCheckoutResult]  = useState(null); // "success" | "cancelled" | null
  const [pwForm,          setPwForm]          = useState({ current: "", next: "", confirm: "" });
  const [pwSaving,        setPwSaving]        = useState(false);
  const [pwError,         setPwError]         = useState("");
  const [pwDone,          setPwDone]          = useState(false);
  const [showPw,          setShowPw]          = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true, state: { from: "/account" } });
    }
  }, [loading, user, navigate]);

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
      if (result === "success") {
        refreshSub();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate("/", { replace: true });
  };

  // The deliberate wipe. Signing out already removes everything the cloud
  // provably holds (see the comment in useAuth.js); this is the harder action
  // that also takes the events which exist ONLY on this device — the drafts,
  // the edits that never got pushed. That is unrecoverable, so the dialog names
  // them one by one before asking.
  //
  // The warning used to be passed as a `body` option. ConfirmDialog has no such
  // prop — it splits `message` on newlines — so the sentence about permanent
  // deletion was dropped on the floor and the dialog asked for confirmation of
  // a destructive action with nothing but its headline. Measured in the browser
  // before the fix: the rendered dialog was the title and the two buttons.
  const handleClearLocal = async () => {
    const userKey  = userStorageKey(user?.id);
    const guestKey = userStorageKey(null);
    const onDevice = [
      ...(loadState(userKey).events  || []),
      ...(loadState(guestKey).events || []),
    ];
    const doomed    = onDevice.filter(ev => !isCloudBacked(ev));
    const recovers  = onDevice.length - doomed.length;

    const lines = ["למחוק את העותק המקומי של האירועים מהדפדפן הזה?"];
    if (recovers > 0) {
      lines.push(recovers === 1
        ? "אירוע אחד כבר בענן ויחזור בכניסה הבאה."
        : `${recovers} אירועים כבר בענן ויחזרו בכניסה הבאה.`);
    }
    if (doomed.length > 0) {
      lines.push(doomed.length === 1
        ? "אירוע אחד קיים רק על המכשיר הזה ויימחק לצמיתות:"
        : `${doomed.length} אירועים קיימים רק על המכשיר הזה ויימחקו לצמיתות:`);
      lines.push(doomed.map(ev => ev.name?.trim() || "אירוע ללא שם").join(" · "));
    } else if (onDevice.length > 0) {
      lines.push("שום דבר לא יאבד — כל מה ששמור כאן קיים גם בענן.");
    } else {
      lines.push("אין כרגע נתונים שמורים על המכשיר הזה.");
    }
    lines.push("החשבון עצמו והעותק בענן לא נמחקים.");

    const ok = await confirm(lines.join("\n"), {
      confirmLabel: "מחקו מהמכשיר",
      danger: true,
    });
    if (!ok) return;
    if (clearState(userKey) && clearState(guestKey)) {
      showToast?.("הנתונים המקומיים נמחקו מהמכשיר ✓");
      // Reload so nothing in memory writes the data straight back.
      setTimeout(() => window.location.reload(), 400);
    } else {
      showToast?.("לא ניתן היה למחוק — ייתכן שהדפדפן חוסם אחסון מקומי", "err");
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError("");
    if (!pwForm.current) { setPwError("יש להזין את הסיסמה הנוכחית."); return; }
    if (pwForm.next.length < 6) { setPwError("הסיסמה החדשה חייבת להכיל לפחות 6 תווים."); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError("הסיסמאות אינן תואמות."); return; }
    setPwSaving(true);
    // Re-authenticate to verify current password before allowing the change.
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: user.email, password: pwForm.current,
    });
    if (authErr) {
      setPwSaving(false);
      setPwError("הסיסמה הנוכחית שגויה.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pwForm.next });
    setPwSaving(false);
    if (error) {
      setPwError(error.message || "שגיאה בשינוי הסיסמה.");
    } else {
      setPwDone(true);
      setPwForm({ current: "", next: "", confirm: "" });
    }
  };

  if (loading || !user) return null;

  const planMeta  = getPlanMeta(planKey);
  const statusMeta = getStatusMeta(statusKey);

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* Brand */}
        <div className={styles.brand}>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>{COMPANY.name}</span>
        </div>

        <div className={styles.titleRow}>
          <SectionMark name="account" size={26} tile />
          <h1 className={styles.title}>החשבון שלי</h1>
        </div>

        {/* ── User info ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionLabel}>פרטי חשבון</h2>
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>אימייל</span>
            <span className={styles.infoVal} dir="ltr">{user.email}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>מזהה משתמש</span>
            <span className={styles.infoValMeta} dir="ltr">
              {user.id.slice(0, 8)}…
            </span>
          </div>
        </section>

        {/* ── Password change ── */}
        {supabase && (
          <section className={styles.section}>
            <h2 className={styles.sectionLabel}>שינוי סיסמה</h2>
            {pwDone ? (
              <p className={styles.successMsg}><Icon name="check" size={14} /> הסיסמה שונתה בהצלחה.</p>
            ) : (
              <form onSubmit={handlePasswordChange} className={styles.pwForm} noValidate>
                <div className={styles.pwFieldWrap}>
                  <input
                    className={styles.input}
                    type={showPw ? "text" : "password"}
                    placeholder="סיסמה נוכחית"
                    value={pwForm.current}
                    onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                    dir="ltr"
                    autoComplete="current-password"
                    required
                  />
                  <button type="button" className={styles.pwEyeBtn}
                    onClick={() => setShowPw(v => !v)} tabIndex={-1}
                    aria-label={showPw ? "הסתירו סיסמה" : "הציגו סיסמה"}>
                    <Icon name={showPw ? "eyeOff" : "eye"} size={18} />
                  </button>
                </div>
                <input
                  className={styles.input}
                  type={showPw ? "text" : "password"}
                  placeholder="סיסמה חדשה (לפחות 6 תווים)"
                  value={pwForm.next}
                  onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
                  dir="ltr"
                  autoComplete="new-password"
                  required
                />
                <input
                  className={styles.input}
                  type={showPw ? "text" : "password"}
                  placeholder="אימות סיסמה חדשה"
                  value={pwForm.confirm}
                  onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                  dir="ltr"
                  autoComplete="new-password"
                  required
                />
                {pwError && <p className={styles.errorMsg}>{pwError}</p>}
                <button type="submit" className={styles.pwBtn} disabled={pwSaving || !pwForm.current || !pwForm.next || !pwForm.confirm}>
                  {pwSaving ? "מאמת ושומר…" : "שנו סיסמה"}
                </button>
              </form>
            )}
          </section>
        )}

        {/* ── Subscription info ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionLabel}>תוכנית ומנוי</h2>
          {sub === undefined ? (
            <Loading />
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
              {sub?.current_period_end && !isCancelling && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>חידוש הבא</span>
                  <span className={styles.infoVal}>{formatDate(sub.current_period_end)}</span>
                </div>
              )}
              {isCancelling && sub?.expires_at && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>גישה עד</span>
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
                      {/* dir="ltr": the glyphs came out "10 / 3" for 3 of 10, and a
                          slash between two numbers is read as a fraction, left to
                          right. (The token reading order was never wrong — measured.
                          It is the fraction reading that breaks.) Same fix as the
                          admin chip; the ∞ makes unspacing read worse here. */}
                      <span className={styles.usageVal} dir="ltr">
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

        {/* ── Subscription status notices ── */}
        {sub && isPaymentFailed && (
          <div className={styles.paymentFailedBanner}>
            <span><Icon name="alert" /> תשלום נכשל — אנא עדכנו את אמצעי התשלום שלכם.</span>
            {isPaidPlan(planKey) && isStripeConfigured && (
              <button
                className={styles.paymentFailedBannerBtn}
                onClick={billing.openPortal}
                disabled={billing.checkoutTarget === "portal"}
              >
                {billing.checkoutTarget === "portal" ? "פותח…" : "עדכנו תשלום ↗"}
              </button>
            )}
          </div>
        )}
        {sub && isCancelling && !isPaymentFailed && (
          <div className={styles.cancellingBanner}>
            ביטול מתוכנן — הגישה לתוכנית {getPlanLabel(planKey)} פעילה עד{" "}
            {formatDate(sub.expires_at)}.
          </div>
        )}
        {sub && statusKey === "trialing" && (
          <div className={styles.trialBanner}>
            ✦ אתם בתקופת ניסיון. ניתן לשדרג בכל עת.
          </div>
        )}

        {/* ── Checkout result banners ── */}
        {checkoutResult === "success" && (
          <div className={styles.checkoutSuccessBanner}>
            <Icon name="check" size={14} /> ההרשמה לתוכנית הצליחה! ייתכן שיידרשו כמה שניות לעדכון התוכנית.
          </div>
        )}
        {checkoutResult === "cancelled" && (
          <div className={styles.checkoutCancelledBanner}>
            הרשמה לתוכנית בוטלה — לא חויבתם. תוכלו לשדרג בכל עת.
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
                const meta      = getPlanMeta(key);
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
                    window.location.href = supportMailto("Enterprise Plan Inquiry");
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
                        <Icon name={key === "free" ? "sparkle" : key === "pro" ? "star" : "diamond"} size={16} />
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
                            {f.included ? <Icon name="check" size={13} /> : <Icon name="close" size={13} />}
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
                          isCurrent       ? "זוהי התוכנית הנוכחית שלכם" :
                          !isStripeConfigured && !isEnterprise ? "שדרוג יהיה זמין בקרוב" :
                          isEnterprise    ? "שלחו אימייל לגבי תוכנית ארגוני" :
                          `שדרגו לתוכנית ${getPlanLabel(key)}`
                        }
                      >
                        {isCurrent
                          ? "תוכנית נוכחית"
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
                title={isStripeConfigured ? "נהלו מנוי, שנו תשלום, או בטלו" : "ניהול חיוב יהיה זמין בקרוב"}
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
          <button
            className={styles.clearLocalBtn}
            onClick={handleClearLocal}
            type="button"
          >
            מחיקת נתונים מקומיים מהמכשיר
          </button>
        </div>
        <p className={styles.clearLocalHint}>
          העותק של האירועים נשמר גם בדפדפן הזה כדי שהאפליקציה תעבוד גם בלי רשת.
          בהתנתקות נמחק מהמכשיר כל מה שכבר מסונכרן לענן; מה שטרם הספיק
          להסתנכרן נשאר כאן כדי שלא ילך לאיבוד. במחשב משותף כדאי למחוק גם אותו.
        </p>

        <a
          /* The subject and body were percent-encoded BY HAND in the source,
             which is why they read as noise: 200 characters of %D7%9E to say
             `משוב על ${COMPANY.name}`. supportMailto encodes once, at the point of
             use, so the Hebrew stays readable here and the brand name follows
             COMPANY instead of being frozen into an escape sequence. */
          href={supportMailto(
            `משוב על ${COMPANY.name}`,
            "שלום,\n\nאשמח לשתף משוב/רעיון:\n\n",
          )}
          className={styles.feedbackLink}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="mail" /> שלחו משוב / דווחו על בעיה
        </a>

        <p className={styles.versionLabel}>גרסה 0.1 · בטא מוקדמת</p>

        <Link to="/" className={styles.backLink}><Icon name="arrowRight" size={14} /> חזרה לאפליקציה</Link>

      </div>
      {dialog}
    </div>
  );
}
