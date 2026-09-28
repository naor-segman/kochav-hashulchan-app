// deno-lint-ignore-file no-explicit-any
import Stripe from "https://esm.sh/stripe@14";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================================
// stripe-webhook — Supabase Edge Function
//
// Receives and verifies Stripe webhook events, then updates the subscriptions
// and profiles tables in Supabase accordingly.
//
// ONE-TIME PAYMENTS, NOT SUBSCRIPTIONS (27.9). A purchase has exactly two
// lifecycle events: it is paid, and it may later be refunded. That is the whole
// state machine, and it is why four handlers were deleted from this file rather
// than adapted — `customer.subscription.updated`, `customer.subscription.deleted`,
// `invoice.payment_failed` and `invoice.payment_succeeded` are events Stripe will
// never send for `mode: "payment"`: there is no Subscription object and, with
// invoice_creation off, no invoices either. Handlers for events that cannot
// arrive are not caution, they are code that reads as if the product still
// renewed.
//
// Configure in Stripe Dashboard → Developers → Webhooks:
//   Endpoint URL:
//     https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   Events to send:
//     checkout.session.completed
//     checkout.session.async_payment_succeeded
//     charge.refunded
//
// Deploy:
//   supabase functions deploy stripe-webhook
//
// Required Supabase Edge Function secrets:
//   STRIPE_SECRET_KEY         — sk_live_… or sk_test_…
//   STRIPE_WEBHOOK_SECRET     — whsec_… from Stripe Dashboard → Webhooks
//   SUPABASE_URL              — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected (bypasses RLS to write subscriptions)
//
// is_manually_managed guard:
//   When a subscriptions row has is_manually_managed = true, all webhook
//   handlers skip it. Use this for comped accounts, support exceptions, etc.
// =============================================================================

// `mapStripeStatus` stood here, translating the nine Stripe SUBSCRIPTION states
// (trialing, past_due, unpaid, incomplete_expired, paused …) into this schema's
// four. A one-time payment has none of them: a Checkout session either completes
// paid or it does not exist, so the only two values this file ever writes are
// "active" and, on a refund, "cancelled". The function had no remaining caller.

// The price the customer is actually billed on is the authority on their plan.
// Reading it from subscription.metadata with a hardcoded `?? "pro"` fallback
// meant any subscription created outside the checkout flow — a Stripe Dashboard
// entry, a migrated or invoice-billed contract — silently became Pro, and every
// later `customer.subscription.updated` rewrote it back to Pro even after a fix.
function planFromPrice(priceId: string | null, metadataPlan?: string | null): string {
  const map: Record<string, string> = {};
  const pro  = Deno.env.get("STRIPE_PRO_PRICE_ID");
  const ent  = Deno.env.get("STRIPE_ENTERPRISE_PRICE_ID");
  if (pro) map[pro] = "pro";
  if (ent) map[ent] = "enterprise";
  if (priceId && map[priceId]) return map[priceId];
  // Metadata is the fallback, not the source — and only when it names a plan we
  // actually recognise.
  if (metadataPlan === "pro" || metadataPlan === "enterprise") return metadataPlan;
  return "free";
}

