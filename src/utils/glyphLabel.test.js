import { describe, it, expect } from "vitest";
import { glyphLabel, glyphFontSize } from "./glyphLabel.js";

// The bug: VenueCanvas passed the table's full NAME into a 76px glyph whose
// label is drawn at a fixed 28 user units. Measured at 1280px, "שולחן הורי
// הכלה" rendered 280.9px of text in a 127px box — 77px out of each side — and
// overlapped two neighbouring tables into unreadable fragments.

describe("glyphLabel — what a table is called inside the glyph", () => {
  it("takes the number, which is how a floor plan names a table", () => {
    expect(glyphLabel("שולחן 1", 0)).toBe("1");
    expect(glyphLabel("שולחן 12", 0)).toBe("12");
    expect(glyphLabel("שולחן מספר 7", 0)).toBe("7");
    expect(glyphLabel("Table 12", 0)).toBe("12");
    expect(glyphLabel("7", 0)).toBe("7");
  });

  it("falls back to the first word that says something", () => {
    // "שולחן" prefixes almost every Hebrew table name and distinguishes nothing.
    expect(glyphLabel("שולחן הורי הכלה", 0)).toBe("הורי");
    expect(glyphLabel("VIP", 0)).toBe("VIP");
  });

  it("caps a long word rather than letting it grow", () => {
    expect(glyphLabel("שולחן החברים מהצבא", 0)).toBe("החברי");
    expect(glyphLabel("החברים", 0)).toHaveLength(5);
  });

  it("gives a nameless table its position, so there is still something to point at", () => {
    expect(glyphLabel("", 8)).toBe("9");
    expect(glyphLabel(null, 0)).toBe("1");
    expect(glyphLabel(undefined, 3)).toBe("4");
    expect(glyphLabel("   ", 1)).toBe("2");
  });
});

describe("glyphFontSize — whatever survives still has to fit", () => {
  it("leaves a short label at the designed size", () => {
    // Every other screen in the app passes a table number. Those must not move
    // by a single pixel.
    expect(glyphFontSize("7")).toBe(28);
    expect(glyphFontSize("12")).toBe(28);
  });

  it("shrinks a longer label instead of overflowing the glyph", () => {
    expect(glyphFontSize("הורי")).toBeLessThan(28);
    expect(glyphFontSize("החברי")).toBeLessThan(glyphFontSize("הורי"));
  });

  it("keeps every label inside the 58-unit budget at the widest measured ratio", () => {
    // 0.606 units per character per font unit is the widest Hebrew combination
    // measured with getBBox in the glyph's own user space ("אבגדה").
    const WIDEST = 0.606;
    for (const label of ["1", "12", "123", "הורי", "החברי", "VIP", "אבגדה"]) {
      expect(label.length * glyphFontSize(label) * WIDEST).toBeLessThanOrEqual(58);
    }
  });

  it("never returns something unreadable or non-finite", () => {
    for (const label of ["", "x".repeat(50), null, undefined]) {
      const s = glyphFontSize(label);
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThan(0);
    }
  });
});
