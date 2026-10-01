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
    expect(t).toMatch(/<strong>טבלה שיתופית<\/strong> — כל השורות שבה, כולל טלפונים/);
  });
  it("terms: no subscription clause, no bit / PayBox", () => {
    const t = read("./TermsScreen.jsx");
    expect(t).not.toMatch(/תקופת החיוב/);
    // "ביט" as a word — "ביטול" (cancellation) is not the payment app.
    expect(t).not.toMatch(/PayBox|(^|[^\u05D0-\u05EA])ביט(?![\u05D0-\u05EA])/u);
  });
});

/* Checklist 103 (1.10): the rewrite, and what reaches the reader. */
describe("legal pages — 103", () => {
  it("refunds: the statutory floor is stated", () => {
    const t = read("./RefundScreen.jsx");
    expect(t).toMatch(/14 יום מיום הרכישה/);
    expect(t).toMatch(/5% מהמחיר או 100 ₪ — הנמוך מביניהם/);
    expect(t).toMatch(/ארבעה חודשים/);
    // a cancellation can be sent from the site itself
    expect(t).toMatch(/cancelMailto\(\)/);
  });
  it("terms and pricing point to the refund page; the footer lists it", () => {
    expect(read("./TermsScreen.jsx")).toMatch(/to="\/refunds"/);
    expect(read("./PricingScreen.jsx")).toMatch(/to="\/refunds"/);
    expect(read("../components/layout/Footer.jsx")).toMatch(/to="\/refunds"/);
  });
  it("privacy: a guests section the guest forms can link to", () => {
    expect(read("./PrivacyScreen.jsx")).toMatch(/id="guests"/);
    expect(read("../components/guest/GuestPrivacyNote.jsx")).toMatch(/href="\/privacy#guests"/);
  });
  it("every guest form carries the privacy note", () => {
    for (const f of ["./RSVPScreen.jsx", "./GiftScreen.jsx", "./AlbumScreen.jsx", "./CollabScreen.jsx"]) {
      expect(read(f), f).toMatch(/<GuestPrivacyNote\b/);
    }
  });
});
