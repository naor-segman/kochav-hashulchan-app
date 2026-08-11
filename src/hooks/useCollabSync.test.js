import { describe, it, expect } from "vitest";
import { matchExistingGuest, pickCompanions } from "./useCollabSync.js";

const guest = (id, name, phone) => ({ id, name, phone, side: "bride", group: "משפחה", count: 1 });

describe("matchExistingGuest (collab dedup)", () => {
  const list = [
    guest("g1", "דוד כהן", "0501234567"),
    guest("g2", "רותי לוי", "0527654321"),
  ];

  it("matches the same shared row id", () => {
    expect(matchExistingGuest(list, { id: "g2", name: "משהו אחר", phone: "0500000000" })).toBe(list[1]);
  });

  it("merges a family submission of the same person (phone + name match)", () => {
    const m = matchExistingGuest(list, { id: "new", name: "דוד כהן", phone: "0501234567" });
    expect(m).toBe(list[0]);
  });

  it("does NOT merge two different people who share a phone", () => {
    // same phone as דוד כהן, different person → must stay separate (the bug fix)
    expect(matchExistingGuest(list, { id: "new", name: "מיכל כהן", phone: "0501234567" })).toBeNull();
  });

  it("does NOT merge two people with the same name but different phones", () => {
    expect(matchExistingGuest(list, { id: "new", name: "דוד כהן", phone: "0539999999" })).toBeNull();
  });

  it("treats +972 / leading-zero phone formats as equal", () => {
    const m = matchExistingGuest(list, { id: "new", name: "דוד כהן", phone: "+972-50-123-4567" });
    expect(m).toBe(list[0]);
  });

  it("returns null (new guest) when phone is missing", () => {
    expect(matchExistingGuest(list, { id: "new", name: "דוד כהן", phone: "" })).toBeNull();
  });
});

// The shared table is the only place in this product where a person who is not
// the customer types data that cannot be reconstructed. These pin the rule that
// silence from the table never deletes it.
describe("pickCompanions (collab → app)", () => {
  const row = (companions, count = 9) => ({ id: "r1", guests_count: count, companions });
  const EIGHT = ["אבי", "בני", "גילי", "דנה", "הדס", "ורד", "זהר", "חן"];
  const withNames = { id: "r1", companions: [...EIGHT] };

  it("takes the names the table actually carries", () => {
    expect(pickCompanions(row(["רונית", "טל"], 3), null, null)).toEqual(["רונית", "טל"]);
  });

  it("keeps the app's names when the table sends no companions field at all", () => {
    // A database still running the pre-restore RPC: the column is simply absent.
    expect(pickCompanions({ id: "r1", guests_count: 9 }, withNames, null)).toEqual(EIGHT);
  });

  it("keeps the app's names when the table sends an EMPTY list it never filled", () => {
    // This is the regression: '[]' is the column default, not an instruction.
    expect(pickCompanions(row([]), withNames, null)).toEqual(EIGHT);
    expect(pickCompanions(row(["", "", ""]), withNames, null)).toEqual(EIGHT);
  });

  it("DOES clear when the table used to carry names and now does not", () => {
    const prev = { id: "r1", guests_count: 9, companions: [...EIGHT] };
    expect(pickCompanions(row([]), withNames, prev)).toEqual([]);
  });

  it("clamps kept names to the seat count", () => {
    expect(pickCompanions(row([], 3), withNames, null)).toEqual(["אבי", "בני"]);
  });

  it("returns an empty list, not undefined, for a brand-new single-seat row", () => {
    expect(pickCompanions(row([], 1), null, null)).toEqual([]);
  });
});
