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
});
