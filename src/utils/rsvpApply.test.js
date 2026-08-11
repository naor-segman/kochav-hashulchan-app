import { describe, it, expect } from "vitest";
import { pickMeal, pickCompanions } from "./rsvpApply.js";

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

describe("pickCompanions — a partly filled form is not a deletion", () => {
  const EIGHT = ["רות", "אבי", "נועה", "יונתן", "מיכל", "עומר", "ליאור", "טל"];

  it("takes the guest's list when they named everyone", () => {
    expect(pickCompanions({ companions: ["א", "ב"] }, ["ג"])).toEqual(["א", "ב"]);
  });

  it("keeps eight hand-typed names when the answer carries one", () => {
    // The reported shape. The RSVP form renders count-1 OPTIONAL boxes and
    // drops the blanks, so "nine of us are coming" plus one typed name sends
    // exactly one name. Replacing eight with that one deleted seven names and
    // left count at nine.
    expect(pickCompanions({ companions: ["רון האחיין"] }, EIGHT)).toEqual(EIGHT);
  });

  it("keeps them when the answer carries none at all", () => {
    for (const answer of [undefined, null, [], ["", "  "], "not an array", 7]) {
      expect(pickCompanions({ companions: answer }, EIGHT)).toEqual(EIGHT);
    }
    expect(pickCompanions({}, EIGHT)).toEqual(EIGHT);
    expect(pickCompanions(null, EIGHT)).toEqual(EIGHT);
  });

  it("replaces when the answer is at least as long", () => {
    const nine = [...EIGHT, "דנה"];
    expect(pickCompanions({ companions: nine }, EIGHT)).toEqual(nine);
    expect(pickCompanions({ companions: EIGHT }, EIGHT)).toEqual(EIGHT);
  });

  it("returns an array, never undefined, so a new guest gets a real list", () => {
    expect(pickCompanions({}, undefined)).toEqual([]);
    expect(pickCompanions({ companions: ["א"] }, [])).toEqual(["א"]);
  });

  it("trims and drops blanks on both sides", () => {
    expect(pickCompanions({ companions: ["  א ", "", "ב"] }, [])).toEqual(["א", "ב"]);
    // Three stored names, two of them blank, so "current" is really one.
    expect(pickCompanions({ companions: ["א"] }, ["ב", "", "  "])).toEqual(["א"]);
  });
});
