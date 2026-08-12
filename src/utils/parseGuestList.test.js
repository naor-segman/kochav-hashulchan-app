import { describe, it, expect } from "vitest";
import { parseGuestList, normalizePhone, countWithPhone, countSeats } from "./parseGuestList.js";
import { guestSeatNames } from "./eventHelpers.js";

describe("normalizePhone", () => {
  it("normalises every way an Israeli number gets written", () => {
    expect(normalizePhone("050-123-4567")).toBe("0501234567");
    expect(normalizePhone("+972 50 123 4567")).toBe("0501234567");
    expect(normalizePhone("972501234567")).toBe("0501234567");
    expect(normalizePhone("0501234567")).toBe("0501234567");
    expect(normalizePhone("501234567")).toBe("0501234567");
  });
  it("returns empty for nothing usable", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone("אין")).toBe("");
  });
});

describe("parseGuestList", () => {
  it("still handles a plain list of names", () => {
    expect(parseGuestList("דוד לוי\nשרה כהן")).toEqual([
      { name: "דוד לוי", phone: "" },
      { name: "שרה כהן", phone: "" },
    ]);
  });

  it("picks up a phone after a comma or a dash", () => {
    expect(parseGuestList("דוד לוי, 050-1234567")).toEqual([{ name: "דוד לוי", phone: "0501234567" }]);
    expect(parseGuestList("שרה כהן - 0521234567")).toEqual([{ name: "שרה כהן", phone: "0521234567" }]);
  });

  it("reads a tab-separated spreadsheet column", () => {
    expect(parseGuestList("דוד לוי\t+972 50 123 4567")).toEqual([{ name: "דוד לוי", phone: "0501234567" }]);
  });

  it("handles the phone coming first", () => {
    expect(parseGuestList("0501234567 דוד לוי")).toEqual([{ name: "דוד לוי", phone: "0501234567" }]);
  });

  it("strips the ~ WhatsApp puts before unsaved contacts", () => {
    expect(parseGuestList("~משפחת אברהם")).toEqual([{ name: "משפחת אברהם", phone: "" }]);
  });

  it("strips list numbering and bullets", () => {
    expect(parseGuestList("1. דוד לוי\n• שרה כהן")).toEqual([
      { name: "דוד לוי", phone: "" },
      { name: "שרה כהן", phone: "" },
    ]);
  });

  it("skips blank lines and lines with no name at all", () => {
    expect(parseGuestList("דוד לוי\n\n   \n0501234567")).toEqual([{ name: "דוד לוי", phone: "" }]);
  });

  it("collapses the same person pasted twice", () => {
    const rows = parseGuestList("דוד לוי, 0501234567\nדוד לוי, 050-123-4567\nשרה כהן");
    expect(rows).toHaveLength(2);
  });

  it("survives empty and missing input", () => {
    expect(parseGuestList("")).toEqual([]);
    expect(parseGuestList(undefined)).toEqual([]);
    expect(parseGuestList(null)).toEqual([]);
  });
});

describe("countWithPhone", () => {
  it("counts only the rows that actually carry a number", () => {
    expect(countWithPhone(parseGuestList("א, 0501234567\nב\nג, 0521234567"))).toBe(2);
    expect(countWithPhone([])).toBe(0);
    expect(countWithPhone(undefined)).toBe(0);
  });
});

// ── Regressions from the full-codebase audit (28.7) ──────────────────────────
describe("Hebrew abbreviations and foreign numbers", () => {
  it("keeps gershayim inside an honorific", () => {
    // Stripping every double quote turned ד"ר into דר and עו"ד into עוד
    // ("more") — and that is what printed on the name tag.
    expect(parseGuestList('ד"ר כהן, 0501234567')[0].name).toBe('ד"ר כהן');
    expect(parseGuestList('עו"ד שרה לוי, 0521234567')[0].name).toBe('עו"ד שרה לוי');
  });

  it("still keeps a geresh, which was the original fix", () => {
    expect(parseGuestList("ג'ורג' לוי, 0501112222")[0].name).toBe("ג'ורג' לוי");
  });

  it("extracts a foreign number instead of leaving it in the name", () => {
    // Relatives abroad are normal at an Israeli wedding. Their digits used to
    // stay glued into the name, so they were unreachable from Messages.
    const [a] = parseGuestList("Aunt Sarah +1 212 555 1234");
    expect(a.name).toBe("Aunt Sarah");
    expect(a.phone).toBe("12125551234");

    const [b] = parseGuestList("Uncle Dave +44 20 7946 0958");
    expect(b.name).toBe("Uncle Dave");
    expect(b.phone).toBe("442079460958");
  });

  it("still prefers the Israeli form when both could match", () => {
    expect(parseGuestList("דנה, +972-50-123-4567")[0].phone).toBe("0501234567");
  });
});

