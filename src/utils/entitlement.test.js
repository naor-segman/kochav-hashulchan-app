import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  planForEvent, bestPlanOnAccount, isEventPaid, unpaidEventCount,
} from "./entitlement.js";

/**
 * Per-event entitlement. The rule the whole pricing model rests on.
 *
 * The failure this suite exists to make impossible: a host pays ₪690 for their
 * wedding and every event they ever create is unlocked. That is what the code
 * did — `usePlan()` asked "does this USER have a subscription" — while the page
 * said, and still says, "תשלום אחד לאירוע".
 *
 * The second failure, which is quieter and worse: these functions take the EVENT
 * OBJECT and match on `ev.cloudId`. An event has two ids, and `ev.id` — the one
 * in the URL, the one every screen holds — is NOT the one a purchase references.
 * Passing it would match nothing, every event would read free, and the only
 * symptom would be a paying customer looking at the free tier.
 */

const paid = (eventId, plan = "pro") => ({
  plan, event_id: eventId, status: "active", expires_at: null,
});
/** An event as the app holds it: routed on `id`, purchased on `cloudId`. */
const ev = (localId, cloudId) => ({ id: localId, cloudId });

describe("planForEvent — a purchase unlocks ONE event", () => {
  it("unlocks the event it was bought for", () => {
    const purchases = [paid("cloud-wedding")];
    expect(planForEvent(purchases, ev("local-wedding", "cloud-wedding"))).toBe("pro");
  });

  it("does NOT unlock the host's other events", () => {
    // The whole point. Before this, one payment unlocked the account.
    const purchases = [paid("cloud-wedding")];
    expect(planForEvent(purchases, ev("local-barmitzvah", "cloud-barmitzvah"))).toBe("free");
  });

  it("matches on the CLOUD id, and is not fooled by the local one", () => {
    // A purchase carrying the local id must not unlock the event: the webhook
    // only ever writes a verified events.id, so a row like this can only come
    // from something having gone wrong — and guessing would unlock an event
    // nobody paid for.
    const purchases = [paid("local-wedding")];
    expect(planForEvent(purchases, ev("local-wedding", "cloud-wedding"))).toBe("free");
  });

  it("gives an unsynced event nothing, rather than everything", () => {
    /* No cloudId — a guest-mode draft, or a sync that has not landed. It gets
       nothing because no purchase can name it.
       Note honestly: `planForEvent` also carries an explicit `!!ev?.cloudId`
       guard, and this test does NOT cover it — a mutation removing that clause
       passes, because a uuid string never equals null anyway. See the comment
       there. */
    const purchases = [paid("cloud-x")];
    expect(planForEvent(purchases, ev("local-x", null))).toBe("free");
    expect(planForEvent(purchases, ev("local-x", undefined))).toBe("free");
    expect(planForEvent(purchases, null)).toBe("free");
  });

  it("an account-wide purchase applies to every event, including later ones", () => {
    // event_id null is an admin comp, or a purchase whose event was deleted —
    // the FK is ON DELETE SET NULL so the host keeps what they paid for.
    const purchases = [{ plan: "pro", event_id: null, status: "active", expires_at: null }];
    expect(planForEvent(purchases, ev("a", "cloud-a"))).toBe("pro");
    expect(planForEvent(purchases, ev("b", "cloud-b"))).toBe("pro");
  });

  it("takes the better package when an event has two purchases", () => {
    const purchases = [paid("c1", "pro"), paid("c1", "enterprise")];
    expect(planForEvent(purchases, ev("l1", "c1"))).toBe("enterprise");
  });

  it("ignores a refunded purchase", () => {
    // charge.refunded sets expires_at to the moment of the refund and the status
    // to cancelled. Either alone must be enough to revoke.
    const refunded  = { plan: "pro", event_id: "c1", status: "cancelled", expires_at: null };
    const expired   = { plan: "pro", event_id: "c1", status: "active", expires_at: "2020-01-01T00:00:00Z" };
    expect(planForEvent([refunded], ev("l1", "c1"))).toBe("free");
    expect(planForEvent([expired],  ev("l1", "c1"))).toBe("free");
  });

  it("honours a future expiry date", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const p = { plan: "pro", event_id: "c1", status: "active", expires_at: future };
    expect(planForEvent([p], ev("l1", "c1"))).toBe("pro");
  });

  it("grants nothing for a plan key it does not recognise", () => {
    // A DB value the app does not know must not fall through to something paid.
    const p = { plan: "enterprise_annual", event_id: "c1", status: "active", expires_at: null };
    expect(planForEvent([p], ev("l1", "c1"))).toBe("free");
  });

  it("survives junk without throwing", () => {
    expect(planForEvent(null, ev("l1", "c1"))).toBe("free");
    expect(planForEvent([null, undefined], ev("l1", "c1"))).toBe("free");
    expect(planForEvent([], ev("l1", "c1"))).toBe("free");
  });
});

describe("bestPlanOnAccount — for the screens with no event", () => {
  it("reports the best live purchase anywhere", () => {
    expect(bestPlanOnAccount([paid("c1"), paid("c2", "enterprise")])).toBe("enterprise");
  });

  it("is free when everything is refunded", () => {
    expect(bestPlanOnAccount([{ plan: "pro", event_id: "c1", status: "cancelled" }])).toBe("free");
  });

  it("is deliberately NOT what an event gate would answer", () => {
    // Asking this at a gate is the original bug: one payment, every event open.
    const purchases = [paid("cloud-wedding")];
    expect(bestPlanOnAccount(purchases)).toBe("pro");
    expect(planForEvent(purchases, ev("l-other", "cloud-other"))).toBe("free");
  });
});

