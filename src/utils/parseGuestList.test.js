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

// ── Closing the survivors of the mutation run ────────────────────────────────
// Each of these was a mutation the suite above did not catch. Every one turned
// out to be a real input, not a hypothetical.

describe("numbers that are ALMOST a phone number", () => {
  it("rejects an extra digit in FRONT of an otherwise valid number", () => {
    // The mirror image of the trailing-digit case. Without the leading digit
    // boundary this matched its last ten digits and stored a stranger's number.
    expect(parseGuestList("עמיר סגמן 10501234567")).toEqual([
      { name: "עמיר סגמן 10501234567", phone: "" },
    ]);
  });

  it("rejects a zero-less mobile with one digit too many", () => {
    expect(parseGuestList("עמיר סגמן 5012345678")).toEqual([
      { name: "עמיר סגמן 5012345678", phone: "" },
    ]);
  });

  it('reads "+972 (0)52…" — the business-card form — as one number', () => {
    // normalizePhone has handled this for a long time; the parser never fed it
    // one, so the whole thing used to stay in the name.
    expect(parseGuestList("עמיר סגמן +972 (0)52-123-4567")).toEqual([
      { name: "עמיר סגמן", phone: "0521234567" },
    ]);
  });

  it("never reads a country code as a companion count", () => {
    // "+972" left on its own must not become "+97" → 98 seats.
    expect(parseGuestList("משפחת כהן +972")).toEqual([
      { name: "משפחת כהן +972", phone: "" },
    ]);
  });
});

describe("vav-initial names, which look exactly like a conjunction", () => {
  it("keeps a vav SURNAME intact when +N says it is one person", () => {
    // וקנין / וייס / ולדמן are ordinary Israeli surnames. Splitting on the vav
    // would turn יובל וקנין into two guests, יובל and קנין.
    expect(parseGuestList("עמיר סגמן +1 (יובל וקנין)")[0].companions).toEqual(["יובל וקנין"]);
  });

  it("keeps a vav FIRST name intact when the list is comma-separated", () => {
    expect(parseGuestList("משפחת לוי (ורד, דני)")).toEqual([
      { name: "משפחת לוי", phone: "", count: 3, companions: ["ורד", "דני"] },
    ]);
  });

  it("still splits when the vav really is the conjunction", () => {
    expect(parseGuestList("משפחת לוי (ורד ודני)")[0].companions).toEqual(["ורד", "דני"]);
  });
});

describe("a repeated bracket", () => {
  it("removes the bracket it actually read, not an identical earlier one", () => {
    // The last bracket is the companion list; String.replace would have cut the
    // first one and left the read-from text in the name.
    expect(parseGuestList("דוד לוי (דני ורונית) חברים (דני ורונית)")).toEqual([
      { name: "דוד לוי (דני ורונית) חברים", phone: "", count: 3, companions: ["דני", "רונית"] },
    ]);
  });
});

describe("count and companions cannot disagree, however absurd the line", () => {
  it("clamps companions with count at MAX_SEATS", () => {
    // The only invariant breach found in 60,000 fuzzed pastes: `count` was
    // clamped to 50 and `companions` was not, so a bracket holding 60 names
    // produced companions.length 60 against count 50 — the one shape the rest
    // of the app treats as impossible. Every reader re-clamps, so nothing
    // broke; that is not the same as the gateway being right.
    const names = Array.from({ length: 60 }, (_, i) => "מלווה " + i);
    const [row] = parseGuestList(`ראש המשפחה (${names.join(", ")})`);
    expect(row.count).toBe(50);
    expect(row.companions.length).toBeLessThanOrEqual(row.count - 1);
    expect(row.companions).toHaveLength(49);
    expect(row.companions[0]).toBe("מלווה 0");
  });

  it("leaves an ordinary line completely alone", () => {
    const [row] = parseGuestList("עמיר סגמן+1 (יובל סגמן)");
    expect(row).toMatchObject({ name: "עמיר סגמן", count: 2, companions: ["יובל סגמן"] });
  });
});

