import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/* The legal pages say what the product does (second review 29.9, סב26).
 * Each line below was false when it was found:
 *   - "delete your account … from the account screen" — no such action exists
 *   - "cancellation takes effect at the end of the billing period" — there is
 *     no billing period; a purchase is one payment for one event
 *   - "bit or PayBox" — removed from the gift page by decision (11.8)
 *   - processors: only Supabase was named, while the pages call five more. */
const read = f => readFileSync(new URL(f, import.meta.url), "utf8");

describe("legal pages match the product", () => {
  it("privacy: no account-screen deletion; every processor named", () => {
    const t = read("./PrivacyScreen.jsx");
    expect(t).not.toMatch(/דרך מסך החשבון/);
    for (const p of ["Supabase", "Netlify", "Google Fonts", "Anthropic", "PostHog", "Stripe"]) expect(t).toContain(p);
    expect(t).toMatch(/טבלת המשפחה המשותפת/);
  });
  it("terms: no subscription clause, no bit / PayBox", () => {
    const t = read("./TermsScreen.jsx");
    expect(t).not.toMatch(/תקופת החיוב/);
    expect(t).not.toMatch(/ביט|PayBox/);
  });
});
