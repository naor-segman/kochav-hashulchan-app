import { describe, it, expect } from "vitest";
import { pickMeal } from "./rsvpApply.js";

describe("pickMeal — an unanswered question never deletes an answer", () => {
  it("takes the guest's own choice", () => {
    expect(pickMeal({ meal: "vegan" }, undefined)).toBe("vegan");
  });

  it("prefers the guest's choice over what the host had guessed", () => {
    // The guest is the one who knows. This is the whole reason the question
    // moved to the RSVP form.
    expect(pickMeal({ meal: "vegan" }, "regular")).toBe("vegan");
  });

  it("keeps what the host recorded when the guest skipped the question", () => {
    // The failure this exists to prevent: the host writes down that an uncle is
    // gluten-free, the uncle then confirms through the link without touching
    // the meal dropdown, and the note is gone.
    for (const answer of [undefined, null, "", "   ", 0, false, []]) {
      expect(pickMeal({ meal: answer }, "kosher")).toBe("kosher");
    }
    expect(pickMeal({}, "kosher")).toBe("kosher");
    expect(pickMeal(null, "kosher")).toBe("kosher");
  });

  it("returns undefined rather than an empty string when there is nothing", () => {
    // The result is spread onto the guest row. "" would be a value — it would
    // overwrite the field and read as a deliberate choice everywhere else.
    expect(pickMeal({ meal: "" }, undefined)).toBeUndefined();
    expect(pickMeal({}, "")).toBeUndefined();
    expect(pickMeal({ meal: "  " }, "   ")).toBeUndefined();
  });

  it("trims, so a stray space is not a different meal", () => {
    expect(pickMeal({ meal: "  vegan " }, undefined)).toBe("vegan");
  });

  it("does not care whether the value is a known option", () => {
    // MEAL_OPTIONS lives in the client and changes. A row stored under an
    // option the host later removed must survive being re-applied.
    expect(pickMeal({ meal: "gluten-free" }, "regular")).toBe("gluten-free");
  });
});
