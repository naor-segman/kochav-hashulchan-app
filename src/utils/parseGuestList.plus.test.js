import { describe, it, expect } from "vitest";
import { parseGuestList } from "./parseGuestList.js";

/* 91: only the LAST "+ name" group was read. "דנה כהן + בת זוג + ילד" became a
 * guest called "דנה כהן + בת זוג" — printed that way on the place card — with
 * one seat too few. */
describe("repeated '+ name' groups (91)", () => {
  it("every group becomes a seat and leaves the name", () => {
    expect(parseGuestList("דנה כהן + בת זוג + ילד")).toEqual([
      { name: "דנה כהן", phone: "", count: 3, companions: ["", "ילד"] },
    ]);
    expect(parseGuestList("דנה + יוסי + רון")).toEqual([
      { name: "דנה", phone: "", count: 3, companions: ["יוסי", "רון"] },
    ]);
  });

  it("in a spreadsheet name cell too", () => {
    expect(parseGuestList("דנה כהן + בת זוג + ילד\t0501234567")).toEqual([
      { name: "דנה כהן", phone: "0501234567", count: 3, companions: ["", "ילד"] },
    ]);
  });

  it("one group is unchanged", () => {
    expect(parseGuestList("דנה כהן + יוסי")).toEqual([
      { name: "דנה כהן", phone: "", count: 2, companions: ["יוסי"] },
    ]);
  });
});
