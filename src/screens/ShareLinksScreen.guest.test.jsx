// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../test/dom.js";

/* 136 stage D (31.10): signed out, the screen's nine rows each carried a
 * "למה?" button that opened the same explanation the note at the top gives.
 * One way on now, in the note; every row still says its link is locked. */
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: null, loading: false }),
  AuthProvider: ({ children }) => children,
}));

const ShareLinksScreen = (await import("./ShareLinksScreen.jsx")).default;
const { SHARE_GROUPS } = await import("../components/share/shareLinks.js");

describe("ShareLinksScreen — signed out", () => {
  it("one button to open an account, no 'למה?' per row, every row locked", () => {
    render(<MemoryRouter><ShareLinksScreen activeEvent={{ id: "e1", tokens: {} }} go={() => {}} showToast={() => {}} /></MemoryRouter>);
    expect(screen.getAllByRole("button", { name: "לפתיחת חשבון חינם" })).toHaveLength(1);
    expect(screen.queryAllByRole("button", { name: "למה?" })).toHaveLength(0);
    const rows = SHARE_GROUPS.reduce((n, g) => n + g.links.length, 0);
    expect(screen.getAllByText("הקישור נפתח אחרי פתיחת חשבון")).toHaveLength(rows);
  });
});
