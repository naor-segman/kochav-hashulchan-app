// deno-lint-ignore-file no-explicit-any
import Stripe from "https://esm.sh/stripe@14";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================================
// create-billing-portal — Supabase Edge Function
//
// Creates a Stripe Billing Portal session so a paying user can manage or cancel
// their active subscription, update payment methods, and download invoices.
//
// The user must have already completed at least one checkout (so a Stripe
// customer ID exists on their profile row).
//
// Request  (POST, JSON): { returnUrl: string }
// Response (JSON):       { url: string }  — Stripe Billing Portal URL
//
// Deploy:
//   supabase functions deploy create-billing-portal
//
// Required Supabase Edge Function secrets:
//   STRIPE_SECRET_KEY            — sk_live_… or sk_test_…
//   SUPABASE_URL                 — auto-injected
//   SUPABASE_ANON_KEY            — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY    — auto-injected
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
// APP_ORIGINS is a comma-separated list set per environment; the request's own
// Origin header is accepted only if it is in that list.
function safeReturnUrl(raw: string, req: Request): string | null {
  const allowed = (Deno.env.get("APP_ORIGINS") ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get("Origin");
  if (origin && allowed.includes(origin)) allowed.push(origin);
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return null;
    return allowed.includes(u.origin) ? u.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    // ── Authenticate ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // ── Look up Stripe customer ───────────────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return json({
        error: "אין חשבון חיוב עבור משתמש זה. שדרג תחילה לתוכנית בתשלום.",
      }, 404);
    }

    const { returnUrl } = await req.json() as { returnUrl: string };
    const safeReturn = safeReturnUrl(returnUrl, req);
    if (!safeReturn) return json({ error: "returnUrl is not an allowed origin" }, 400);

    // ── Create Billing Portal session ─────────────────────────────────────────
    const session = await stripe.billingPortal.sessions.create({
      customer:   profile.stripe_customer_id,
      return_url: safeReturn,
    });

    return json({ url: session.url });

  } catch (err: any) {
    const message: string = err?.message ?? String(err);
    console.error("create-billing-portal error:", message);
    return json({ error: message }, 500);
  }
});
