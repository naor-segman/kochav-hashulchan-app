import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/* The public service pages, checked against the product (audit 3.10).
 * Each assertion pins a sentence that was false, or internal, when found. */
const read = f => readFileSync(new URL(f, import.meta.url), "utf8");

describe("service pages say what the product does (audit 3.10)", () => {
  it("RSVP: no internal decision log on a public page (C5)", () => {
    // "ההחלטה על מודל הבוט נסגרה; זה מה שנבנה אחריה." was a note from the work
    // plan, printed on the marketing page under "coming soon".
    expect(read("./RsvpServiceScreen.jsx")).not.toMatch(/מודל הבוט|נבנה אחריה/);
  });

  it("seating: constraints are best effort and the misses are flagged (C6)", async () => {
    // The claim is measured, not argued: A must sit with four others at
    // tables of four — no arrangement can honour it, and the engine says so
    // by name. A page that promises "every constraint" is promising this away.
    const { autoAssign, computeViolations } = await import("../../logic/seating.js");
    const guests = [0, 1, 2, 3, 4, 5].map(i => ({ id: "g" + i, name: "אורח" + i, count: 1, side: "bride", group: "x", rsvp: "confirmed" }));
    const tables = [{ id: "t1", name: "שולחן 1", capacity: 4 }, { id: "t2", name: "שולחן 2", capacity: 4 }];
    const constraints = [1, 2, 3, 4].map(i => ({ id: "c" + i, type: "together", guestA: "g0", guestB: "g" + i }));
    const v = computeViolations(guests, tables, constraints, autoAssign(guests, tables, constraints));
    expect(v.some(x => x.type === "together" && /אורח0/.test(x.text))).toBe(true);

    const t = read("./SeatingServiceScreen.jsx");
    expect(t).not.toMatch(/כל האילוצים מכובדים|מכבדת כל/);
    expect(t).toMatch(/ככל שהאולם מאפשר — ומה שלא הסתדר מסומן לכם/);
    expect(t).toMatch(/ומסמנת לכם כל אילוץ שלא הסתדר/);
  });
});
