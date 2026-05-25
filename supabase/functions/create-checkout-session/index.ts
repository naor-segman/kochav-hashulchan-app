// deno-lint-ignore-file no-explicit-any
import Stripe from "https://esm.sh/stripe@14";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================================
// create-checkout-session — Supabase Edge Function
//
// Creates a Stripe Checkout session for the authenticated user, then returns
// the hosted Checkout URL so the browser can redirect to it.
//
// Request  (POST, JSON): { plan: "pro" | "enterprise", returnUrl: string }
// Response (JSON):       { url: string }  — Stripe hosted Checkout URL
//
// Deploy:
//   supabase functions deploy create-checkout-session
//
// Required Supabase Edge Function secrets (set via Supabase Dashboard or CLI):
//   STRIPE_SECRET_KEY            — sk_live_… or sk_test_…
//   STRIPE_PRO_PRICE_ID          — price_… for the Pro plan
//   STRIPE_ENTERPRISE_PRICE_ID   — price_… for the Enterprise plan
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
    const { plan, returnUrl } = await req.json() as { plan: string; returnUrl: string };

    if (!plan || !["pro", "enterprise"].includes(plan)) {
      return json({ error: `Invalid plan: ${plan}` }, 400);
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

    // ── Create Stripe Checkout session ────────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode:             "subscription",
      customer:         customerId,
      line_items:       [{ price: priceId, quantity: 1 }],
      success_url:      `${returnUrl}?checkout=success`,
      cancel_url:       `${returnUrl}?checkout=cancelled`,
      allow_promotion_codes: true,
      locale:           "he",
      metadata:         { user_id: user.id, plan },
      subscription_data: {
        metadata: { user_id: user.id, plan },
      },
    });

    return json({ url: session.url });

  } catch (err: any) {
    const message: string = err?.message ?? String(err);
    console.error("create-checkout-session error:", message);
    return json({ error: message }, 500);
  }
});
