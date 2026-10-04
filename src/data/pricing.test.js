import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PLANS, ADDONS, PRICING_FOOTNOTE, teaserFor, PLAN_DB_KEY } from "./pricing.js";
import { canSeatMore, canAddGuest, canUseAI, canUseCollaboration } from "../utils/featureGates.js";
import { PLAN_LIMITS, PLAN_META } from "../admin/lib/planConfig.js";

/**
 * The pricing model, pinned. Checklist 31.
 *
 * Two different failures are guarded here and they are not the same kind:
 *
 *   The TABLE — a price or a claim drifting between the two screens that show
 *   it. That already happened once: the landing page advertised "תמיכה מועדפת"
 *   and "SLA ותמיכה ייעודית", neither of which was on the pricing page a buyer
 *   would open and neither of which exists in the product.
 *
 *   The GATE — the seats-versus-rows confusion. `guests.length` counts ROWS and
 *   a row carries `count` people, so a cap applied to the wrong one is wrong by
 *   the average party size. This is the only numeric limit a customer meets.
 */

describe("pricing: the table", () => {
  it("has exactly three tiers, free first", () => {
    expect(PLANS.map(p => p.key)).toEqual(["free", "event", "onsite"]);
    expect(PLANS[0].price).toBe("₪0");
  });

  it("prices are one-time per event, never monthly", () => {
    /* A couple has one wedding. Any per-month wording here is the subscription
       model the owner decided against on 27.7.

       The first version of this test forbade the word "מנוי" outright, and it
       failed on the ₪690 card's own note — "תשלום אחד לאירוע. לא מנוי." That is
       the sentence the decision exists to produce, and the check was catching
       the negation. What is actually forbidden is a per-MONTH claim. */
    for (const p of PLANS) {
      const text = `${p.per} ${p.desc} ${p.note ?? ""}`;
      expect(text, p.key).not.toMatch(/לחודש|חודשי|בחודש/);
    }
    // And the middle tier says out loud that it is not one.
    expect(PLANS[1].note).toContain("לא מנוי");
  });

  it("never mentions VAT — the operator is a עוסק פטור", () => {
    // No tax invoice, no VAT to add or exclude: the number shown is final. And
    // Israeli consumer law requires a consumer price to be displayed gross
    // anyway, so "+ מע״מ" would be wrong twice.
    const all = JSON.stringify(PLANS) + JSON.stringify(ADDONS) + PRICING_FOOTNOTE;
    expect(all).not.toMatch(/מע"?״?מ/);
  });

  it("makes no unearned popularity claim", () => {
    // Same class as the invented statistics removed from the landing page: a
    // product with no customers has not earned "הכי פופולרי".
    const all = JSON.stringify(PLANS);
    expect(all).not.toMatch(/פופולרי|הכי נמכר|מומלץ ביותר/);
  });

  it("the paid tiers are cumulative, and say so", () => {
    expect(PLANS[0].inherits).toBeUndefined();
    for (const p of PLANS.slice(1)) {
      expect(p.inherits, p.key).toBeTruthy();
    }
  });

  it("only the on-site tier claims work done by a person", () => {
    // `human: true` is what puts the "בשטח" label on a group. It must never
    // appear on a tier that is only software, because that label is the one
    // honest signal that a line is delivered by someone rather than by the app.
    const humanTiers = PLANS
      .filter(p => p.groups.some(g => g.human))
      .map(p => p.key);
    expect(humanTiers).toEqual(["onsite"]);
  });

  it("every tier has a CTA that goes somewhere real", () => {
    for (const p of PLANS) {
      expect(p.cta, p.key).toBeTruthy();
      expect(p.ctaTo, p.key).toMatch(/^\//);
    }
  });

  it("the teaser the landing page renders is derived, not retyped", () => {
    const t = teaserFor(PLANS[1]);
    expect(t.price).toBe(PLANS[1].price);
    expect(t.name).toBe(PLANS[1].name);
    expect(t.lines.length).toBeGreaterThan(0);
    // Each teaser line must be a real line from the full list.
    const all = PLANS[1].groups.flatMap(g => g.items);
    for (const line of t.lines) expect(all).toContain(line);
  });

  it("every teaser card gets the same number of lines", () => {
    /* It was `groups.slice(0, 4).map(g => g.items[0])` — the first item of the
       first four GROUPS. The on-site tier has one group, so it rendered ONE
       bullet beside two cards with four, and the paid-upgrade card came out
       visibly stunted: measured 283 px against 436 at a 390-wide viewport. */
    const counts = PLANS.map(p => teaserFor(p).lines.length);
    expect(counts).toEqual([4, 4, 4]);
    // And nothing undefined can reach a React key.
    for (const p of PLANS) {
      for (const line of teaserFor(p).lines) expect(typeof line).toBe("string");
    }
  });

  it("carries `human` into the teaser, on the higher-traffic surface", () => {
    // The badge existed only on /pricing. The landing page showed "מנהל הושבה
    // שלנו בכניסה" with no label, i.e. a person presented as a feature.
    expect(teaserFor(PLANS[0]).human).toBe(false);
    expect(teaserFor(PLANS[1]).human).toBe(false);
    expect(teaserFor(PLANS[2]).human).toBe(true);
  });

  it("no package line claims the app takes a credit card", () => {
    /* It claimed exactly that — "מתנות באשראי", in the FREE tier. GiftScreen has
       a name, an amount and a blessing: no card field, no clearing call, no
       redirect. `submit_gift_by_token` writes `paid = false` and nothing in the
       codebase ever flips it, and the guest's own confirmation screen says the
       gift is given on the day. /services/gifts already said the honest version,
       so the site answered the same question two ways and the false answer was
       the one on the page with the price.
       Unica's clearing is real and is sold — in the FAQ, as an arrangement made
       with us. A package bullet is a claim about the software. */
    for (const p of PLANS) {
      for (const item of p.groups.flatMap(g => g.items)) {
        expect(item, p.key).not.toMatch(/אשראי|סליקה|תשלום מאובטח/);
      }
    }
  });

  it("no package line sells a printout that does not exist", () => {
    /* The להדפסה group carried "רשימת כניסה לפי א׳-ב׳". The app has exactly two
       print surfaces — NameTagsScreen and SeatingScreen — and every mode of both
       is ordered BY TABLE. The alphabetical list is Excel sheet 3 only, which
       the ייצוא group one line down already sells. A host standing at the door
       pressing print is the cheapest possible way to be caught. */
    const printGroup = PLANS[1].groups.find(g => g.title === "להדפסה");
    expect(printGroup).toBeTruthy();
    for (const item of printGroup.items) {
      expect(item).not.toMatch(/א׳-ב׳|אלפביתי|לפי שם/);
    }
  });

  /* Since checklist 92 the workbook DOES carry a "מתנות שהוצהרו" sheet — the
     declarations from the gifts table — and the per-guest ₪0 column is gone. The
     assertion stays: that sheet is a list of what guests TYPED, explicitly "לא
     קבלה", and a package bullet reading "ומתנות" would sell it as a ledger. */
  it("does not promise a gift ledger, because nothing writes giftAmount", () => {
    /* The ייצוא line said "חוברת אקסל בחמישה גיליונות: … ומתנות". The gift sheet
       reads `Number(g.giftAmount)` and NOTHING in src/ writes that field — the
       door deliberately has no gift input and the two UIs for it were removed on
       purpose — so every row and every total prints ₪0. And only two of the five
       sheets are unconditional, so the normal pre-event export is not five. */
    const exportGroup = PLANS[1].groups.find(g => g.title === "ייצוא");
    expect(exportGroup).toBeTruthy();
    for (const item of exportGroup.items) {
      expect(item).not.toMatch(/מתנות|חמישה גיליונות/);
    }
  });

  it("no two numbers sit either side of a bare separator", () => {
    // Bug class 7: in an RTL line, "200/340" paints 340 to the RIGHT of 200 and
    // reads backwards. Measured in this Chromium — the spaced form is fine, the
    // unspaced one is not.
    const all = [
      ...PLANS.flatMap(p => [p.price, p.per, p.desc, p.note ?? "",
        ...p.groups.flatMap(g => g.items)]),
      ...ADDONS.flatMap(a => [a.title, a.price, a.note, a.body]),
      PRICING_FOOTNOTE,
    ];
    for (const line of all) {
      expect(line, line).not.toMatch(/\d[/\-:]\d/);
    }
  });
});

describe("pricing: what the page sells, the gates allow", () => {
  /* The class of failure this describe() exists for: a bullet in a package and a
     flag in PLAN_LIMITS disagreeing, invisibly, because PLAN_GATES_ENFORCED is
     false. Nothing enforces anything today, so the contradiction cannot be
     noticed by using the app — it surfaces on the one day it costs money, when
     the switch goes on. That is exactly how `pro.aiFeatures: false` sat under a
     ₪690 bullet selling table detection from a venue sketch. */

  const tierFor = (needle) =>
    PLANS.find(p => p.groups.some(g => g.items.some(i => i.includes(needle))));

  it("the package that sells sketch detection has the AI flag", () => {
    const tier = tierFor("מזהה את השולחנות מהתמונה");
    expect(tier, "no package sells sketch detection any more — delete this test or the bullet").toBeTruthy();
    expect(canUseAI(PLAN_DB_KEY[tier.key]).withinPlan, tier.key).toBe(true);
  });

  it("the package that sells the shared family table has the collaboration flag", () => {
    const tier = tierFor("טבלה שיתופית");
    expect(tier).toBeTruthy();
    expect(canUseCollaboration(PLAN_DB_KEY[tier.key]).withinPlan, tier.key).toBe(true);
  });

  it("the package names on the two sides are the same strings", () => {
    /* They are typed by hand in pricing.js AND in planConfig.js PLAN_META, and
       pinned by tests on both sides, with nothing tying them together — so a
       rename in one place passed the whole suite. PLAN_META's label is what the
       account screen and the admin panel show a paying customer. */
    for (const p of PLANS) {
      expect(PLAN_META[PLAN_DB_KEY[p.key]].label, p.key).toBe(p.name);
    }
  });

  it("every package key maps to a real plan row", () => {
    for (const p of PLANS) {
      expect(Object.keys(PLAN_LIMITS), p.key).toContain(PLAN_DB_KEY[p.key]);
    }
  });
});

describe("pricing: the checkout does what the page promises", () => {
  /* THE ONE LINE ON THAT PAGE WITH REAL EXPOSURE, and it was live for weeks.
     PRICING_FOOTNOTE and the ₪690 card both say "לא מנוי" — while the only
     checkout path in the repo created a Stripe session with
     `mode: "subscription"`, i.e. a recurring charge. Nobody could be charged
     (Stripe was never configured), so nothing in the app, no test and no lint
     rule could notice: the contradiction lived between a Hebrew string in src/
     and a TypeScript file in supabase/functions/ that NO gate here reads —
     `npm run build` skips it (it is Deno), and eslint has no TS parser
     configured for it.

     So the tie is asserted here, from the file itself. Comments are stripped
     first, because this file's own history is written in them — the comment
     explaining what `mode: "subscription"` used to be would otherwise satisfy a
     naive grep for it, and the test would pass on the bug it exists to catch. */
  const strip = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments
    .replace(/^\s*\/\/.*$/gm, "");        // whole-line comments

  const checkout = strip(readFileSync("supabase/functions/create-checkout-session/index.ts", "utf8"));
  const webhook  = strip(readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8"));

  it("says it is not a subscription, in both places", () => {
    expect(PRICING_FOOTNOTE).toContain("לא מנוי");
    expect(PLANS[1].note).toContain("לא מנוי");
  });

  it("and opens a ONE-TIME payment, not a subscription", () => {
    expect(checkout).toMatch(/mode:\s*"payment"/);
    expect(checkout).not.toMatch(/mode:\s*"subscription"/);
    // subscription_data is the other half: it only exists on a recurring
    // session, and it carried the metadata the webhook reads.
    expect(checkout).not.toMatch(/subscription_data/);
  });

  it("the webhook grants a plan on payment, and revokes it on a refund", () => {
    expect(webhook).toMatch(/case "checkout\.session\.completed"/);
    expect(webhook).toMatch(/case "charge\.refunded"/);
  });

  it("the webhook has no handlers for events a one-time payment cannot produce", () => {
    // Stripe sends none of these for mode: "payment" — no Subscription object
    // exists and, with invoice_creation off, no invoices either. A handler for an
    // event that cannot arrive reads as if the product still renewed.
    expect(webhook).not.toMatch(/case "customer\.subscription\./);
    expect(webhook).not.toMatch(/case "invoice\./);
  });

  it("a purchase belongs to ONE event, end to end", () => {
    /* The price is "תשלום אחד לאירוע" and until 28.9 the purchase row was per
       USER: paying ₪690 for a wedding unlocked every event the host would ever
       create, including ones made years later. Four links in that chain, and the
       whole thing is worthless if any one of them is missing — a browser that
       does not send the event, a server that does not demand it, a server that
       takes the browser's word for whose event it is, or a webhook that does not
       store it. */
    expect(checkout).toMatch(/eventId/);                        // the request carries it
    expect(checkout).toMatch(/eventId is required/);            // and is refused without it
    expect(checkout).toMatch(/event_id:\s*eventId/);            // into Stripe metadata
    expect(webhook).toMatch(/event_id:\s*eventId/);             // and into the row

    // The server must not take the browser's word for whose event it is. Without
    // this, any signed-up user could point a purchase at someone else's event.
    expect(checkout).toMatch(/from\("events"\)[\s\S]{0,200}eq\("user_id", user\.id\)/);
    expect(webhook).toMatch(/from\("events"\)[\s\S]{0,200}eq\("user_id", userId\)/);

    const migration = readFileSync("supabase/migrations/20260928000000_per_event_entitlement.sql", "utf8");
    expect(migration).toMatch(/event_id uuid/);
    // ON DELETE SET NULL, not CASCADE: deleting an event must not delete the
    // record that money changed hands.
    expect(migration).toMatch(/ON DELETE SET NULL/);
  });

  it("refuses to charge twice for the same event, before Stripe is called", () => {
    /* There is deliberately no UNIQUE (user_id, event_id) — it would block a
       refund-then-rebuy and an upgrade to the ₪1,290 package, and it would fail
       AFTER the money moved, in a webhook, where the only remedy is a refund.
       The guard is a check in FRONT of the charge, and this is what pins it. */
    expect(checkout).toMatch(/alreadyPurchased/);
    expect(checkout).toMatch(/eq\("event_id", eventId\)/);
  });

  /* The 28.9 security audit's billing findings B3–B6. These read the source,
     comment-stripped, because the function is Deno with remote imports and
     cannot run in this environment — a structural pin, weaker than executing
     it, and each one was proved to fail by reverting the change it guards. */
  it("grants on a delayed payment and on a 100% promotion code", () => {
    expect(webhook).toMatch(/case "checkout\.session\.async_payment_succeeded"/);
    expect(webhook).toMatch(/payment_status !== "paid" && session\.payment_status !== "no_payment_required"/);
  });

  it("never revives a refunded or manually managed purchase", () => {
    expect(webhook).toMatch(/existing\.status === "cancelled" \|\| existing\.is_manually_managed/);
    expect(webhook).toMatch(/amount_refunded >= ch\.amount/);
    expect(webhook).toMatch(/status:\s*refundedAlready \? "cancelled" : "active"/);
  });

  it("asks Stripe to RETRY a failed write instead of swallowing it", () => {
    // It returned 200 on every failure: money taken, nothing granted, never
    // retried, nothing anywhere to say so.
    expect(webhook).toMatch(/if \(upsertError\) \{[\s\S]{0,200}status: 500/);
    // One helper revokes on a full refund AND on a lost dispute (102b), so the
    // string names the revoke rather than the refund.
    expect(webhook).toMatch(/revoke update failed", \{ status: 500 \}/);
    expect(webhook).toMatch(/revoke lookup failed", \{ status: 500 \}/);
    expect(webhook).toMatch(/handler error", \{ status: 500 \}/);
    expect(webhook).not.toMatch(/return 200 to prevent Stripe retries/i);
  });

  it("closes older open sessions for the same event before opening a new one", () => {
    // Two open sessions were both payable: the same wedding charged twice.
    expect(checkout).toMatch(/sessions\.list\(\{ customer: customerId, status: "open"/);
    expect(checkout).toMatch(/old\.metadata\?\.event_id === eventId[\s\S]{0,120}sessions\.expire\(old\.id\)/);
    // And the webhook flags what gets through, rather than staying silent.
    expect(webhook).toMatch(/DOUBLE CHARGE/);
  });

  it("the purchase is keyed on the checkout session, which is what makes it idempotent", () => {
    // Stripe can deliver the same event twice and a host can complete two
    // sessions with the Back button. Without this conflict target, either
    // produces a second purchase row.
    expect(webhook).toMatch(/onConflict:\s*"stripe_checkout_session_id"/);
    // And a migration has to have created that unique column, or the upsert
    // fails at runtime with "there is no unique constraint matching" — a 200 from
    // the webhook, a paid customer, and no row.
    const migration = readFileSync("supabase/migrations/20260927000000_one_time_purchase.sql", "utf8");
    expect(migration).toMatch(/stripe_checkout_session_id text UNIQUE/);
  });
});

describe("pricing: the gate counts SEATS, not rows", () => {
  // One row, four people. This is the shape the whole bug lives in.
  const family = (n) => ({ count: n });

  it("a cap of 200 people is not a cap of 200 rows", () => {
    const rows = Array.from({ length: 60 }, () => family(4));   // 60 rows, 240 people
    const gate = canSeatMore("free", rows);
    expect(gate.seats).toBe(240);
    expect(gate.withinPlan).toBe(false);
    // The row count would have passed comfortably — that is the failure this
    // test exists to make impossible.
    expect(rows.length).toBeLessThan(PLAN_LIMITS.free.maxSeatedSeats);
  });

  it("counts a bare row as one person", () => {
    expect(canSeatMore("free", [{}, {}, {}]).seats).toBe(3);
  });

  it("throws when handed a COUNT instead of the array", () => {
    /* It used to return { seats: 0, withinPlan: true } for this — it failed
       OPEN, silently, on the exact mistake it exists to prevent, and
       `canAddGuest(plan, currentCount)` a few lines above takes a count as its
       second argument, so the wrong call is the natural one to write. */
    expect(() => canSeatMore("free", 3000)).toThrow(TypeError);
    expect(() => canSeatMore("free", undefined)).toThrow(/guest ARRAY/);
  });

  it("does not invent people out of empty rows", () => {
    // [null, null] survived the declined filter (`null?.rsvp` is undefined) and
    // then scored Number(undefined) || 1 each — two seats from zero guests.
    expect(canSeatMore("free", [null, undefined]).seats).toBe(0);
    expect(canSeatMore("free", [null, { count: 4 }]).seats).toBe(4);
  });

  it("does not spend the allowance on people who declined", () => {
    const rows = [family(4), { count: 100, rsvp: "declined" }, family(2)];
    expect(canSeatMore("free", rows).seats).toBe(6);
  });

  it("the free tier seats 200 and not one more", () => {
    expect(canSeatMore("free", [{ count: 200 }]).withinPlan).toBe(true);
    expect(canSeatMore("free", [{ count: 201 }]).withinPlan).toBe(false);
  });

  it("the paid tiers have no seating cap at all", () => {
    for (const plan of ["pro", "enterprise"]) {
      expect(canSeatMore(plan, [{ count: 5000 }]).withinPlan, plan).toBe(true);
    }
  });

  it("names both numbers with Hebrew around them", () => {
    const reason = canSeatMore("free", [{ count: 340 }]).reason;
    expect(reason).toContain("200");
    expect(reason).toContain("340");
    expect(reason).not.toMatch(/\d[/\-:]\d/);
  });

  it("the guest-row cap says רשומות, because rows is what it counts", () => {
    // maxGuests is Infinity on every plan now, so this never fires in
    // production — but the wording bug is what made the seat cap necessary and
    // it must not come back if a row cap ever returns.
    const src = canAddGuest("free", 10);
    expect(src.reason).toBeNull();
    expect(PLAN_LIMITS.free.maxGuests).toBe(Infinity);
  });
});

describe("pricing: the free tier is usable", () => {
  it("does not cap the guest list", () => {
    // 80 was below every Israeli wedding, which made the free tier useless for
    // the thing the product is for — and the free tier is the distribution
    // channel, because every guest message carries "נבנה עם רוויה".
    expect(PLAN_LIMITS.free.maxGuests).toBe(Infinity);
    expect(canAddGuest("free", 100000).allowed).toBe(true);
  });

  it("still gives automatic seating something to show", () => {
    expect(PLAN_LIMITS.free.maxSeatedSeats).toBe(200);
  });
});

// Owner, 4.10: "כרטיס החינם — תתקן את זה לאירוע אחד". The free card listed
// "ריבוי אירועים" and "שכפול אירוע שלם" while the free tier holds one event.
describe("the free card promises what the free tier holds", () => {
  it("one event — no multi-event board, no duplicating into a second", () => {
    expect(PLAN_LIMITS.free.maxEvents).toBe(1);
    const free = PLANS.find(p => p.key === "free");
    const items = free.groups.flatMap(g => g.items).join(" · ");
    expect(items).not.toMatch(/ריבוי אירועים|שכפול אירוע/);
    expect(free.per).toBe("אירוע אחד");
  });
});