Deno.serve(async (req: Request) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-06-20",
  });

  // Service-role client bypasses RLS — safe for webhook handler (server-side only).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── Verify webhook signature ───────────────────────────────────────────────
  // This is critical: without verification, anyone could POST fake events.
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    // constructEventAsync, not constructEvent.
    //
    // NOT MEASURED — there is no Deno runtime in this environment and no
    // outbound route to fetch one, so this is a reasoned change and I am not
    // claiming the synchronous form is broken here. What is documented is that
    // under Deno stripe-node falls back to SubtleCryptoProvider, which cannot
    // be used from a synchronous call; Stripe's own Deno guidance is the async
    // form. The async form is correct under BOTH runtimes, so it is the safer
    // shape either way.
    //
    // Why it is worth changing on suspicion: if the sync form does throw here,
    // every delivery is rejected at the catch below with a 400, no subscriptions
    // row is ever written, and usePlan() returns "free" to a customer who has
    // paid — a silent billing failure that looks like nothing at all from
    // inside the app. Billing is not connected yet, so nothing is in use and
    // this change cannot break a working path.
    //
    // WHEN BILLING IS CONNECTED: check Stripe Dashboard -> Webhooks for 400s on
    // the first real event. That is the measurement this comment is missing.
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch (err: any) {
    const message: string = err?.message ?? String(err);
    console.error("Webhook signature verification failed:", message);
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 });
  }

  // ── Event dispatch ─────────────────────────────────────────────────────────
  // A handler that throws returns 500 so Stripe RETRIES. It used to return 200
  // "to prevent retries spamming errors" — which, on a payment, means a charge
  // that granted nothing and was never tried again. A retry storm is visible in
  // the Stripe dashboard; a silently lost purchase is not. Every write below is
  // idempotent (keyed on the session or payment intent), so retrying is safe.
  try {
    switch (event.type) {

      // ────────────────────────────────────────────────────────────────────────
      // checkout.session.completed
      // The host paid. Record the purchase. This is the only event that grants a
      // paid plan, and for a one-time payment it is also the only one that says
      // the money arrived — there is no invoice.payment_succeeded to follow it.
      // ────────────────────────────────────────────────────────────────────────
      // async_payment_succeeded is the SAME grant, arriving later: for a delayed
      // payment method the session completes "unpaid" and this event is the one
      // that says the money landed. Without it such a payment was taken and
      // never granted (28.9 audit, B6). Cards settle at once, so this is rare —
      // which is exactly why it would never have been noticed.
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (!session.customer) {
          console.warn("checkout.session.completed: no customer on session");
          break;
        }

        const userId = session.metadata?.user_id;
        if (!userId) {
          console.error("checkout.session.completed: missing user_id in session.metadata");
          break;
        }

        // PAID, not merely completed. The two are different events for any
        // delayed-notification method, and the session fires `completed` with
        // payment_status "unpaid" while the money is still in flight. Granting a
        // paid plan there hands out the product for a payment that can still
        // fail. Cards settle immediately, so in practice this is "paid" — which
        // is exactly why it would never have been noticed if it were wrong.
        //
        // "no_payment_required" is a grant too: a 100% promotion code (checkout
        // sets allow_promotion_codes) completes with nothing to collect, and the
        // old `!== "paid"` dropped it — a code the owner handed out produced no
        // purchase row at all (28.9 audit, B6).
        if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
          console.log(`${event.type}: payment_status=${session.payment_status}, waiting`);
          break;
        }

        // The price ID comes from the line items. Under the subscription model
        // it came from the retrieved Subscription's first item; there is no
        // Subscription now, and `session.line_items` is NOT included in the
        // webhook payload — it has to be listed explicitly, which is the kind of
        // thing that silently yields `plan: "free"` for a host who just paid.
        let priceId: string | null = null;
        try {
          const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
          priceId = items.data[0]?.price?.id ?? null;
        } catch (err: any) {
          console.error("checkout.session.completed — listLineItems failed:", err?.message ?? err);
        }
        const plan = planFromPrice(priceId, session.metadata?.plan);

        /* WHICH EVENT was bought. Re-verified here against the events table
           even though create-checkout-session already did: this handler trusts
           nothing from the metadata blob.

           A MISMATCH IS RECORDED, NOT GRANTED. This comment used to say a
           mismatch "records the purchase account-wide" — and that was the hole
           the 28.9 security audit found: event_id null meant account-wide, so
           buying for event A and deleting A before paying (or after) turned one
           ₪690 into every event on the account. event_id null now grants nothing
           unless an admin set is_manually_managed (src/utils/entitlement.js). So
           the row is still written — money moved and support needs the record —
           and it unlocks nothing until a person decides.

           A QUERY ERROR IS NOT A MISMATCH. The first version read only `data`
           and ignored `error`, so a transient database failure looked exactly
           like "not your event". It now fails the delivery with a 500 and Stripe
           retries; the upsert below is idempotent, so a retry is safe. */
        let eventId: string | null = session.metadata?.event_id ?? null;
        if (eventId) {
          const { data: owned, error: ownErr } = await supabase
            .from("events")
            .select("id")
            .eq("id", eventId)
            .eq("user_id", userId)
            .maybeSingle();
          if (ownErr) {
            console.error("checkout.session.completed — ownership check failed, asking Stripe to retry:", ownErr);
            return new Response("ownership check failed", { status: 500 });
          }
          if (!owned) {
            console.error(`checkout.session.completed: event ${eventId} does not belong to ${userId} (deleted, or never theirs) — recording the payment with NO entitlement; needs a person`);
            eventId = null;
          }
        } else {
          console.error(`checkout.session.completed: no event_id in metadata for session ${session.id} — recording the payment with NO entitlement; needs a person`);
        }
        if (plan === "free") {
          // Neither the price nor the metadata named a plan we recognise. Writing
          // the row anyway would record a purchase that grants nothing, and the
          // host would see the free plan after paying with no trace of why.
          console.error(`checkout.session.completed: could not resolve a paid plan (price=${priceId}, metadata=${session.metadata?.plan}) — not writing a row`);
          break;
        }

        /* A REFUNDED PURCHASE MUST NOT COME BACK TO LIFE (28.9 audit, B3).
           The upsert below writes status "active" unconditionally, so a
           duplicate, late or manually re-sent delivery of this event after
           charge.refunded would reactivate the purchase — and if the refund was
           processed FIRST, the refund handler found no row and stopped, and this
           then wrote an active one. Two guards:
             1. an existing row for this session that is cancelled or manually
                managed is left alone — a person or a refund already decided;
             2. the payment intent's own charge is checked: fully refunded means
                the row is written as cancelled, whatever order events arrived. */
        const { data: existing, error: existingErr } = await supabase
          .from("subscriptions")
          .select("status, is_manually_managed")
          .eq("stripe_checkout_session_id", session.id)
          .maybeSingle();
        if (existingErr) {
          console.error(`${event.type} — could not read the existing row, asking Stripe to retry:`, existingErr);
          return new Response("read failed", { status: 500 });
        }
        if (existing && (existing.status === "cancelled" || existing.is_manually_managed)) {
          console.log(`${event.type}: session ${session.id} is ${existing.is_manually_managed ? "manually managed" : "cancelled"} — not reactivating`);
          break;
        }

        let refundedAlready = false;
        const piId = (session.payment_intent as string) ?? null;
        if (piId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
            const ch = pi.latest_charge as Stripe.Charge | null;
            refundedAlready = !!ch && ch.amount_refunded >= ch.amount && ch.amount > 0;
          } catch (err: any) {
            // Not knowing is not the same as "not refunded". Retry.
            console.error(`${event.type} — could not read the payment intent, asking Stripe to retry:`, err?.message ?? err);
            return new Response("payment intent read failed", { status: 500 });
          }
        }

        /* THE SAME EVENT BOUGHT TWICE (28.9 audit, B4). Two open sessions — two
           tabs, or Back — are both payable and each has its own session id, so
           the idempotent upsert does not stop the second. create-checkout-session
           now expires older open sessions for the same event, which closes most
           of it; this catches what gets through. The row is still written —
           money moved — but it is flagged loudly, because the host was charged
           twice and needs a refund from a person. NOT automated: a refund is a
           money action this code has never been able to run against Stripe. */
        if (eventId && !refundedAlready) {
          const { data: twins } = await supabase
            .from("subscriptions")
            .select("stripe_checkout_session_id")
            .eq("user_id", userId)
            .eq("event_id", eventId)
            .eq("plan", plan)
            .in("status", ["active", "trialing"])
            .neq("stripe_checkout_session_id", session.id);
          if (twins && twins.length > 0) {
            console.error(`DOUBLE CHARGE — user ${userId} event ${eventId} plan ${plan}: session ${session.id} paid while ${twins.map(t => t.stripe_checkout_session_id).join(", ")} is already live. REFUND ${piId ?? session.id} by hand.`);
          }
        }

        // Conflict on the CHECKOUT SESSION id: Stripe can deliver an event more
        // than once, and this keeps a repeat delivery of the SAME session from
        // producing a second row. It does not, by itself, stop a second session
        // — see the double-charge note above.
        const { error: upsertError } = await supabase
          .from("subscriptions")
          .upsert(
            {
              user_id:                    userId,
              event_id:                   eventId,
              plan,
              // One payment, so there is nothing to be in trouble about later:
              // no trial, no grace period, no renewal that can fail.
              status:                     refundedAlready ? "cancelled" : "active",
              stripe_customer_id:         session.customer as string,
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id:   (session.payment_intent as string) ?? null,
              stripe_price_id:            priceId,
              current_period_end:         null,
              payment_past_due:           false,
              started_at:                 new Date().toISOString(),
              expires_at:                 refundedAlready ? new Date().toISOString() : null,
              updated_at:                 new Date().toISOString(),
            },
            { onConflict: "stripe_checkout_session_id" }
          );

        /* 500, not a log line (28.9 audit, B5). This returned 200 on a failed
           write, so Stripe never retried: one transient database error meant
           money taken and no entitlement, with nothing anywhere to say so. The
           upsert is idempotent on the session id, so a retry is safe. */
        if (upsertError) {
          console.error(`${event.type} — subscriptions upsert failed, asking Stripe to retry:`, upsertError);
          return new Response("upsert failed", { status: 500 });
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────────────
      // charge.refunded
      // The only thing that happens to a one-time purchase after it succeeds.
      // Full refund → the plan goes away. Partial refund → it does not: a ₪100
      // goodwill credit on a ₪690 package is not a cancellation, and treating it
      // as one would take the product away mid-event from someone we had just
      // compensated.
      // ────────────────────────────────────────────────────────────────────────
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi = charge.payment_intent as string | null;
        if (!pi) {
          console.warn("charge.refunded: no payment_intent on charge");
          break;
        }
        if (charge.amount_refunded < charge.amount) {
          console.log(`charge.refunded: partial (${charge.amount_refunded}/${charge.amount}) — access kept`);
          break;
        }

        const { data: existing } = await supabase
          .from("subscriptions")
          .select("is_manually_managed")
          .eq("stripe_payment_intent_id", pi)
          .maybeSingle();

        if (!existing) {
          console.warn(`charge.refunded: no purchase row for payment intent ${pi}`);
          break;
        }
        if (existing.is_manually_managed) {
          console.log(`charge.refunded: skipping manually managed row for ${pi}`);
          break;
        }

        // The row is kept, not deleted — it is the record that money moved. It is
        // `expires_at` that makes usePlan() return "free", and the status that
        // makes useSubscription stop selecting it.
        const { error } = await supabase
          .from("subscriptions")
          .update({
            status:     "cancelled",
            expires_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent_id", pi);

        // 500 so Stripe retries — a refund that fails to revoke leaves a
        // refunded customer with a paid plan (28.9 audit, B5).
        if (error) {
          console.error("charge.refunded — update failed, asking Stripe to retry:", error);
          return new Response("refund update failed", { status: 500 });
        }
        break;
      }

      default:
        // All other events are silently ignored.
        break;
    }
  } catch (err: any) {
    console.error(`Error handling Stripe event ${event.type} — asking Stripe to retry:`, err?.message ?? String(err));
    return new Response("handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status:  200,
    headers: { "Content-Type": "application/json" },
  });
});
