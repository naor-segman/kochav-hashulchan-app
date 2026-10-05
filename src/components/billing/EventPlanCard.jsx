import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePlan } from "../../hooks/usePlan.js";
import { useBilling } from "../../hooks/useBilling.js";
import { useAuth } from "../../hooks/useAuth.js";
import { getPlanLabel } from "../../admin/lib/planConfig.js";
import { isStripeConfigured } from "../../admin/lib/stripeConfig.js";
import { PLANS, PLAN_DB_KEY } from "../../data/pricing.js";
import { priceFor, stepFor, formatShekel, GUESTS_MAX } from "../../data/pricingCurve.js";
import { COMPANY } from "../../data/company.js";
import { planForEvent } from "../../utils/entitlement.js";
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
// The return from checkout: how long to wait for the webhook, and how often
// to look. Stripe's redirect usually arrives before it.
export const CONFIRM_TRIES = 10;
export const CONFIRM_EVERY_MS = 3000;

export default function EventPlanCard({ ev }) {
  const { user } = useAuth();
  const { plan, loading, refresh } = usePlan(ev);
  const billing = useBilling();
  const location = useLocation();
  const navigate = useNavigate();

  /* ── Back from checkout (29.9 review) ────────────────────────────────────────
     The checkout returns HERE, to /events/:id?checkout=success, and until 29.9
     nothing on the event read it: the host who had just paid landed on a card
     still offering the purchase — the redirect beats the webhook — with no
     word that anything had happened, and a second click on "רכשו" would have
     charged them twice. Now: say the payment arrived, take the button away,
     re-read the purchase every few seconds, and name the package only once
     the server shows it. Read once, from the URL the page opened with; the
     parameter is then removed so a refresh does not replay it. */
  const [returned] = useState(() => new URLSearchParams(location.search).get("checkout"));
  const [confirm, setConfirm] = useState(returned === "success" ? "waiting" : null); // waiting|done|slow
  useEffect(() => {
    if (!returned) return undefined;
    const params = new URLSearchParams(location.search);
    params.delete("checkout");
    const q = params.toString();
    navigate({ pathname: location.pathname, search: q ? `?${q}` : "" }, { replace: true });
    if (returned !== "success") return undefined;
    let alive = true, tries = 0, timer;
    const look = async () => {
      const rows = await refresh();
      if (!alive) return;
      if (planForEvent(rows, ev) !== "free") { setConfirm("done"); return; }
      if (++tries >= CONFIRM_TRIES) { setConfirm("slow"); return; }
      timer = setTimeout(look, CONFIRM_EVERY_MS);
    };
    look();
    return () => { alive = false; clearTimeout(timer); };
  // Once, for the URL the page opened with.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prices and names come from the pricing data, never retyped: this card and
  // the pricing page have to agree, and they are the two surfaces a buyer
  // compares.
  const paidTier = PLANS[1];                       // "בלי הפתעות"
  const paidKey  = PLAN_DB_KEY[paidTier.key];      // → "pro"
  /* The price of THIS event (136, owner 5.10): the package is priced by the
     number of invited people, and this card knows the list — so it shows the
     host's own number instead of a "from" price. People, not rows: a row
     carries `count`. Rounded UP to the pricing page's 50-person steps, 100 at
     least, so the two surfaces quote the same figure for the same list. Above
     the stepper's top the price is a quote, as on the pricing page. */
  const people   = (ev?.guests || []).reduce((n, g) => n + Math.max(1, Number(g?.count) || 1), 0);
  const step     = stepFor(people);
  const price    = step && formatShekel(priceFor("auto", step));

  if (loading && !confirm) return null;

  const isPaid = plan !== "free";
  const waiting = confirm === "waiting" || (confirm === "slow" && !isPaid);

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
        {confirm && (
          <p className={styles.returned} role="status">
            {isPaid
              ? "התשלום התקבל — החבילה פעילה לאירוע הזה. תודה!"
              : confirm === "slow"
                ? "התשלום התקבל אצל חברת הסליקה. החבילה תתעדכן כאן תוך כמה דקות — אין צורך לשלם שוב."
                : "התשלום התקבל — מעדכנים את החבילה של האירוע…"}
          </p>
        )}
        {returned === "cancelled" && (
          <p className={styles.returned} role="status">התשלום בוטל — לא חויבתם.</p>
        )}
        <p className={styles.note}>
          {isPaid
            ? "כל מה שבחבילה פתוח לאירוע הזה. אירוע חדש מתחיל מהחינם."
            : "ההושבה בלי תקרה, אילוצי ישיבה, מפת האולם, ההדפסות ועמדת הכניסה — נפתחים לאירוע הזה בלבד."}
        </p>
      </div>

      {!isPaid && !waiting && !step && (
        <div className={styles.side}>
          <a
            className={styles.buy}
            href={`https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(`היי, אשמח להצעת מחיר לאירוע של ${people} מוזמנים`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            הצעת מחיר בוואטסאפ
          </a>
          <p className={styles.fine}>{`מעל ${GUESTS_MAX.toLocaleString("en-US")} מוזמנים המחיר בהצעה — כתבו לנו ונחזור אליכם.`}</p>
        </div>
      )}

      {!isPaid && !waiting && step && (
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
              : `רכשו את האירוע — ${price}`}
          </button>
          {/* The price is per event and says so, right under the number: it is
              the single most-asked question on a pricing page and the one this
              product answers differently from a subscription. */}
          <p className={styles.fine}>{blocked || `המחיר לאירוע של עד ${step} מוזמנים. ${paidTier.note} משדרגים בכל רגע ומשלמים רק את ההפרש.`}</p>
          {billing.error && <p className={styles.err}>{billing.error}</p>}
        </div>
      )}
    </section>
  );
}
