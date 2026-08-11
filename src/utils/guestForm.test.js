import { describe, it, expect } from "vitest";
import {
  applyGuestForm, guestToForm, setCompanionAt, companionsForCount,
  normalizeCompanions, newGuestFromForm, moneyOrUndefined, seatCount,
} from "./guestForm.js";

// The row from the owner's real event: one guest, eight named companions.
const EIGHT = ["אבי", "בני", "גילי", "דנה", "הדס", "ורד", "זהר", "חן"];
const guest8 = () => ({
  id: "g1", name: "טל שוורץ", side: "bride", group: "משפחה קרובה", count: 9,
  phone: "0501234567", notes: "ליד הבמה", rsvp: "confirmed", meal: "regular",
  companions: [...EIGHT], estGift: 500,
  // Fields the form does not own and must never touch:
  giftAmount: 300, arrived: true, arrivedAt: 1700000000000, scannedBy: "דיילת",
});

describe("guestToForm — the edit form starts with everything the row has", () => {
  it("loads all eight companion names", () => {
    expect(guestToForm(guest8(), "משפחה קרובה").companions).toEqual(EIGHT);
  });

  it("pads the companion boxes to the seat count", () => {
    const f = guestToForm({ name: "א", count: 4, companions: ["x"] }, "משפחה");
    expect(f.companions).toEqual(["x", "", ""]);
  });

  it("survives a row whose companions were never set", () => {
    expect(guestToForm({ name: "א", count: 3 }, "משפחה").companions).toEqual(["", ""]);
    expect(guestToForm({ name: "א", count: 3, companions: null }, "משפחה").companions).toEqual(["", ""]);
  });
});

describe("applyGuestForm — editing must not destroy what it did not touch", () => {
  it("changing ONE companion keeps the other seven", () => {
    const g = guest8();
    const form = guestToForm(g, "משפחה קרובה");
    form.companions = setCompanionAt(form.companions, 3, "דנה קורן");
    const out = applyGuestForm(g, form, form.group);
    expect(out.companions).toEqual(["אבי", "בני", "גילי", "דנה קורן", "הדס", "ורד", "זהר", "חן"]);
  });

  it("editing only the phone leaves every companion name in place", () => {
    const g = guest8();
    const form = { ...guestToForm(g, "משפחה קרובה"), phone: "0509999999" };
    const out = applyGuestForm(g, form, form.group);
    expect(out.companions).toEqual(EIGHT);
    expect(out.phone).toBe("0509999999");
  });

  it("keeps fields the form does not own (arrival, day-of gift, unknown keys)", () => {
    const g = guest8();
    const out = applyGuestForm(g, guestToForm(g, "משפחה קרובה"), "משפחה קרובה");
    expect(out.giftAmount).toBe(300);
    expect(out.arrived).toBe(true);
    expect(out.arrivedAt).toBe(1700000000000);
    expect(out.scannedBy).toBe("דיילת");
    expect(out.id).toBe("g1");
  });

  // The bug class this file exists for: a form that carries no companions array
  // is silence, not an instruction to erase.
  it("a form with NO companions array leaves the stored names untouched", () => {
    const g = guest8();
    const form = guestToForm(g, "משפחה קרובה");
    delete form.companions;
    expect(applyGuestForm(g, form, form.group).companions).toEqual(EIGHT);
  });

  it("a form with companions: undefined leaves the stored names untouched", () => {
    const g = guest8();
    const form = { ...guestToForm(g, "משפחה קרובה"), companions: undefined };
    expect(applyGuestForm(g, form, form.group).companions).toEqual(EIGHT);
  });

  it("an explicit empty array DOES clear them (the host emptied every box)", () => {
    const g = guest8();
    const form = { ...guestToForm(g, "משפחה קרובה"), companions: ["", "", "", "", "", "", "", ""] };
    expect(applyGuestForm(g, form, form.group).companions).toEqual([]);
  });

  it("lowering the seat count KEEPS the names it no longer has seats for", () => {
    // This used to truncate, and truncating on save destroyed data: one
    // keystroke in "כמה כיסאות לשמור" plus שמרו deleted eight hand-typed names
    // permanently, with no warning and no way back. Companion names are the
    // only thing in this product that cannot be reconstructed from anywhere
    // else. A stored list longer than the seat count costs nothing —
    // guestSeatNames() takes only the first `count`, and the form renders only
    // `count - 1` boxes — and raising the count again brings them back.
    const g = guest8();
    const form = { ...guestToForm(g, "משפחה קרובה"), count: 3 };
    const out = applyGuestForm(g, form, form.group);
    expect(out.count).toBe(3);
    expect(out.companions).toEqual(EIGHT);
  });

  it("and a later raise gets every one of them back", () => {
    const g = guest8();
    const lowered = applyGuestForm(g, { ...guestToForm(g, "משפחה קרובה"), count: 3 }, "משפחה קרובה");
    const raised  = applyGuestForm(lowered, { ...guestToForm(lowered, "משפחה קרובה"), count: 9 }, "משפחה קרובה");
    expect(raised.companions).toEqual(EIGHT);
  });

  it("raising the seat count keeps the names already typed", () => {
    const g = { id: "x", name: "א", count: 2, companions: ["בני"], side: "bride", group: "חברים" };
    const form = { ...guestToForm(g, "חברים"), count: 5 };
    expect(applyGuestForm(g, form, form.group).companions).toEqual(["בני"]);
  });

  it("keeps an inner blank so positions stay meaningful, drops the trailing ones", () => {
    const g = { id: "x", name: "א", count: 5, companions: ["בני", "", "דנה", ""], side: "bride", group: "חברים" };
    const out = applyGuestForm(g, guestToForm(g, "חברים"), "חברים");
    expect(out.companions).toEqual(["בני", "", "דנה"]);
  });

  it("trims the name and stores the resolved custom group", () => {
    const g = guest8();
    const form = { ...guestToForm(g, "משפחה קרובה"), name: "  טל שוורץ  ", group: "אחר" };
    const out = applyGuestForm(g, form, "חברים מהגן");
    expect(out.name).toBe("טל שוורץ");
    expect(out.group).toBe("חברים מהגן");
  });

  it("does not write giftAmount — the day-of screen owns it", () => {
    const g = guest8();
    const form = { ...guestToForm(g, "משפחה קרובה"), giftAmount: 999 };
    expect(applyGuestForm(g, form, form.group).giftAmount).toBe(300);
  });

  it("an empty estimated gift is stored as undefined, not 0 or NaN", () => {
    const g = { id: "x", name: "א", count: 1, side: "bride", group: "חברים", estGift: 400 };
    const out = applyGuestForm(g, { ...guestToForm(g, "חברים"), estGift: "" }, "חברים");
    expect(out.estGift).toBeUndefined();
  });
});