// The international-prefix handling had NO test in either file that implements
// it, and both carry a comment saying the bug already shipped once. Deleting
// the `^00` strip left the whole suite green.
describe("normalizePhone — international forms", () => {
  it("strips the 00 dialling prefix", () => {
    expect(normalizePhone("00972521234567")).toBe("0521234567");
    expect(normalizePhone("00972-52-123-4567")).toBe("0521234567");
  });

  it("drops the redundant trunk zero after the country code", () => {
    // How Israelis write their own number on a business card, and what a
    // contacts export produces. This used to store "00521234567".
    expect(normalizePhone("+972 (0)52-123-4567")).toBe("0521234567");
    expect(normalizePhone("972-052-1234567")).toBe("0521234567");
  });

  it("leaves the local forms alone", () => {
    expect(normalizePhone("050-123-4567")).toBe("0501234567");
    expect(normalizePhone("521234567")).toBe("0521234567");  // missing leading zero
    expect(normalizePhone("")).toBe("");
  });
});

// ── The owner's own paste, measured on the live product (12.8) ───────────────
// Everything below is a line the owner actually typed into the paste box and
// watched come out wrong. The old output is quoted in each test.

describe('"+N" and companion names', () => {
  it('reads "+1 (שם)" as a second SEAT with a name, not as part of the name', () => {
    // Was: [{ name: "עמיר סגמן+1 (יובל סגמן)", phone: "" }] — one seat, and
    // יובל recorded nowhere at all. This is how most Israelis write a list.
    expect(parseGuestList("עמיר סגמן+1 (יובל סגמן)")).toEqual([
      { name: "עמיר סגמן", phone: "", count: 2, companions: ["יובל סגמן"] },
    ]);
  });

  it("does not care whether the plus is glued to the name or spaced", () => {
    expect(parseGuestList("עמיר סגמן +1 (יובל סגמן)")[0]).toEqual(
      { name: "עמיר סגמן", phone: "", count: 2, companions: ["יובל סגמן"] });
    expect(parseGuestList("עמיר סגמן + 1 (יובל סגמן)")[0]).toEqual(
      { name: "עמיר סגמן", phone: "", count: 2, companions: ["יובל סגמן"] });
  });

  it('"+2" with no names gives two extra seats and no invented names', () => {
    expect(parseGuestList("עמיר סגמן +2")).toEqual([
      { name: "עמיר סגמן", phone: "", count: 3, companions: [] },
    ]);
  });

  it("splits several companions on a comma", () => {
    expect(parseGuestList("עמיר סגמן +2 (יובל סגמן, נועה סגמן)")).toEqual([
      { name: "עמיר סגמן", phone: "", count: 3, companions: ["יובל סגמן", "נועה סגמן"] },
    ]);
  });

  it("keeps a two-word companion as ONE person when +1 says so", () => {
    // The seat count is the tie-breaker: "+1 (יובל סגמן)" is a man with a
    // surname, not יובל and סגמן.
    expect(parseGuestList("עמיר סגמן +1 (יובל סגמן)")[0].companions).toEqual(["יובל סגמן"]);
  });

  it('reads "(שם ושם)" as two people even with no plus', () => {
    expect(parseGuestList("משפחת כהן (דני ורונית)")).toEqual([
      { name: "משפחת כהן", phone: "", count: 3, companions: ["דני", "רונית"] },
    ]);
  });

  it("splits the vav even when the second name is only two letters", () => {
    expect(parseGuestList("משפחת לוי (אבי ודן)")[0].companions).toEqual(["אבי", "דן"]);
  });

  it("leaves a single-item bracket alone — it is a note, not a person", () => {
    // "דוד לוי (החבר מהעבודה)" must NOT become a guest with a companion called
    // "החבר מהעבודה" and a seat for him.
    expect(parseGuestList("דוד לוי (החבר מהעבודה)")).toEqual([
      { name: "דוד לוי (החבר מהעבודה)", phone: "" },
    ]);
  });

  it("lets the names win when they outnumber the plus", () => {
    const [r] = parseGuestList("עמיר סגמן +1 (יובל, נועה)");
    expect(r.count).toBe(3);
    expect(r.companions).toEqual(["יובל", "נועה"]);
  });

  it("survives the invisible bidi mark a copied RTL line carries", () => {
    expect(parseGuestList("עמיר סגמן‎+1 (יובל סגמן)")[0]).toEqual(
      { name: "עמיר סגמן", phone: "", count: 2, companions: ["יובל סגמן"] });
  });

  it("clamps a typo'd +99 to the seat ceiling the edit form uses", () => {
    expect(parseGuestList("עמיר סגמן +99")[0].count).toBe(50);
  });

  it("reads the phone AND the companions off the same line", () => {
    expect(parseGuestList("עמיר סגמן+1 (יובל סגמן) 0501234567")).toEqual([
      { name: "עמיר סגמן", phone: "0501234567", count: 2, companions: ["יובל סגמן"] },
    ]);
  });

  it("produces exactly the shape guestSeatNames expands", () => {
    // The parser's output is fed straight into a guest row, so the contract
    // that matters is what the name tags print.
    const [r] = parseGuestList("עמיר סגמן+1 (יובל סגמן)");
    expect(guestSeatNames({ name: r.name, count: r.count, companions: r.companions }))
      .toEqual(["עמיר סגמן", "יובל סגמן (עמיר סגמן)"]);
    const [b] = parseGuestList("עמיר סגמן +2");
    expect(guestSeatNames({ name: b.name, count: b.count, companions: b.companions }))
      .toEqual(["עמיר סגמן", "עמיר סגמן +1", "עמיר סגמן +2"]);
  });

  it("leaves an ordinary line at exactly {name, phone}", () => {
    // count/companions are omitted, not set to 1/[] — nothing downstream has to
    // learn a new shape for the common case.
    expect(Object.keys(parseGuestList("דוד לוי")[0])).toEqual(["name", "phone"]);
  });
});

