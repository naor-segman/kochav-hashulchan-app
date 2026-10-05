import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  PLAN_LIMITS, PLAN_META, STATUS_META, ALARMING_STATUSES,
  PLAN_KEYS, STATUS_KEYS,
  getPlanLimits, getPlanLabel, getStatusLabel,
  isKnownPlan, isKnownStatus, displayStatus,
  getPlanMeta,
  getStatusMeta
} from "./planConfig.js";

/**
 * planConfig.js had no test of its own, and every plan limit featureGates.js
 * checks is a number in this file. featureGates.test.js exercises the RULE
 * (`currentCount < maxGuests`) — nothing anywhere pinned the value the rule is
 * applied to, so `maxGuests: 80` becoming `8` passed the whole suite.
 *
 * It is also the file the two customer-facing surfaces read for their Hebrew:
 * AccountScreen renders PLAN_META and STATUS_META directly, and CLAUDE.md
 * records that this module ships in the customer bundle despite the "admin is
 * lazy-loaded" claim. Both of its documented incidents are label lookups
 * falling through — `enterprise_annual` rendering as a plan NAME mid-Hebrew
 * table, and `incomplete_expired` reaching the panel unmapped and clipping to
 * "te_expired" at 390px.
 */

describe("planConfig — the plan limits featureGates actually checks", () => {
  it("pins the exact free-tier numbers", () => {
    /* The free tier, per the model decided in checklist 31. Changing any of
       these is a pricing decision, never a refactor.

       `maxGuests` was 80 and is now Infinity: 80 is below every Israeli
       wedding, so the free tier could not be used for the thing the product is
       for — and the free tier IS the distribution channel, because every guest
       message carries "נבנה עם רוויה". The cap that replaced it is
       `maxSeatedSeats`, counted in PEOPLE rather than rows. */
    expect(PLAN_LIMITS.free.maxEvents).toBe(1);
    expect(PLAN_LIMITS.free.maxGuests).toBe(Infinity);
    expect(PLAN_LIMITS.free.maxSeatedSeats).toBe(100);
    expect(PLAN_LIMITS.free.advancedExports).toBe(false);
    expect(PLAN_LIMITS.free.aiFeatures).toBe(false);
    /* TRUE, and it was false. The free package sells "טבלה שיתופית: המשפחה
       ממלאת מהטלפון" — CollabScreen behind a share token — so a false here was
       a plan row that would delete a free-tier bullet the day the gates go on.
       The flag differentiates nothing now, which is the honest state. */
    expect(PLAN_LIMITS.free.collaboration).toBe(true);
  });

  it("pins the exact pro-tier numbers", () => {
    /* `pro` is the ₪690 per-event package. You pay per event, so capping how
       many events you may create would be charging twice for the same thing —
       hence Infinity, where it used to be 20. Collaboration moved down here
       from enterprise: the shared family table is one of the things this
       package sells, and gating it above meant the plan row refused a feature
       the pricing page advertised. */
    expect(PLAN_LIMITS.pro.maxEvents).toBe(Infinity);
    expect(PLAN_LIMITS.pro.maxGuests).toBe(Infinity);
    expect(PLAN_LIMITS.pro.maxSeatedSeats).toBe(Infinity);
    expect(PLAN_LIMITS.pro.advancedExports).toBe(true);
    /* TRUE, and it was false — the one gate that contradicted something we
       charge for. pricing.js sells table detection from an uploaded venue sketch
       inside this ₪690 package, and that is FloorPlanEditor.handleDetect behind
       canUseAI(plan) → this flag. */
    expect(PLAN_LIMITS.pro.aiFeatures).toBe(true);
    expect(PLAN_LIMITS.pro.collaboration).toBe(true);
  });

  it("gives enterprise true Infinity, not a large finite number", () => {
    // `currentCount < maxEvents` is the gate. A sentinel like 9999 is a wall an
    // enterprise account can actually hit, and `guestSlotsLeft` special-cases
    // Infinity by identity — a big number there returns a finite slot count and
    // a bulk paste starts silently truncating.
    expect(PLAN_LIMITS.enterprise.maxEvents).toBe(Infinity);
    expect(PLAN_LIMITS.enterprise.maxGuests).toBe(Infinity);
    expect(Number.isFinite(PLAN_LIMITS.enterprise.maxGuests)).toBe(false);
    expect(PLAN_LIMITS.enterprise.advancedExports).toBe(true);
    expect(PLAN_LIMITS.enterprise.aiFeatures).toBe(true);
    expect(PLAN_LIMITS.enterprise.collaboration).toBe(true);
  });

  it("never lets a cheaper plan out-rank a dearer one on any limit", () => {
    // The property behind the three tables above: a customer who pays more must
    // never get less. This catches a limit edited in one tier and forgotten in
    // the next, which no single-tier assertion can.
    const numeric = ["maxEvents", "maxGuests", "maxSeatedSeats"];
    const boolean = ["advancedExports", "aiFeatures", "collaboration"];
    for (const k of numeric) {
      expect(PLAN_LIMITS.free[k]).toBeLessThanOrEqual(PLAN_LIMITS.pro[k]);
      expect(PLAN_LIMITS.pro[k]).toBeLessThanOrEqual(PLAN_LIMITS.enterprise[k]);
    }
    for (const k of boolean) {
      expect(PLAN_LIMITS.free[k] <= PLAN_LIMITS.pro[k]).toBe(true);
      expect(PLAN_LIMITS.pro[k] <= PLAN_LIMITS.enterprise[k]).toBe(true);
    }
  });

  it("gives every plan every limit key, so no gate ever reads undefined", () => {
    // `currentCount < undefined` is false — a missing key does not throw, it
    // locks the tier out of the feature entirely.
    const keys = Object.keys(PLAN_LIMITS.free);
    for (const plan of PLAN_KEYS) {
      expect(Object.keys(PLAN_LIMITS[plan]).sort()).toEqual([...keys].sort());
      for (const k of keys) expect(PLAN_LIMITS[plan][k]).toBeDefined();
    }
  });
});

