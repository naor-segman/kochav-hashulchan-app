import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/* WORKPLAN 136, stage C (owner, 5.10): "התחילו חינם" starts at once, with no
   signup in front of it — the account comes later, when the host wants the
   cloud or a link for the guests. The free try is what sells the paid one, so
   a form in its way costs exactly the visitors the free tier exists for.

   Every marketing surface whose CTAs START something. Two are left out on
   purpose: the footer's "הרשמה חינם" says signup in its own words, and the
   pricing stepper's "בחירת חבילה" is a purchase, which needs an account. */
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const SERVICES = readdirSync(new URL("./services/", import.meta.url))
  .filter(f => /ServiceScreen\.jsx$/.test(f)).map(f => `./services/${f}`);
const SURFACES = ["./LandingScreen.jsx", "./PricingScreen.jsx",
  "../components/layout/SiteHeader.jsx", ...SERVICES];

describe("start free means start (136 stage C)", () => {
  it("covers every service page", () => {
    expect(SERVICES.length).toBe(6);
  });

  for (const f of SURFACES) {
    it(`${f} sends no CTA to the signup form`, () => {
      expect(read(f)).not.toMatch(/to=["'{`]+\/signup/);
    });
  }

  it("the header's start-free button opens the app", () => {
    expect(read("../components/layout/SiteHeader.jsx"))
      .toMatch(/<Link to="\/app" className=\{styles\.navCta\}>התחילו חינם<\/Link>/);
  });
});
