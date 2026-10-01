// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "../test/dom.js";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import { GROUP_NAME_MAX } from "../data/constants.js";

/* 106 (1.10): a group name over 60 characters came back from the shared table
 * cut, and the cut name became a phantom group. The limit is said where the
 * host types it — in both places a group is created. */
describe("group names are capped where they are typed", () => {
  it("matches the shared table's column width", () => {
    const sql = readFileSync("supabase/migrations/20260724000000_collab_live_table.sql", "utf8");
    expect(sql).toMatch(new RegExp(`guest_group[^\\n]*${GROUP_NAME_MAX}`));
  });
  it("the prompt dialog honours maxLength", () => {
    render(<ConfirmDialog mode="prompt" message="שם הקבוצה" maxLength={GROUP_NAME_MAX} onClose={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", String(GROUP_NAME_MAX));
  });
  it("both creation points in the guest manager pass it", () => {
    const src = readFileSync("src/screens/GuestManagerScreen.jsx", "utf8");
    expect(src.match(/maxLength(: |=\{)GROUP_NAME_MAX/g)).toHaveLength(2);
  });
});
