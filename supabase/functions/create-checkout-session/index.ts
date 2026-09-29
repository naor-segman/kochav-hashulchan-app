// deno-lint-ignore-file no-explicit-any
import Stripe from "https://esm.sh/stripe@14.25.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";

// =============================================================================
// create-checkout-session — Supabase Edge Function
//
// Creates a Stripe Checkout session for the authenticated user, then returns
// the hosted Checkout URL so the browser can redirect to it.
//
// ONE-TIME PAYMENT (mode: "payment"), not a subscription. A couple has one
// wedding; the price is per event and charged once. The two price secrets below
// must therefore be ONE-TIME prices in Stripe — a recurring price is refused by
// this function with an error that names the secret.
//
// Request  (POST, JSON): { plan: "pro" | "enterprise", returnUrl: string,
//                          eventId: uuid }   ← the events.id being bought
// Response (JSON):       { url: string }  — Stripe hosted Checkout URL
//
// Deploy:
//   supabase functions deploy create-checkout-session
//
// Required Supabase Edge Function secrets (set via Supabase Dashboard or CLI):
//   STRIPE_SECRET_KEY            — sk_live_… or sk_test_…
//   STRIPE_PRO_PRICE_ID          — price_… ONE-TIME price for the ₪690 package
//   STRIPE_ENTERPRISE_PRICE_ID   — price_… ONE-TIME price for the ₪1,290 package
//   SUPABASE_URL                 — auto-injected
//   SUPABASE_ANON_KEY            — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY    — auto-injected (used for profile reads/writes)
// =============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}


