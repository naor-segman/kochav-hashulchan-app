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
import { usePlan } from "../hooks/usePlan.js";
import { useSubscription } from "../hooks/useSubscription.js";
import styles from "./AccountScreen.module.css";
import Loading from "../components/feedback/Loading.jsx";
import SectionMark from "../components/ui/SectionMark.jsx";
import Icon from "../components/ui/Icon.jsx";
import { useConfirm } from "../components/ui/useConfirm.jsx";
import { userStorageKey, loadState, clearState, isCloudBacked } from "../utils/storage.js";
import { COMPANY, supportMailto } from "../data/company.js";
import { fmtShortDate } from "../utils/dateFormat.js";
import { authErrorMessage } from "../utils/authErrors.js";


// ── Plan card feature rows ────────────────────────────────────────────────────

function planFeatures(key) {
  const l = getPlanLimits(key);
  const human = getPlanMeta(key)?.humanService;
  /* These rows have to DIFFER, and they had stopped: once maxGuests went to
     Infinity on every plan, `pro` and `enterprise` both rendered exactly
     "∞ אירועים" / "∞ אורחים" — byte-identical cards — and `free` differed from
     them in one row. A plan-comparison table that does not distinguish the plans
     is worse than no table on the screen where someone decides to pay.
     So the rows are what actually separates the packages now: the seating
     ceiling, the sketch detection, and the person at the door. */
  const seats = l.maxSeatedSeats === Infinity
    ? "הושבה אוטומטית בלי תקרה"
    : `הושבה אוטומטית עד ${l.maxSeatedSeats} אנשים`;
  return [
    {
      label:    l.maxEvents === Infinity ? "אירועים ללא הגבלה" : `${l.maxEvents === 1 ? "אירוע אחד" : `עד ${l.maxEvents} אירועים`}`,
      included: true,
    },
    { label: "רשימת אורחים ללא הגבלה", included: l.maxGuests === Infinity },
    { label: seats,                    included: true },
    { label: "זיהוי שולחנות מסקיצת האולם", included: l.aiFeatures },
    /* The human line last, and only on the package that has one. It comes from
       PLAN_META rather than from the limits, and it carries the words "שירות
       בשטח" inside the label — the same honest signal as the pricing page's
       "בשטח" badge, so a person at a door is never presented as a feature the
       software performs. Without it the two paid cards were identical. */
    ...(human ? [{ label: human, included: true }] : []),
  ];
}

// ── Upgrade button label per card (from current plan perspective) ────────────

function cardBtnLabel(cardKey, currentPlanKey) {
  if (cardKey === currentPlanKey) return "תוכנית נוכחית ✓";
  if (cardKey === "free")         return "—";
  /* The ₪690 card cannot start a checkout FROM HERE any more, and that is the
     point of per-event entitlement rather than an oversight: a purchase unlocks
     one event, and this screen is handed `eventCount` — a number — so it has no
     event to buy. It sends the host to the event list, where each event has its
     own package card.

     It used to read "שדרגו ל-Pro" and call billing.startCheckout(key) with no
     event at all, which under the new model would have written an account-wide
     entitlement: one payment, every event unlocked. That is the bug. */
  if (cardKey === "pro")          return "בחרו אירוע לרכישה";
  if (cardKey === "enterprise")   return "צרו קשר";
  return "—";
}

// ── AccountScreen ─────────────────────────────────────────────────────────────