describe("a phone whose leading zero Excel ate", () => {
  it("reads a bare 9-digit mobile instead of gluing it to the name", () => {
    // Was: name "עמיר סגמן 501234567", phone "".
    expect(parseGuestList("עמיר סגמן  501234567")).toEqual([
      { name: "עמיר סגמן", phone: "0501234567" },
    ]);
  });

  it("reads it with a dash in it too", () => {
    expect(parseGuestList("עמיר סגמן 50-1234567")).toEqual([
      { name: "עמיר סגמן", phone: "0501234567" },
    ]);
    expect(parseGuestList("דנה 72-1234567")).toEqual([
      { name: "דנה", phone: "0721234567" },
    ]);
  });

  // ── Deliberately NOT accepted ──
  it("REJECTS a 9-digit number that is one digit short of a mobile", () => {
    // "052-123456" is a typo. Which digit is missing is unknowable, and a
    // guessed number sends the invitation to a stranger, so it stays visible in
    // the name where the host can see it and fix it.
    expect(parseGuestList("עמיר סגמן 052-123456")).toEqual([
      { name: "עמיר סגמן 052-123456", phone: "" },
    ]);
  });

  it("REJECTS a number with one digit too many, and leaves no crumb behind", () => {
    // Was: phone "0501234567" (SOMEONE ELSE'S number, stored as fact) and the
    // leftover "8" appended to the guest's name.
    expect(parseGuestList("עמיר סגמן  05012345678")).toEqual([
      { name: "עמיר סגמן 05012345678", phone: "" },
    ]);
  });

  it("REJECTS a zero-less landline — 8 digits is not enough to be sure", () => {
    // "36123456" could be anything; an Israeli mobile without its zero cannot.
    expect(parseGuestList("עמיר סגמן 36123456")).toEqual([
      { name: "עמיר סגמן 36123456", phone: "" },
    ]);
  });

  it("REJECTS a 9-digit number that opens with no mobile prefix", () => {
    expect(parseGuestList("עמיר סגמן 123456789")[0].phone).toBe("");
  });

  it("still prefers the fully-written form when both are on the line", () => {
    expect(parseGuestList("עמיר 0501234567")[0].phone).toBe("0501234567");
  });
});

describe("two people on one line", () => {
  it("splits them instead of merging them into one corrupt row", () => {
    // Was: one guest called "עמיר סגמן יובל סגמן 0521111111" — one person
    // invented, one lost, and a phone number printed as part of a name.
    expect(parseGuestList("עמיר סגמן 0501234567 יובל סגמן 0521111111")).toEqual([
      { name: "עמיר סגמן", phone: "0501234567" },
      { name: "יובל סגמן", phone: "0521111111" },
    ]);
  });

  it("splits the number-first layout the other way round", () => {
    expect(parseGuestList("0501234567 עמיר סגמן 0521111111 יובל סגמן")).toEqual([
      { name: "עמיר סגמן", phone: "0501234567" },
      { name: "יובל סגמן", phone: "0521111111" },
    ]);
  });

  it("splits three of them", () => {
    expect(parseGuestList("א א 0501111111 ב ב 0502222222 ג ג 0503333333")).toHaveLength(3);
  });

  it("does not invent a second guest from a second number for the same one", () => {
    // A household with two numbers is still one row: the trailing number has
    // nobody attached to it.
    expect(parseGuestList("משפחת כהן 0501234567 0521111111")).toEqual([
      { name: "משפחת כהן", phone: "0501234567" },
    ]);
  });

  it("carries the companions of each half with the right person", () => {
    expect(parseGuestList("עמיר סגמן+1 (יובל) 0501234567 דנה לוי 0521111111")).toEqual([
      { name: "עמיר סגמן", phone: "0501234567", count: 2, companions: ["יובל"] },
      { name: "דנה לוי", phone: "0521111111" },
    ]);
  });

  it("leaves a single-phone line as one row", () => {
    expect(parseGuestList("עמיר סגמן 0501234567")).toHaveLength(1);
  });
});

describe("countSeats", () => {
  it("counts SEATS, not rows — a +1 row is two of them", () => {
    const rows = parseGuestList("עמיר סגמן+1 (יובל)\nדנה לוי\nמשפחת כהן +3");
    expect(rows).toHaveLength(3);
    expect(countSeats(rows)).toBe(2 + 1 + 4);
  });
  it("survives nothing", () => {
    expect(countSeats([])).toBe(0);
    expect(countSeats(undefined)).toBe(0);
  });
});