// ── The lists people actually send (13.8) ────────────────────────────────────
// The owner's objection, in his words: if it cannot match a main name to a main
// name, companions to companions and the phone to the phone, then adding from a
// list is irrelevant and will only make a mess.
//
// So this block is a MEASUREMENT, not a happy path. Every case below is a line
// written the way Israelis write one, and every one of them was wrong before:
// 8 of 19 correct, now 19 of 19. The parser used to handle exactly the format
// we had documented — which is the format nobody's existing list is in.
describe("a real pasted list, not the format we documented", () => {
  const one = text => parseGuestList(text)[0] ?? null;

  describe("a spreadsheet paste is COLUMNS, not prose", () => {
    // Tabs were rewritten to " , " before anything looked at them, throwing
    // away the one piece of structure a spreadsheet paste has. Measured:
    // "דנה כהן ⇥ 0501234567 ⇥ 2" produced a guest called "דנה כהן 2" with NO
    // phone and one seat — the single most likely place a 300-name list
    // already exists, silently mangled.
    it("reads name / phone / count whatever order the columns are in", () => {
      expect(one("דנה כהן\t0501234567\t2")).toMatchObject({ name: "דנה כהן", phone: "0501234567", count: 2 });
      expect(one("דנה כהן\t2\t0501234567")).toMatchObject({ name: "דנה כהן", phone: "0501234567", count: 2 });
      expect(one("0501234567\tדנה כהן")).toMatchObject({ name: "דנה כהן", phone: "0501234567" });
    });

    it("does not invent a count from a column that is not one", () => {
      expect(one("דנה כהן\tחברים מהצבא").count).toBeUndefined();
    });
  });

  describe("the count notations that are not '+N'", () => {
    it.each([
      ["משפחת כהן 4",          "משפחת כהן", 4],
      ["משפחת כהן - 4 אנשים",  "משפחת כהן", 4],
      ["משפחת לוי — 3 איש",    "משפחת לוי", 3],
      ["דנה כהן x2",           "דנה כהן",   2],
      ["דנה כהן X2",           "דנה כהן",   2],
      ["דנה כהן * 2",          "דנה כהן",   2],
      ["דנה כהן (2)",          "דנה כהן",   2],
      ["משפחת לוי 5 מקומות",   "משפחת לוי", 5],
    ])("%s", (line, name, count) => {
      expect(one(line)).toMatchObject({ name, count });
    });

    it("leaves the digits OUT of the name", () => {
      // The old failure was double: the count was ignored AND the number stayed
      // glued to the name, so the place card printed "משפחת כהן 4".
      expect(one("משפחת כהן 4").name).not.toMatch(/\d/);
    });

    it("does not read a year, a house number or a phone as a count", () => {
      expect(one("דנה כהן 1985").count).toBeUndefined();
      expect(one("דנה כהן 0501234567")).toMatchObject({ phone: "0501234567" });
      expect(one("דנה כהן 0501234567").count).toBeUndefined();
    });

    it("refuses to start a count in the middle of a longer number", () => {
      // `\d{1,2}` with no left boundary matched the last two digits of "120".
      // Caught by measuring, not by reading the regex.
      expect(parseGuestList('סה"כ 120 איש')).toEqual([]);
    });

    it("a bracket with a NAME in it is still a note, not a count", () => {
      expect(one("דנה כהן (בעבודה)")).toMatchObject({ name: "דנה כהן (בעבודה)" });
      expect(one("דנה כהן (בעבודה)").count).toBeUndefined();
    });
  });

  describe("a plus with a name after it", () => {
    it("reads the name as a companion, not as part of the guest's name", () => {
      expect(one("דנה + יוסי")).toMatchObject({ name: "דנה", count: 2, companions: ["יוסי"] });
    });

    it("still reads a plus with a NUMBER as a count", () => {
      expect(one("דנה +2")).toMatchObject({ name: "דנה", count: 3 });
    });

    it("never reads a foreign dialling code as a companion", () => {
      // "+1 212 555 1234" must stay a phone number.
      const r = one("דנה כהן +1 212 555 1234");
      expect(r.count).toBeUndefined();
      expect(r.name).toBe("דנה כהן");
    });
  });

  describe("section headers are not guests", () => {
    // Every real list is built out of these, so a 200-name paste arrived with
    // nonsense rows scattered through it for the host to find by eye.
    it.each([
      "צד כלה:",
      "משפחה:",
      "=== חברים מהצבא ===",
      "--- צד חתן ---",
      "***",
      'סה"כ 120 איש',
      "סך הכל 80",
    ])("%s produces nothing", (line) => {
      expect(parseGuestList(line)).toEqual([]);
    });

    it("but a name that merely CONTAINS a colon or a dash still counts", () => {
      // The guard is deliberately narrow: dropping a real guest is much worse
      // than leaving a header in, which the host can see and delete.
      expect(one("דנה כהן - אחות של יוסי")).toMatchObject({ name: "דנה כהן - אחות של יוסי" });
      expect(one("ד\"ר דנה כהן")).toBeTruthy();
    });
  });

  it("a whole realistic list, end to end", () => {
    const rows = parseGuestList([
      "צד כלה:",
      "דנה כהן\t0501234567\t2",
      "משפחת לוי 4",
      "יוסי + מיכל",
      "",
      "=== חברים מהצבא ===",
      "אבי ברק 052-987-6543",
      'סה"כ 8 אנשים',
    ].join("\n"));
    expect(rows.map(r => r.name)).toEqual(["דנה כהן", "משפחת לוי", "יוסי", "אבי ברק"]);
    expect(countSeats(rows)).toBe(2 + 4 + 2 + 1);
    expect(countWithPhone(rows)).toBe(2);
  });
});

