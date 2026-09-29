import { describe, it, expect } from "vitest";
import { pickMeal, pickCompanions, latestPerRespondent } from "./rsvpApply.js";

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

describe("latestPerRespondent — one answer per guest for counting (107/ת4)", () => {
  const r = (id, name, phone, at) => ({ id, guest_name: name, phone, created_at: at });
  it("keeps the newest per phone, in any phone format", () => {
    const rows = [r("a", "יעל", "050-1234567", "2026-09-20"), r("b", "יעל כהן", "+972501234567", "2026-09-21")];
    expect(latestPerRespondent(rows).map(x => x.id)).toEqual(["b"]);
  });
  it("falls back to the name when there is no phone", () => {
    const rows = [r("a", " יעל  כהן", "", "2026-09-21"), r("b", "יעל כהן", "", "2026-09-20")];
    expect(latestPerRespondent(rows).map(x => x.id)).toEqual(["a"]);
  });
  it("yes with a phone, then no without one (the decline form asks for none), is ONE guest — the no (29.9 review)", () => {
    const rows = [r("y", "יעל כהן", "0501234567", "2026-09-20"), r("n", "יעל כהן", null, "2026-09-21")];
    expect(latestPerRespondent(rows).map(x => x.id)).toEqual(["n"]);
  });
  it("and the other order: a phone-less first answer, then one with the phone", () => {
    const rows = [r("a", "יעל כהן", "", "2026-09-20"), r("b", "יעל כהן", "0501234567", "2026-09-21")];
    expect(latestPerRespondent(rows).map(x => x.id)).toEqual(["b"]);
  });
  it("a phone-less answer under a name two different phones gave is ambiguous and stays apart", () => {
    const rows = [r("a", "יעל", "0501111111", "1"), r("b", "יעל", "0502222222", "2"), r("c", "יעל", null, "3")];
    expect(latestPerRespondent(rows).map(x => x.id)).toEqual(["a", "b", "c"]);
  });
  it("different people stay apart, and rows with no key are kept", () => {
    const rows = [r("a", "יעל", "0501111111", "1"), r("b", "יעל", "0502222222", "1"), r("c", "", "", "1")];
    expect(latestPerRespondent(rows).map(x => x.id)).toEqual(["a", "b", "c"]);
  });
});
