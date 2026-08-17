import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { MOCK_CAPACITY, MOCK_SEATED, MOCK_GUESTS } from "./LandingScreen.jsx";

// The seating card in the hero is decorative — aria-hidden, no interaction — but
// its numbers were not. The head read "58 אורחים" and the foot read
// "48 מתוך 54 אורחים סודרו", on a card that draws the six tables those figures
// describe. 58 is the CAPACITY of those tables, 48 is the seats drawn filled,
// and 54 matched nothing whatsoever.
//
// It is the first thing a visitor sees, and it is a picture of the one thing
// this product claims to do well. A visitor who adds up the glyphs finds the
// arithmetic wrong on the seating app's own seating plan.
//
// The figures are derived from the table array now, so head and foot cannot
// disagree with the drawing. What derivation CANNOT protect is the one free
// number — the guest count — so that is what these invariants are for.

describe("the hero's seating card is internally consistent", () => {
  it("derives capacity and seated from the tables it draws", () => {
    // Pinned to literals as well as to each other: if someone edits a table and
    // the derivation still agrees with itself, these say the picture changed.
    expect(MOCK_CAPACITY).toBe(58);
    expect(MOCK_SEATED).toBe(48);
  });

  it("never seats more people than exist", () => {
    // "52 מתוך 48 אורחים סודרו" is nonsense, and nothing but this stops it.
    expect(MOCK_SEATED).toBeLessThanOrEqual(MOCK_GUESTS);
  });

  it("does not show a plan where the guests cannot fit", () => {
    // More guests than seats is a real situation in the product — the seating
    // engine warns about it. It is not what the hero should be advertising.
    expect(MOCK_GUESTS).toBeLessThanOrEqual(MOCK_CAPACITY);
  });

  it("still has someone left to seat, which is what the card is showing", () => {
    // If seated === guests the "✓ 48 מתוך 54" badge is a finished plan, and the
    // partly-filled glyphs beside it would contradict it.
    expect(MOCK_SEATED).toBeLessThan(MOCK_GUESTS);
  });
});

describe("no figure on the card is hardcoded past the derivation", () => {
  const SRC = readFileSync(new URL("./LandingScreen.jsx", import.meta.url), "utf8");

  it("renders the head and foot from the constants, not from literals", () => {
    // The whole defect was two literals drifting from the picture and from each
    // other. This is what stops the next edit reintroducing one.
    const card = SRC.slice(SRC.indexOf("mockCardHead"), SRC.indexOf("mockCardFoot") + 400);
    expect(card).toContain("{MOCK_GUESTS} אורחים");
    expect(card).toContain("{MOCK_SEATED} מתוך {MOCK_GUESTS}");
    for (const stale of ["58 אורחים", "48 מתוך 54"]) {
      expect(card, `"${stale}" is back as a literal`).not.toContain(stale);
    }
  });
});
