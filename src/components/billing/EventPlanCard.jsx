import { usePlan } from "../../hooks/usePlan.js";
import { useBilling } from "../../hooks/useBilling.js";
import { useAuth } from "../../hooks/useAuth.js";
import { getPlanLabel } from "../../admin/lib/planConfig.js";
import { isStripeConfigured } from "../../admin/lib/stripeConfig.js";
import { PLANS, PLAN_DB_KEY } from "../../data/pricing.js";
import Icon from "../ui/Icon.jsx";
import styles from "./EventPlanCard.module.css";

/**
 * This event's package, and the one place it can be bought.
 *
 * ── Why the purchase lives here and not on the account screen ────────────────
 * Because a purchase unlocks ONE event. The only pay button in the product used
 * to sit on /account, which receives `eventCount` and nothing else — no event,
 * no id — so it could not have said which wedding was being bought even if the
 * checkout had asked. It now asks.
 *
 * ── Why it is not attached to a gate ─────────────────────────────────────────
 * The obvious place for an upsell is where a host is refused, and there were two
 * such places: the seating screen's ceiling and the sketch-detection toast.
 * Neither can carry it, because PLAN_GATES_ENFORCED is false — nothing refuses
 * anyone today, so a CTA that appears on refusal would never appear at all. The
 * event's own front page is where a host lands, and it says the same thing
 * whether the gates are on or off.
 *
 * Measured in a real browser, directly under the event header: top 559px at
 * 1280 wide, 951px at 390. So on a phone it is one short scroll down, not above
 * the fold — the hub's own header is that tall, which is its own question.
 *
 * ── What it must never do ────────────────────────────────────────────────────
 * Claim the free tier is limited in ways it is not. No limit is enforced
 * anywhere right now, so this card describes what the package ADDS and does not
 * pretend anything is currently blocked.
 */
export default function EventPlanCard({ ev }) {
  const { user } = useAuth();
  const { plan, loading } = usePlan(ev);
  const billing = useBilling();

  // Prices and names come from the pricing data, never retyped: this card and
  // the pricing page have to agree, and they are the two surfaces a buyer
  // compares.
  const paidTier = PLANS[1];                       // "בלי הפתעות" · ₪690
  const paidKey  = PLAN_DB_KEY[paidTier.key];      // → "pro"

  if (loading) return null;

  const isPaid = plan !== "free";

  /* One reason, in priority order, why buying is not possible right now. A
     disabled button with no explanation is the thing that makes a host think the
     product is broken; a button that fails when pressed is worse. */
  const blocked =
    !user                    ? "כדי לרכוש צריך להיות מחוברים לחשבון"
    : !ev?.cloudId           ? "האירוע עוד לא נשמר בענן — רגע אחד ונסו שוב"
    : !isStripeConfigured    ? "הרכישה תיפתח כאן בקרוב"
    : null;

  return (
    <section className={styles.card} aria-labelledby="event-plan-title">
      <div className={styles.main}>
        <p className={styles.eyebrow} id="event-plan-title">החבילה של האירוע הזה</p>
        <p className={styles.value}>
          {getPlanLabel(plan)}
          {isPaid && (
            <span className={styles.paidMark}>
              <Icon name="check" size={13} /> נרכש
            </span>
          )}
        </p>
        <p className={styles.note}>
          {isPaid
            ? "כל מה שבחבילה פתוח לאירוע הזה. אירוע חדש מתחיל מהחינם."
            : "ההושבה בלי תקרה, אילוצי ישיבה, מפת האולם, ההדפסות ועמדת הכניסה — נפתחים לאירוע הזה בלבד."}
        </p>
      </div>

      {!isPaid && (
        <div className={styles.side}>
          <button
            type="button"
            className={styles.buy}
            disabled={!!blocked || billing.checkoutTarget === paidKey}
            title={blocked || `רכשו את חבילת ${paidTier.name} לאירוע הזה`}
            onClick={() => billing.startCheckout(paidKey, ev)}
          >
            {billing.checkoutTarget === paidKey
              ? "פותח…"
              : `רכשו את האירוע — ${paidTier.price}`}
          </button>
          {/* The price is per event and says so, right under the number: it is
              the single most-asked question on a pricing page and the one this
              product answers differently from a subscription. */}
          <p className={styles.fine}>{blocked || paidTier.note}</p>
          {billing.error && <p className={styles.err}>{billing.error}</p>}
        </div>
      )}
    </section>
  );
}
