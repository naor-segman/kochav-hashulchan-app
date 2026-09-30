import { describe, it, expect } from "vitest";
import { nextTableNames } from "./tableNames.js";

describe("nextTableNames — the preview and the add use one numbering", () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ name: "שולחן " + (i + 1) }));
  it("a new prefix starts at 1, whatever the table count (fourth review: the preview said רזרבה 7)", () => {
    expect(nextTableNames(six, "רזרבה", 2)).toEqual(["רזרבה 1", "רזרבה 2"]);
  });
  it("continues after the highest number used, skipping a deleted one's gap", () => {
    expect(nextTableNames([{ name: "שולחן 1" }, { name: "שולחן 3" }], "שולחן", 1)).toEqual(["שולחן 4"]);
  });
});
