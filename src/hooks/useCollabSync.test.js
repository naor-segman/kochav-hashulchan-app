import { describe, it, expect } from "vitest";
import { matchExistingGuest } from "./useCollabSync.js";

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