describe("unpaidEventCount — what the event allowance counts now", () => {
  const events = [
    ev("l1", "c1"),   // paid
    ev("l2", "c2"),
    ev("l3", null),   // never synced
  ];

  it("counts only the events that have not been paid for", () => {
    expect(unpaidEventCount([paid("c1")], events)).toBe(2);
  });

  it("is every event when nothing has been bought", () => {
    expect(unpaidEventCount([], events)).toBe(3);
    expect(unpaidEventCount(null, events)).toBe(3);
  });

  it("is zero when an account-wide comp covers everything", () => {
    const comp = [{ plan: "pro", event_id: null, status: "active", expires_at: null }];
    expect(unpaidEventCount(comp, events)).toBe(0);
  });

  it("frees up the allowance the moment the wedding is paid for", () => {
    /* The behaviour change, stated as arithmetic. free.maxEvents is 1 and used
       to be compared with events.length, so paying for your wedding still left
       you unable to open anything else — you had bought the package and lost the
       ability to start the bar mitzvah. One unpaid event at a time is the honest
       reading of the free tier's own "אירוע אחד". */
    const one = [ev("l1", "c1")];
    expect(unpaidEventCount([], one)).toBe(1);          // at the limit
    expect(unpaidEventCount([paid("c1")], one)).toBe(0); // paid → room for the next
  });

  it("handles an empty or missing event list", () => {
    expect(unpaidEventCount([], [])).toBe(0);
    expect(unpaidEventCount([], null)).toBe(0);
  });
});

describe("isEventPaid", () => {
  it("is the question the UI asks per event", () => {
    expect(isEventPaid([paid("c1")], ev("l1", "c1"))).toBe(true);
    expect(isEventPaid([paid("c1")], ev("l2", "c2"))).toBe(false);
  });
});

describe("every gate asks about an EVENT, not about the account", () => {
  /* A STATIC check on the call sites, and it exists because a mutation found the
   * hole: changing SeatingScreen's `usePlan(ev)` back to `usePlan()` — which
   * re-creates the original bug on the most valuable paywall in the product —
   * broke nothing. No test renders that screen with purchases, and rendering it
   * would mean standing up dnd-kit and a seating engine to assert one argument.
   *
   * So the invariant is asserted where it lives: `usePlan()` with no argument
   * resolves the best package anywhere on the ACCOUNT, and using it at a gate
   * unlocks every event for someone who paid for one. Exactly two screens
   * legitimately have no event in scope.
   */
  const ALLOWED_ACCOUNT_LEVEL = [
    // AppRoutes sits above /events/:eventId. It uses the account-level form for
    // one thing: the unpaid-event allowance.
    "src/App.jsx",
    // The account screen is handed `events` but has no ACTIVE event; it resolves
    // each one with planFor(e).
    "src/screens/AccountScreen.jsx",
  ];

  it("no component calls usePlan() with no argument except the two that must", () => {
    /* COMMENTS ARE NOT CALL SITES. Two earlier versions of this check grepped
       lines and tried to spot comments by their first characters — and both
       reported failures on files that only TALK about usePlan(): first on the
       comment directly above SeatingScreen's correct `usePlan(ev)` explaining
       why the argument is there, then on a CONTINUATION line inside a block
       comment, which starts with neither "//" nor "*". The check was wrong both
       times, not the code. Strip the comments out of the source and search what
       is left. */
    const strip = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    const files = execSync(
      `grep -rl "usePlan(" src --include=*.jsx --include=*.js | grep -v "src/hooks/usePlan" | grep -v "\\.test\\." || true`,
      { encoding: "utf8" }
    ).split("\n").filter(Boolean);

    const bare = files.filter(f => /usePlan\(\s*\)/.test(strip(readFileSync(f, "utf8"))));

    for (const file of bare) {
      expect(ALLOWED_ACCOUNT_LEVEL, `${file} calls usePlan() with no event`).toContain(file);
    }
    // And the two that must, do — so this cannot pass by finding nothing.
    expect(bare.sort()).toEqual([...ALLOWED_ACCOUNT_LEVEL].sort());
  });

  it("the admin panel resolves the plan with the shared rule, not its own copy", () => {
    /* This file's header claims the entitlement rule has ONE implementation, and
       until 28.9 that was false: AdminUsersScreen picked
       `subs.find(s => s.status === "active" || s.status === "trialing") ?? subs[0]`
       by hand, under a comment promising "the same rule usePlan() applies, so
       support and the customer see one plan". Two copies, so the promise held
       only until one side changed — and one side just did.

       Asserted on the source because the mapping lives inside the screen's fetch
       function and is not exported; a mutation putting the hand-rolled version
       back passes every other test in the suite. */
    const src = readFileSync("src/admin/screens/AdminUsersScreen.jsx", "utf8");
    expect(src).toMatch(/bestPlanOnAccount\(subs\)/);
    expect(src).not.toMatch(/subs\[0\]\?\.plan/);
    expect(src).not.toMatch(/status === "active"/);
    // And it has to ask for the columns the rule reads, or it silently resolves
    // every host to free.
    expect(src).toMatch(/subscriptions\(plan, status, started_at, expires_at, event_id\)/);
  });

  it("finds the call sites at all, so an empty result cannot pass", () => {
    // The failure mode of the check above: a renamed hook, a changed path, and
    // it asserts nothing while reporting green.
    const out = execSync(
      `grep -rln "usePlan(" src --include=*.jsx --include=*.js | grep -v "src/hooks/usePlan" || true`,
      { encoding: "utf8" }
    );
    expect(out.split("\n").filter(Boolean).length).toBeGreaterThanOrEqual(4);
  });
});
