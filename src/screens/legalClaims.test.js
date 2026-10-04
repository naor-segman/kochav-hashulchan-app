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
    // "Stripe" was on this list until the 3.10 audit (C2): Stripe cannot serve
    // an Israeli merchant, the provider is not chosen, and the page named it as
    // the current processor. The assertion encoded the wrong fact — the payment
    // processor is now named by role, and Stripe must NOT appear. MyInbox (C12)
    // sends the auth emails since 3.10; the page credited Supabase with it.
    for (const p of ["Supabase", "Netlify", "Google Fonts", "Anthropic", "Google Analytics", "MyInbox", "חברת הסליקה"]) expect(t).toContain(p);
    expect(t).not.toMatch(/Stripe/);
    expect(t).not.toMatch(/Supabase<\/strong> — [^<]*שליחת מיילי/);
    expect(t).toMatch(/<strong>טבלה שיתופית<\/strong> — כל השורות שבה, כולל טלפונים/);
  });
  it("privacy: GA retention is stated where retention lives (audit 3.10, C11)", () => {
    const t = read("./PrivacyScreen.jsx");
    // §8 is "how long information is kept"; GA's 14-month property setting was
    // missing from it, and §7 sent the reader to §6 for a duration §6 never gave.
    const s8 = t.slice(t.indexOf("8. כמה זמן המידע נשמר"), t.indexOf("9. אבטחה"));
    expect(s8).toMatch(/Google Analytics[^<]*14 חודשים/);
    expect(t).not.toMatch(/13 חודשים \(סעיף 6\)/);
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
    // No cancellation fee at all — the owner's decision (2.10, 103-א); the law
    // would allow 5% or ₪100, whichever is lower.
    expect(t).toMatch(/בלי דמי ביטול — מחזירים את כל הסכום/);
    expect(t).not.toMatch(/יקוזזו דמי ביטול/);
    expect(read("./PricingScreen.jsx")).not.toMatch(/בניכוי דמי ביטול/);
    expect(t).toMatch(/ארבעה חודשים/);
    // The owner's decision (2.10, 103-ב): a cancelled event after 14 days gets
    // no refund — stated as such, not "we'll consider".
    expect(t).toMatch(/בוטל, אחרי 14 יום מהרכישה<\/strong> — אין החזר/);
    expect(t).not.toMatch(/נשקול/);
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