describe("planConfig — getPlanLimits falls back rather than returning nothing", () => {
  it("resolves each known plan to its own table", () => {
    for (const plan of PLAN_KEYS) expect(getPlanLimits(plan)).toBe(PLAN_LIMITS[plan]);
  });

  it("falls back to FREE — the most restrictive tier — for anything unknown", () => {
    // A DB value nobody anticipated must not accidentally grant enterprise.
    //
    // NOT asserted here, because it is currently FALSE and a test must not
    // encode a bug as correct behaviour: `PLAN_LIMITS[plan] ?? PLAN_LIMITS.free`
    // reads through the prototype chain, so the four Object.prototype names
    // ("toString", "constructor", "valueOf", "hasOwnProperty") resolve to a
    // FUNCTION rather than to undefined, `??` never fires, and every limit
    // destructures to undefined. Measured: canAddGuest("toString", 0).withinPlan
    // is false and planGuestSlotsLeft("toString", 0) is NaN — locked out of
    // everything instead of falling back to free. `plan` is a DB text column
    // written by the Stripe webhook, so it is not reachable from host input
    // today; the one-line fix is Object.hasOwn(). Reported, not fixed here —
    // this branch is test infrastructure.
    for (const bad of [undefined, null, "", "enterprise_annual", "PRO", 0, false]) {
      expect(getPlanLimits(bad)).toBe(PLAN_LIMITS.free);
    }
  });

  it("does not treat a falsy-but-valid lookup as missing", () => {
    // `??`, not `||`. The distinction matters the moment a limits object is
    // ever falsy, and `||` would also swallow a legitimately empty tier.
    expect(getPlanLimits("free")).toBe(PLAN_LIMITS.free);
  });
});

