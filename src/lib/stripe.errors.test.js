import { describe, it, expect, vi, beforeEach } from "vitest";

/* סב60 / CP-H5 (third review 30.9). Every billing failure reached the host as
 * "Edge Function returned a non-2xx status code": English, and without the
 * server's answer — including the Hebrew "האירוע הזה כבר נרכש" the checkout
 * function writes for exactly this screen. */

const invoke = vi.fn();
vi.mock("../admin/lib/stripeConfig.js", () => ({ isStripeConfigured: true }));
vi.mock("./supabase.js", () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }));

const { createCheckoutSession, createBillingPortalSession } = await import("./stripe.js");

// What supabase-js hands back for a non-2xx: a fixed message, the body on `.context`.
const httpError = (status, body) => ({
  name: "FunctionsHttpError",
  message: "Edge Function returned a non-2xx status code",
  context: { status, json: async () => body },
});
const EV = "8c4f9c6a-201a-4e3a-a3d0-dbded4e3a099";
const failWith = async (p) => { try { await p; } catch (e) { return e.message; } return null; };

beforeEach(() => invoke.mockReset());

describe("billing errors a host can read (סב60)", () => {
  it("shows the server's own Hebrew sentence — already bought", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(409, { error: "האירוע הזה כבר נרכש בחבילה הזאת." }) });
    expect(await failWith(createCheckoutSession("pro", "https://x/e", EV))).toBe("האירוע הזה כבר נרכש בחבילה הזאת.");
  });

  it("never shows English — a diagnostic meant for the log becomes a Hebrew sentence", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(500, { error: "No such price: price_123" }) });
    const msg = await failWith(createCheckoutSession("pro", "https://x/e", EV));
    expect(msg).toMatch(/[֐-׿]/);
    expect(msg).not.toMatch(/[A-Za-z]/);
  });

  it("an expired login and a foreign event each say what to do", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(401, { error: "Unauthorized" }) });
    expect(await failWith(createCheckoutSession("pro", "https://x/e", EV))).toMatch(/התחברו מחדש/);
    invoke.mockResolvedValue({ data: null, error: httpError(403, { error: "Event not found for this user" }) });
    expect(await failWith(createCheckoutSession("pro", "https://x/e", EV))).toMatch(/לא נמצא בחשבון/);
  });

  it("no network says so", async () => {
    invoke.mockResolvedValue({ data: null, error: { name: "FunctionsFetchError", message: "Failed to send a request to the Edge Function" } });
    expect(await failWith(createCheckoutSession("pro", "https://x/e", EV))).toMatch(/אין חיבור/);
  });

  it("the receipts portal too", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(404, { error: "עוד אין רכישה בחשבון הזה — הקבלות יופיעו כאן אחרי הרכישה הראשונה." }) });
    expect(await failWith(createBillingPortalSession("https://x/account"))).toMatch(/עוד אין רכישה/);
    invoke.mockResolvedValue({ data: {}, error: null });
    const msg = await failWith(createBillingPortalSession("https://x/account"));
    expect(msg).not.toMatch(/[A-Za-z]/);
  });

  it("a success still returns the URL", async () => {
    invoke.mockResolvedValue({ data: { url: "https://checkout.stripe.com/c/abc" }, error: null });
    expect(await createCheckoutSession("pro", "https://x/e", EV)).toBe("https://checkout.stripe.com/c/abc");
  });
});