// Israeli guest lists carry addresses, because the same note doubles as the
// list for the driver. "רחוב הרצל 15" parsed as fifteen seats — fifteen phantom
// chairs and fifteen phantom meals from one line.
describe("a street number is a house number, not a seat count", () => {
  it.each([
    ["רחוב הרצל 15",     "רחוב הרצל 15"],
    ["רח' ביאליק 8",     "רח' ביאליק 8"],
    ["שדרות רוטשילד 22", "שדרות רוטשילד 22"],
    ["דרך השלום 3",      "דרך השלום 3"],
  ])("%s keeps its number", (line, name) => {
    const [row] = parseGuestList(line);
    expect(row.name).toBe(name);
    expect(row.count).toBeUndefined();
  });

  // The guard is narrow on purpose: only the ambiguous bare-number form is
  // suppressed, because a street line CAN still declare seats explicitly.
  it("still reads an explicit count on a line that opens with a street word", () => {
    expect(parseGuestList("רחוב הרצל x2")[0].count).toBe(2);
    expect(parseGuestList("רחוב הרצל (3)")[0].count).toBe(3);
    expect(parseGuestList("רחוב הרצל 4 אנשים")[0].count).toBe(4);
  });

  it("does not touch an ordinary name with a trailing count", () => {
    expect(parseGuestList("דוד לוי 4")[0].count).toBe(4);
    expect(parseGuestList("משפחת כהן 6")[0].count).toBe(6);
  });

  // The reason the first version of this guard did nothing: \b after a Hebrew
  // letter never matches, because \w stays ASCII even under /u. Same trap that
  // once stopped the "סה״כ" noise guard from firing.
  it("matches the street word at a real boundary, not via \\b", () => {
    expect(/^רחוב\b/u.test("רחוב הרצל 15")).toBe(false);
    expect(parseGuestList("רחובות 5")[0].count).toBe(5);   // a CITY, not a street
  });
});