describe("planConfig — Hebrew labels, and the raw DB key never reaching a screen", () => {
  it("labels every plan in Hebrew", () => {
    for (const plan of PLAN_KEYS) {
      expect(getPlanLabel(plan)).toBe(PLAN_META[plan].label);
      expect(getPlanLabel(plan)).toMatch(/[֐-׿]/);
    }
    // The customer-facing names of the three packages (checklist 31). These are
    // what appear in the account screen, so they must match the pricing page.
    expect(getPlanLabel("free")).toBe("הרשימה בידיים");
    expect(getPlanLabel("pro")).toBe("בלי הפתעות");
    expect(getPlanLabel("enterprise")).toBe("עד התשובה האחרונה");
  });

  it("never falls through to the raw key for an unknown plan", () => {
    // The recorded incident: `enterprise_annual` rendered as a plan NAME in the
    // middle of a Hebrew table and read like a real label.
    expect(getPlanLabel("enterprise_annual")).toBe("תוכנית לא מוכרת");
    expect(getPlanLabel("enterprise_annual")).not.toContain("enterprise");
    expect(getPlanLabel(null)).toBe("—");
    expect(getPlanLabel("")).toBe("—");
  });

  it("labels every status in Hebrew and never falls through to the raw key", () => {
    for (const s of STATUS_KEYS) {
      expect(getStatusLabel(s)).toBe(STATUS_META[s].label);
      expect(getStatusLabel(s)).toMatch(/[֐-׿]/);
      expect(getStatusLabel(s)).not.toMatch(/[a-z_]{4,}/);
    }
    expect(getStatusLabel("past_due")).toBe("תשלום נכשל");
    expect(getStatusLabel("something_new")).toBe("סטטוס לא מוכר");
    expect(getStatusLabel(null)).toBe("—");
  });

  it("reports known-ness so the screen can put the raw value in a title instead", () => {
    expect(isKnownPlan("pro")).toBe(true);
    expect(isKnownPlan("enterprise_annual")).toBe(false);
    expect(isKnownPlan(null)).toBe(false);
    expect(isKnownStatus("past_due")).toBe(true);
    expect(isKnownStatus("something_new")).toBe(false);
    expect(isKnownStatus(undefined)).toBe(false);
  });

  /* This test used to insist on labels for nine statuses, including four Stripe
     SUBSCRIPTION states (incomplete, incomplete_expired, unpaid, paused). None of
     them can be stored — subscriptions.status has carried
     CHECK (status IN ('active','trialing','cancelled','expired')) since the first
     migration and it has never been relaxed — and since 27.9 purchases are
     one-time, so Stripe does not produce them at all. The test pinned labels for
     values the database refuses, and the admin filter offered them as options
     that could never match a row. Checklist 94.

     So the list is now read against the SCHEMA: the statuses the panel knows are
     exactly the CHECK's, plus past_due, which displayStatus() derives from a flag.
     A migration that changes the CHECK fails this until the labels follow. */
  it("knows exactly the statuses the database can hold, plus past_due", () => {
    const sql = readFileSync("supabase/migrations/20260524000000_admin_foundation.sql", "utf8");
    const check = /status\s+text[^,]*CHECK \(status IN \(([^)]*)\)\)/.exec(sql);
    expect(check, "the subscriptions.status CHECK moved or changed shape").toBeTruthy();
    const dbStatuses = check[1].split(",").map(x => x.trim().replace(/'/g, ""));
    expect(dbStatuses.sort()).toEqual(["active", "cancelled", "expired", "trialing"]);

    // And no later migration relaxed it — the premise of removing the four.
    for (const f of readdirSync("supabase/migrations")) {
      const body = readFileSync(`supabase/migrations/${f}`, "utf8");
      expect(body, f).not.toMatch(/subscriptions_status_check|alter table public\.subscriptions[^;]*status[^;]*check/i);
    }

    expect([...STATUS_KEYS].sort()).toEqual([...dbStatuses, "past_due"].sort());
    for (const s of STATUS_KEYS) expect(isKnownStatus(s), s).toBe(true);
    for (const gone of ["incomplete", "incomplete_expired", "unpaid", "paused"]) {
      expect(isKnownStatus(gone), gone).toBe(false);
      // Still graceful if one ever turns up: a Hebrew "unknown", never the key.
      expect(getStatusLabel(gone)).toBe("סטטוס לא מוכר");
    }
  });
});

describe("planConfig — the delinquency rule", () => {
  it("shows past_due even while Stripe still calls the subscription active", () => {
    // Stripe keeps a failing card as `active` through the retry window and only
    // raises the separate flag. Without this, a customer whose card has been
    // declining for three weeks renders as a green "פעיל" and nobody acts.
    expect(displayStatus({ status: "active", payment_past_due: true })).toBe("past_due");
    expect(displayStatus({ status: "trialing", payment_past_due: true })).toBe("past_due");
  });

  it("passes the nominal status through when nothing is overdue", () => {
    expect(displayStatus({ status: "active", payment_past_due: false })).toBe("active");
    expect(displayStatus({ status: "cancelled" })).toBe("cancelled");
  });

  it("treats a missing subscription as expired, not as active or blank", () => {
    // The default has to be the SAFE side: a row with no status is not a paying
    // customer, and "" would render as "—" next to a live plan badge.
    expect(displayStatus(null)).toBe("expired");
    expect(displayStatus(undefined)).toBe("expired");
    expect(displayStatus({})).toBe("expired");
    expect(displayStatus({ status: null })).toBe("expired");
  });

  it("flags exactly the statuses that need somebody to act", () => {
    expect([...ALARMING_STATUSES].sort()).toEqual(["past_due"]);
    for (const s of ALARMING_STATUSES) expect(STATUS_META[s]).toBeDefined();
    for (const s of ["active", "trialing", "cancelled", "expired"]) {
      expect(ALARMING_STATUSES.has(s)).toBe(false);
    }
  });

  it("puts the statuses that need action first in the picker order", () => {
    expect(STATUS_KEYS[0]).toBe("past_due");
    expect(STATUS_KEYS.slice(0, ALARMING_STATUSES.size).sort())
      .toEqual([...ALARMING_STATUSES].sort());
  });
});

describe("planConfig — the ordered key lists cannot drift from the tables", () => {
  it("lists every plan exactly once, cheapest first", () => {
    expect(PLAN_KEYS).toEqual(["free", "pro", "enterprise"]);
    expect([...PLAN_KEYS].sort()).toEqual(Object.keys(PLAN_LIMITS).sort());
    expect([...PLAN_KEYS].sort()).toEqual(Object.keys(PLAN_META).sort());
    expect(new Set(PLAN_KEYS).size).toBe(PLAN_KEYS.length);
  });

  it("lists every status exactly once", () => {
    // A status present in STATUS_META but absent from STATUS_KEYS is a filter
    // option the panel cannot offer — the rows exist and cannot be found.
    expect([...STATUS_KEYS].sort()).toEqual(Object.keys(STATUS_META).sort());
    expect(new Set(STATUS_KEYS).size).toBe(STATUS_KEYS.length);
  });

  it("gives every plan and status a full colour triple", () => {
    for (const meta of [...Object.values(PLAN_META), ...Object.values(STATUS_META)]) {
      for (const k of ["label", "color", "bgColor", "borderColor"]) {
        expect(meta[k]).toBeTypeOf("string");
        expect(meta[k].length).toBeGreaterThan(0);
      }
    }
  });

  it("every plan and status badge is tokens, and readable on its own ground (107)", async () => {
    // Bug classes 4 and 5 together. These colours are painted as TEXT on the
    // account screen (customer-facing) over their own bgColor. Hex values
    // outside tokens.css kept creeping in (Tailwind blue on `pro`); and the
    // enterprise entry once used the raw --accent at 3.80:1. So: tokens only,
    // never raw --accent as text, and each pair measured from tokens.css.
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/styles/tokens.css", "utf8");
    const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
    const tok = Object.fromEntries([...root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\b/g)].map(m => [m[1], m[2]]));
    const lum = h => { h = h.slice(1); if (h.length === 3) h = [...h].map(c => c + c).join("");
      const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
        .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const of = v => { const m = /^var\(--([a-z0-9-]+)\)$/.exec(v); return m ? tok[m[1]] : null; };
    for (const [name, meta] of [...Object.entries(PLAN_META), ...Object.entries(STATUS_META)]) {
      expect(meta.color, name).toMatch(/^var\(--/);
      expect(meta.bgColor, name).toMatch(/^var\(--/);
      expect(meta.color, name).not.toBe("var(--accent)");
      const fg = of(meta.color), bg = of(meta.bgColor);
      expect(fg && bg, `${name}: ${meta.color} / ${meta.bgColor} are real tokens`).toBeTruthy();
      expect(ratio(fg, bg), `${name}: ${meta.color} on ${meta.bgColor}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// ── The prototype chain is not a plan ────────────────────────────────────────
// `PLAN_LIMITS[plan]` read straight through Object.prototype, and a function is
// truthy — so `?? PLAN_LIMITS.free` never fired. Measured before the fix:
// getPlanLimits("toString").maxGuests was undefined, canAddGuest(0).withinPlan
// was false and slotsLeft was NaN. The account was locked out of everything
// instead of falling back to free. isKnownPlan had the same hole pointing the
// other way — it answered TRUE for "constructor".
//
// `plan` is a text column written by the Stripe webhook, so it is not
// host-reachable today. It is one webhook change away from being so.
describe("plan lookups do not read through the prototype chain", () => {
  const INHERITED = ["toString", "constructor", "valueOf", "hasOwnProperty",
                     "__proto__", "isPrototypeOf", "propertyIsEnumerable"];

  it("falls back to free limits for an inherited property name", () => {
    for (const key of INHERITED) {
      expect(getPlanLimits(key)).toEqual(getPlanLimits("free"));
      expect(getPlanLimits(key).maxGuests).toBe(getPlanLimits("free").maxGuests);
    }
  });

  it("does not call an inherited name a known plan or status", () => {
    for (const key of INHERITED) {
      expect(isKnownPlan(key)).toBe(false);
      expect(isKnownStatus(key)).toBe(false);
      expect(getPlanLabel(key)).toBe("תוכנית לא מוכרת");
    }
  });

  it("returns undefined metadata rather than a function", () => {
    for (const key of INHERITED) {
      expect(getPlanMeta(key)).toBeUndefined();
      expect(getStatusMeta(key)).toBeUndefined();
    }
  });

  it("still answers correctly for the real keys", () => {
    expect(isKnownPlan("free")).toBe(true);
    expect(getPlanLimits("pro").maxGuests).toBe(getPlanLimits("pro").maxGuests);
    expect(getPlanMeta("free")?.label).toBe("הרשימה בידיים");
  });

  it("survives a non-string key without throwing", () => {
    for (const key of [null, undefined, 7, {}, [], true]) {
      expect(getPlanLimits(key)).toEqual(getPlanLimits("free"));
      expect(isKnownPlan(key)).toBe(false);
    }
  });
});

describe("the admin panel's vocabulary follows the product", () => {
  /* Since 27.9 a purchase is one payment for one event — "תשלום אחד לאירוע. לא
     מנוי." on the public pricing page. The admin panel kept calling every
     purchase a מנוי: the nav said "מנויים ותשלומים", the dashboard "מנויים
     פעילים", the activity log "מנוי שונה". Only the owner sees it, which is why
     it survived the customer-facing pass — and it is also why it matters: the
     one person running the business was looking at the model they had rejected.
     Checklist 94. Comments are stripped first; the history is written in them. */
  it("no string the admin panel shows says מנוי", () => {
    const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(d =>
      d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]);
    const files = walk("src/admin").filter(f => /\.(jsx?|mjs)$/.test(f) && !/\.test\./.test(f));
    expect(files.length).toBeGreaterThan(10);   // or this passes by reading nothing
    const hits = files.filter(f => /מנוי/.test(strip(readFileSync(f, "utf8"))));
    expect(hits).toEqual([]);
  });
});