// A Stripe-hosted checkout or portal page carries the real merchant account's
// branding, and `returnUrl` decides where the customer lands when it closes.
// It came straight out of the request body with no allow-list, and the function
// is callable directly by anyone holding a valid JWT — i.e. any signed-up user
// — so it minted a genuine, real-branded Stripe page that redirected to an
// attacker's domain. Only origins this deployment actually serves are allowed.
//
// APP_ORIGINS is a comma-separated list set per environment. It is the whole
// allow-list: nothing about the incoming request can widen it.
function safeReturnUrl(raw: string): string | null {
  const allowed = (Deno.env.get("APP_ORIGINS") ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  // Removed here: `if (origin && allowed.includes(origin)) allowed.push(origin)`
  // — it re-added a value the list already contained, so it did nothing at all.
  // Harmless, but it read as if the request's own Origin could widen the
  // allow-list, which is the opposite of what this function is for.
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return null;
    return allowed.includes(u.origin) ? u.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  // Respond to CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    const PRICE_IDS: Record<string, string | undefined> = {
      pro:        Deno.env.get("STRIPE_PRO_PRICE_ID"),
      enterprise: Deno.env.get("STRIPE_ENTERPRISE_PRICE_ID"),
    };

    // ── Authenticate via Supabase JWT ─────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // ── Validate plan ─────────────────────────────────────────────────────────
    const { plan, returnUrl, eventId } = await req.json() as {
      plan: string; returnUrl: string; eventId?: string;
    };
    // An unset APP_ORIGINS makes the allow-list EMPTY, which rejects every
    // checkout with a message that blames the caller's URL. That is the first
    // thing that will happen the day billing is switched on, and "returnUrl is
    // not an allowed origin" sends you looking at the wrong end of it.
    if (!Deno.env.get("APP_ORIGINS")) {
      console.error("APP_ORIGINS is not set — every checkout will be refused.");
      return json({ error: "APP_ORIGINS is not configured for this environment." }, 503);
    }
    const safeReturn = safeReturnUrl(returnUrl);
    if (!safeReturn) return json({ error: "returnUrl is not an allowed origin" }, 400);

    if (!plan || !["pro", "enterprise"].includes(plan)) {
      return json({ error: `Invalid plan: ${plan}` }, 400);
    }

    // ── Which event is being bought ────────────────────────────────────────
    //
    // A purchase unlocks ONE event (₪690 לאירוע), so a session without an event
    // is refused rather than charged. The alternative — accept it and write a
    // row with event_id null — is an account-wide entitlement created by
    // accident, i.e. the exact bug this whole change removes, and it would only
    // ever be noticed as revenue that failed to arrive.
    if (!eventId) {
      return json({ error: "eventId is required — a purchase belongs to one event" }, 400);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
      // Not cosmetic: the client's uid() has a fallback branch that returns
      // "id-<base36>" when crypto is unavailable, and an event's LOCAL id can
      // legitimately look like that. Sending it here means the caller passed
      // ev.id instead of ev.cloudId, and it must fail loudly at the door rather
      // than as a Postgres cast error after the customer has paid.
      return json({ error: "eventId is not a UUID — pass ev.cloudId, not ev.id" }, 400);
    }

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return json({ error: `No Stripe price ID configured for plan: ${plan}. Set STRIPE_${plan.toUpperCase()}_PRICE_ID in Edge Function secrets.` }, 400);
    }

    // ── Get or create Stripe customer ─────────────────────────────────────────
    // Use service role to read/write the profiles table (bypasses RLS).
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── The event has to be the buyer's, and not already bought ───────────
    //
    // Verified SERVER-SIDE with the service role, because `eventId` came from
    // the browser. Without this check a signed-up user could point a purchase at
    // someone else's event id — and since the webhook trusts the metadata it
    // writes, that would hand them an entitlement on a wedding that is not
    // theirs. The row is read by id AND user_id; a mismatch is a 403 either way.
    const { data: ownedEvent } = await supabaseAdmin
      .from("events")
      .select("id, name")
      .eq("id", eventId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ownedEvent) {
      return json({ error: "Event not found for this user" }, 403);
    }

    // Already paid for? Refuse BEFORE Stripe is called.
    //
    // This is the guard that exists instead of a UNIQUE (user_id, event_id)
    // constraint — see the migration. A constraint would also block the
    // legitimate sequences (refund then re-buy; adding the ₪1,290 package on top
    // of the ₪690 one), and it would fail AFTER the money moved, in a webhook,
    // where the only available remedy is a refund. A check in front of the
    // charge is the difference between "you already bought this" and taking a
    // second ₪690 for the same wedding.
    const { data: existingPurchase } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, status, expires_at")
      .eq("user_id", user.id)
      .eq("event_id", eventId)
      .in("status", ["active", "trialing"]);

    const live = (existingPurchase ?? []).filter((p: any) =>
      !p.expires_at || new Date(p.expires_at) > new Date()
    );
    if (live.some((p: any) => p.plan === plan)) {
      return json({
        error: `האירוע הזה כבר נרכש בחבילה הזאת.`,
        alreadyPurchased: true,
      }, 409);
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .single();

    let customerId: string = profile?.stripe_customer_id ?? "";

    if (!customerId) {
      // First checkout for this user — create a Stripe customer and persist it.
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("id", user.id);
    }

    // ── The price has to be a ONE-TIME price, and we check before Stripe does ──
    //
    // `mode: "payment"` with a recurring price is rejected by Stripe with
    // "You specified `payment` mode but passed a recurring price" — accurate and
    // completely opaque from inside the app, where it surfaces as a 500 and a
    // Hebrew toast saying the upgrade failed. One API call buys an error that
    // names the secret to fix, which matters because this is the first thing
    // anyone will hit on the day billing is switched on: the prices in Stripe
    // were created for the subscription model this replaced.
    const price = await stripe.prices.retrieve(priceId);
    if (price.recurring) {
      const secret = `STRIPE_${plan.toUpperCase()}_PRICE_ID`;
      console.error(`${secret} points at a RECURRING price (${priceId}). Purchases are one-time.`);
      return json({
        error: `${secret} is a recurring price. Pricing is one payment per event, not a subscription — create a one-time price in Stripe and update that secret.`,
      }, 500);
    }

    // ── Create Stripe Checkout session ────────────────────────────────────────
    //
    // ONE PAYMENT, NOT A SUBSCRIPTION. This was `mode: "subscription"` while the
    // public pricing page said "תשלום אחד לאירוע. לא מנוי." in two places — a
    // recurring charge under a promise that there would not be one. The decision
    // is from 27.7 and the code is what changes.
    //
    // `payment_intent_data.metadata` replaces `subscription_data.metadata`: there
    // is no Subscription object to hang metadata on, and the webhook needs the
    // user id somewhere durable. It is on the session AND the payment intent,
    // because charge.refunded — the only event a one-time payment has after it
    // succeeds — sees the payment intent and never the session.
    /* ONE PAYABLE SESSION PER EVENT (28.9 audit, B4). The already-purchased
       check above runs when a session is CREATED, so two open sessions — two
       tabs, or Back and Buy again — were both payable, and each has its own
       session id, so both became purchase rows: the same wedding charged twice.
       Before opening a new one, any older OPEN session this customer has for
       this event is expired, so only the newest can be paid. Best effort: if
       Stripe cannot list or expire, the purchase is not blocked — the webhook
       flags a double charge loudly as the second line of defence. */
    try {
      const open = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
      for (const old of open.data) {
        if (old.metadata?.event_id === eventId) {
          await stripe.checkout.sessions.expire(old.id);
        }
      }
    } catch (err: any) {
      console.error("could not expire older open sessions for this event:", err?.message ?? err);
    }

    const session = await stripe.checkout.sessions.create({
      mode:             "payment",
      customer:         customerId,
      line_items:       [{ price: priceId, quantity: 1 }],
      success_url:      `${safeReturn}?checkout=success`,
      cancel_url:       `${safeReturn}?checkout=cancelled`,
      allow_promotion_codes: true,
      // NOT "he": Stripe Checkout has no Hebrew. "he" is absent from the
      // locale enum in stripe@14.25.0 AND in the newest SDK (22.6.2), both
      // generated from Stripe's own API spec, and Stripe rejects a value
      // outside an enum — so every checkout session would have been refused
      // (found 29.9 by the type-check in qa/edgeBundle.mjs; not confirmed
      // against the live API, which this environment cannot reach). "auto"
      // follows the buyer's browser and falls back to English.
      locale:           "auto",
      // event_id on BOTH, for the same reason user_id is: charge.refunded sees
      // the payment intent and never the session.
      metadata:         { user_id: user.id, plan, event_id: eventId },
      payment_intent_data: {
        metadata: { user_id: user.id, plan, event_id: eventId },
        // What the host sees on their card statement. Without it the statement
        // shows the Stripe account's default name, which is the wrong company:
        // the merchant of record is Unica, and "REVAYA" is what they will
        // recognise next to a charge they made on a wedding-planning site.
        description: `רוויה — ${plan === "pro" ? "בלי הפתעות" : "אנחנו שם איתכם"}`,
      },
    });

    return json({ url: session.url });

  } catch (err: any) {
    const message: string = err?.message ?? String(err);
    console.error("create-checkout-session error:", message);
    return json({ error: message }, 500);
  }
});
