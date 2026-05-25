// deno-lint-ignore-file no-explicit-any
import Stripe from "https://esm.sh/stripe@14";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================================
// stripe-webhook — Supabase Edge Function
//
// Receives and verifies Stripe webhook events, then updates the subscriptions
// and profiles tables in Supabase accordingly.
//
// Configure in Stripe Dashboard → Developers → Webhooks:
//   Endpoint URL:
//     https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   Events to send:
//     checkout.session.completed
//     customer.subscription.updated
//     customer.subscription.deleted
//     invoice.payment_failed
//     invoice.payment_succeeded
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

// Maps Stripe subscription.status → internal status column value
function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active":             return "active";
    case "trialing":           return "trialing";
    case "past_due":           return "active";     // grace period — keep access
    case "canceled":           return "cancelled";
    case "unpaid":             return "cancelled";
    case "incomplete":         return "active";     // initial payment processing
    case "incomplete_expired": return "expired";
    case "paused":             return "cancelled";
    default:                   return "active";
  }
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
    event = stripe.webhooks.constructEvent(
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
  // All handlers are wrapped so a single handler error doesn't block others.
  // We return 200 on application errors to prevent Stripe from retrying
  // (retries would spam errors for problems we need to fix in code, not retry).
  try {
    switch (event.type) {

      // ────────────────────────────────────────────────────────────────────────
      // checkout.session.completed
      // User completed a Checkout session — create/update the subscription row.
      // ────────────────────────────────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (!session.subscription || !session.customer) {
          console.warn("checkout.session.completed: no subscription or customer on session");
          break;
        }

        const userId = session.metadata?.user_id;
        if (!userId) {
          console.error("checkout.session.completed: missing user_id in session.metadata");
          break;
        }

        // Retrieve the full subscription so we get price ID and period end.
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
          { expand: ["items.data.price"] }
        );

        const priceId   = subscription.items.data[0]?.price?.id ?? null;
        const plan      = session.metadata?.plan ?? "pro";
        const status    = mapStripeStatus(subscription.status);
        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null;

        // Upsert by stripe_subscription_id (unique column).
        // ON CONFLICT: update the existing row if the user somehow completed
        // checkout twice (e.g., double-click or browser back).
        const { error: upsertError } = await supabase
          .from("subscriptions")
          .upsert(
            {
              user_id:                userId,
              plan,
              status,
              stripe_customer_id:     session.customer as string,
              stripe_subscription_id: subscription.id,
              stripe_price_id:        priceId,
              current_period_end:     periodEnd,
              payment_past_due:       false,
              started_at:             new Date().toISOString(),
              expires_at:             null,
              updated_at:             new Date().toISOString(),
            },
            { onConflict: "stripe_subscription_id" }
          );

        if (upsertError) {
          console.error("checkout.session.completed — subscriptions upsert error:", upsertError);
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────────────
      // customer.subscription.updated
      // Plan change, trial → paid conversion, cancel_at_period_end toggle, etc.
      // ────────────────────────────────────────────────────────────────────────
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        // Skip manually-managed rows.
        const { data: existing } = await supabase
          .from("subscriptions")
          .select("is_manually_managed")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle();

        if (existing?.is_manually_managed) {
          console.log(`customer.subscription.updated: skipping manually managed row for sub ${subscription.id}`);
          break;
        }

        const priceId   = subscription.items.data[0]?.price?.id ?? null;
        const userId    = subscription.metadata?.user_id ?? null;
        const plan      = subscription.metadata?.plan ?? "pro";
        const status    = mapStripeStatus(subscription.status);
        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null;

        // When the customer has scheduled a cancellation, set expires_at to
        // the end of the current paid period so they keep access until then.
        const expiresAt = subscription.cancel_at_period_end ? periodEnd : null;

        const { error: updateError } = await supabase
          .from("subscriptions")
          .update({
            plan,
            status,
            stripe_price_id:    priceId,
            current_period_end: periodEnd,
            expires_at:         expiresAt,
            updated_at:         new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);

        if (updateError) {
          console.error("customer.subscription.updated — update error:", updateError);
        }

        // Keep profiles.stripe_customer_id up to date if it hasn't been set yet.
        if (userId && subscription.customer) {
          await supabase
            .from("profiles")
            .update({
              stripe_customer_id: subscription.customer as string,
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .is("stripe_customer_id", null);
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────────────
      // customer.subscription.deleted
      // Subscription fully cancelled after the billing period ended.
      // Preserve the row for billing history — just update status.
      // ────────────────────────────────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const { data: existing } = await supabase
          .from("subscriptions")
          .select("is_manually_managed")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle();

        if (existing?.is_manually_managed) {
          console.log(`customer.subscription.deleted: skipping manually managed row for sub ${subscription.id}`);
          break;
        }

        // Use period_end as expires_at so usePlan() returns "free" after expiry
        // but the row is preserved for billing history.
        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : new Date().toISOString();

        const { error } = await supabase
          .from("subscriptions")
          .update({
            status:     "cancelled",
            expires_at: periodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);

        if (error) console.error("customer.subscription.deleted — update error:", error);
        break;
      }

      // ────────────────────────────────────────────────────────────────────────
      // invoice.payment_failed
      // Automatic renewal payment failed. Stripe will retry (Smart Retries).
      // Set payment_past_due flag but do NOT revoke access — let Stripe retry.
      // Access is only revoked when subscription.updated/deleted fires later.
      // ────────────────────────────────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const { error } = await supabase
          .from("subscriptions")
          .update({
            payment_past_due: true,
            updated_at:       new Date().toISOString(),
          })
          .eq("stripe_subscription_id", invoice.subscription as string)
          .eq("is_manually_managed", false);

        if (error) console.error("invoice.payment_failed — update error:", error);
        break;
      }

      // ────────────────────────────────────────────────────────────────────────
      // invoice.payment_succeeded
      // Renewal payment succeeded (or past_due recovery). Restore clean status.
      // ────────────────────────────────────────────────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        // Update current_period_end from the invoice line item if available.
        const lineEnd = (invoice as any).lines?.data?.[0]?.period?.end;
        const periodEnd = lineEnd
          ? new Date(lineEnd * 1000).toISOString()
          : null;

        const updatePayload: Record<string, unknown> = {
          status:           "active",
          payment_past_due: false,
          expires_at:       null,
          updated_at:       new Date().toISOString(),
        };
        if (periodEnd) updatePayload.current_period_end = periodEnd;

        const { error } = await supabase
          .from("subscriptions")
          .update(updatePayload)
          .eq("stripe_subscription_id", invoice.subscription as string)
          .eq("is_manually_managed", false);

        if (error) console.error("invoice.payment_succeeded — update error:", error);
        break;
      }

      default:
        // All other events are silently ignored.
        break;
    }
  } catch (err: any) {
    // Log handler errors but return 200 to prevent Stripe retries.
    console.error(`Error handling Stripe event ${event.type}:`, err?.message ?? String(err));
  }

  return new Response(JSON.stringify({ received: true }), {
    status:  200,
    headers: { "Content-Type": "application/json" },
  });
});
