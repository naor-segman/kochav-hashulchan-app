import { describe, it, expect } from "vitest";
import { bigLabel, bigLabelTier } from "./tableCardLabel.js";

describe("bigLabel", () => {
  it("keeps only the number of a numbered table", () => {
    expect(bigLabel({ name: "שולחן 12" })).toBe("12");
    expect(bigLabel({ name: "שולחן 3" })).toBe("3");
    expect(bigLabel({ name: "שולחן 12 " })).toBe("12");
  });

  it("keeps the whole name of a named table — for that one the name IS the number", () => {
    expect(bigLabel({ name: "שולחן הורי הכלה" })).toBe("שולחן הורי הכלה");
    expect(bigLabel({ name: "החברים מהצבא" })).toBe("החברים מהצבא");
  });

  it("falls back to a dash rather than an empty card", () => {
    expect(bigLabel({ name: "" })).toBe("—");
    expect(bigLabel({ name: "   " })).toBe("—");
    expect(bigLabel({})).toBe("—");
    expect(bigLabel(null)).toBe("—");
    expect(bigLabel(undefined)).toBe("—");
  });

  it("does not turn a name that merely contains digits into those digits", () => {
    expect(bigLabel({ name: "שולחן 3 של המשפחה" })).toBe("שולחן 3 של המשפחה");
  });
});

describe("bigLabelTier", () => {
  // The sizes themselves live in the stylesheet; what is pinned here is which
  // label gets which one, because that is the part that decides whether the
  // card prints or is clipped.
  it("gives a one- or two-digit table number the largest size", () => {
    expect(bigLabelTier("1")).toBe("xl");
    expect(bigLabelTier("12")).toBe("xl");
  });

  it("steps down for three and four characters", () => {
    expect(bigLabelTier("123")).toBe("lg");
    expect(bigLabelTier("1234")).toBe("lg");
  });

  it("steps down again for a short word", () => {
    expect(bigLabelTier("VIP 12")).toBe("md");
    expect(bigLabelTier("הורים")).toBe("md");
    expect(bigLabelTier("12345678")).toBe("md");
  });

  it("uses the smallest size for a real table name — the case that was clipped", () => {
    expect(bigLabelTier("שולחן הורי הכלה")).toBe("sm");
    expect(bigLabelTier("123456789")).toBe("sm");
  });

  it("counts a surrogate pair as the one glyph it prints as", () => {
    // "🎉12" is 4 UTF-16 units but three glyphs wide.
    expect(bigLabelTier("🎉12")).toBe("lg");
  });

  it("trims, and never throws on junk", () => {
    expect(bigLabelTier("  12  ")).toBe("xl");
    expect(bigLabelTier("")).toBe("xl");
    expect(bigLabelTier(null)).toBe("xl");
    expect(bigLabelTier(undefined)).toBe("xl");
  });
});