export default function AccountScreen({ events = [], eventCount = 0, showToast }) {
  const { confirm, dialog } = useConfirm();
  const { user, loading, signOut } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const billing   = useBilling();
  /* usePlan() with no event — the account-level form, which is only ever right
     where there is genuinely no event in scope. `planFor(e)` then resolves each
     event from the same single query. */
  const { planFor } = usePlan();

  const {
    subscription:    sub,
    planKey,
    statusKey,
    isPaymentFailed,
    isCancelling,
    refresh:         refreshSub,
  } = useSubscription();
  const [signingOut,      setSigningOut]      = useState(false);
  const [signOutError,    setSignOutError]    = useState("");
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

  // A sign-out that failed (offline, server down) used to navigate home
  // anyway — it looked exactly like success while the session, and the
  // account's events, stayed on the device (37a). It stays here and says so.
  // The button is aria-disabled rather than disabled while it works, so the
  // keyboard focus is still on it when the error is announced.
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      await signOut();
    } catch {
      setSigningOut(false);
      setSignOutError("ההתנתקות לא הושלמה ואתם עדיין מחוברים. בדקו את החיבור לאינטרנט ונסו שוב.");
      return;
    }
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
      setPwError(authErrorMessage(error, "changePassword"));
    } else {
      setPwDone(true);
      setPwForm({ current: "", next: "", confirm: "" });
    }
  };

  if (loading || !user) return null;

  /* `planMeta` stood here, colouring a single account-wide plan badge. That
     badge is gone — packages are per event, and the list below names each one —
     so the colours it carried have no element left to colour. getPlanMeta is
     still used by planFeatures for the humanService line. */
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
          {/* "תוכנית ומנוי" — there is no מנוי. One payment per event, decided
              27.7, and the checkout matches it since 27.9. */}
          <h2 className={styles.sectionLabel}>החבילה שלכם</h2>
          {sub === undefined ? (
            <Loading />
          ) : (
            <>
              {/* ONE ROW PER EVENT, because that is what was bought.
                  A single "תוכנית: בלי הפתעות" badge for the account is the
                  per-account model this product moved off: a host can hold a
                  paid wedding and a free bar mitzvah at the same time, and a
                  badge cannot say that. Events with no purchase are listed too
                  — "חינם" is a true answer about an event, and leaving them out
                  would make the screen look like the host owns less than they
                  do. */}
              {events.length > 0 && (
                <ul className={styles.planPerEvent}>
                  {events.map(e => {
                    const p = planFor(e);
                    return (
                      <li key={e.id} className={styles.planPerEventRow}>
                        <span className={styles.planPerEventName}>{e.name || "אירוע בלי שם"}</span>
                        <span className={styles.planPerEventPlan}>
                          {p === "free" ? "חינם" : getPlanLabel(p)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className={styles.infoRow}>
                <span className={styles.infoKey}>סטטוס</span>
                <span
                  className={styles.badge}
                  style={{
                    color:       statusMeta?.color       || "var(--muted)",
                    background:  statusMeta?.bgColor     || "var(--bg)",
                    borderColor: statusMeta?.borderColor || "var(--border)",
                  }}
                >
                  {getStatusLabel(statusKey)}
                </span>
              </div>
              {sub?.started_at && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>תאריך הרכישה</span>
                  <span className={styles.infoVal}>{fmtShortDate(sub.started_at)}</span>
                </div>
              )}
              {/* A "חידוש הבא" row stood here, reading `current_period_end`.
                  There is no next period — that is the product promise, printed
                  on the pricing page twice — and the column is null for every
                  one-time purchase, so the row could only ever have appeared for
                  a subscription we no longer sell. */}
              {isCancelling && sub?.expires_at && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>גישה עד</span>
                  <span className={styles.infoVal}>{fmtShortDate(sub.expires_at)}</span>
                </div>
              )}
              {!sub && (
                <p className={styles.noSubNote}>
                  לא נרכשה חבילה — אתם בחבילת החינם.
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
            {/* No longer written by any webhook — a one-time payment produces no
                invoices, so invoice.payment_failed cannot fire. An admin can
                still set the flag by hand, which is the only way this shows. */}
            <span><Icon name="alert" /> התשלום לא הושלם — אנא בדקו את אמצעי התשלום.</span>
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
            {/* Reachable two ways now, and neither is a scheduled cancellation:
                a full refund (charge.refunded sets expires_at to now) or an admin
                setting an end date by hand. */}
            הגישה לחבילת {getPlanLabel(planKey)} פעילה עד{" "}
            {fmtShortDate(sub.expires_at)}.
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

                /* Clickable whenever it is not the current plan. It no longer
                   depends on Stripe being configured, because it no longer
                   charges anything — it navigates to the event list. The "בקרוב"
                   state belongs on the card inside an event, next to the price,
                   where the purchase actually happens. */
                const isClickable = !isCurrent;

                const handleCardAction = () => {
                  if (isCurrent || billing.checkoutTarget) return;
                  if (isEnterprise) {
                    window.location.href = supportMailto("Enterprise Plan Inquiry");
                    return;
                  }
                  // To the event list, not to Stripe. See cardBtnLabel: there is
                  // no event in scope on this screen, and a purchase belongs to
                  // one. `billing.startCheckout` now requires the event object.
                  navigate("/app");
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
                        style={{ color: meta?.color || "var(--muted)" }}
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
                            color:       meta?.color       || "var(--muted)",
                            background:  meta?.bgColor     || "var(--bg)",
                            borderColor: meta?.borderColor || "var(--border)",
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
                          isCurrent       ? "זוהי החבילה של רוב האירועים שלכם" :
                          isEnterprise    ? `שלחו אימייל לגבי חבילת ${getPlanLabel("enterprise")}` :
                          `החבילה נרכשת מתוך האירוע — לכל אירוע בנפרד`
                        }
                      >
                        {isCurrent
                          ? "החבילה הנוכחית"
                          : isThisLoading
                          ? "מעבד…"
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
                /* Was "נהלו מנוי, שנו תשלום, או בטלו". Nothing here renews, so
                   there is no מנוי to manage and nothing to cancel — what the
                   Stripe portal is actually good for now is the receipt. */
                title={isStripeConfigured ? "הקבלות ואמצעי התשלום שלכם" : "ניהול חיוב יהיה זמין בקרוב"}
              >
                {billing.checkoutTarget === "portal" ? "פותח…" : "ניהול חיוב ↗"}
              </button>
            )}

            {/* Shown only while Stripe is not configured. Says what is true —
                nothing is charged yet — without the beta label (checklist 23:
                the owner took the beta label off the whole product, 1.10). */}
            {!isStripeConfigured && (
              <div className={styles.inactiveNote}>
                <span className={styles.inactiveNoteIcon}>✦</span>
                <span>
                  כרגע כל הפונקציות זמינות ללא תשלום.
                  רכישה תהיה זמינה בקרוב.
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
            aria-disabled={signingOut || undefined}
            aria-describedby={signOutError ? "account-signout-error" : undefined}
            type="button"
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
        {signOutError && (
          <p id="account-signout-error" role="alert" className={styles.billingError}>
            {signOutError}
          </p>
        )}
        <p className={styles.clearLocalHint}>
          העותק של האירועים נשמר גם בדפדפן הזה כדי שהאפליקציה תעבוד גם בלי רשת.
          בהתנתקות נמחק מהמכשיר כל מה שכבר מסונכרן לענן; מה שטרם הספיק
          להסתנכרן נשאר כאן כדי שלא ילך לאיבוד. במחשב משותף כדאי למחוק גם אותו.
        </p>

        {/* Was a `mailto:` here (checklist 25). It depended on the reader having
            a mail client configured, it silently did nothing on a lot of phones,
            it arrived with no context about which screen or which browser — and
            until the domain is bought it pointed at a mailbox that does not
            exist, so it went nowhere at all. The form stores a row now, with the
            route and the browser attached. The mail route is still offered on
            that page for anyone who would rather write an email. */}
        <Link to="/feedback" className={styles.feedbackLink}>
          <Icon name="mail" /> שלחו משוב / דווחו על בעיה
        </Link>

        <Link to="/" className={styles.backLink}><Icon name="arrowRight" size={14} /> חזרה לאפליקציה</Link>

      </div>
      {dialog}
    </div>
  );
}