describe("newGuestFromForm", () => {
  it("builds a clean row with the id and the typed companions", () => {
    const form = {
      name: " רון ", phone: "052", side: "groom", group: "חברים", count: 3,
      companions: ["מיה", "יעל"], notes: "", estGift: "300", rsvp: "pending", meal: "regular",
    };
    const g = newGuestFromForm(form, "new1", "חברים");
    expect(g).toEqual({
      id: "new1", name: "רון", phone: "052", side: "groom", group: "חברים",
      count: 3, notes: "", rsvp: "pending", meal: "regular", estGift: 300,
      companions: ["מיה", "יעל"],
    });
  });
});

describe("small pure helpers", () => {
  it("seatCount floors at 1 and caps at 50", () => {
    expect(seatCount(0)).toBe(1);
    expect(seatCount("7")).toBe(7);
    expect(seatCount("abc")).toBe(1);
    expect(seatCount(900)).toBe(50);
  });

  it("setCompanionAt fills the gap rather than shifting positions", () => {
    expect(setCompanionAt(["א"], 3, "ד")).toEqual(["א", "", "", "ד"]);
  });

  it("companionsForCount never returns more boxes than extra seats", () => {
    expect(companionsForCount(EIGHT, 3)).toEqual(["אבי", "בני"]);
    expect(companionsForCount(EIGHT, 1)).toEqual([]);
  });

  it("normalizeCompanions returns null for a non-array (no opinion)", () => {
    expect(normalizeCompanions(undefined, 5)).toBeNull();
    expect(normalizeCompanions("רונית", 5)).toBeNull();
  });

  it("moneyOrUndefined", () => {
    expect(moneyOrUndefined("")).toBeUndefined();
    expect(moneyOrUndefined("abc")).toBeUndefined();
    expect(moneyOrUndefined("-5")).toBe(0);
    expect(moneyOrUndefined("500")).toBe(500);
  });
});
