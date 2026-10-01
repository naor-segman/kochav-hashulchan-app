// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../../test/dom.js";
import { normalizeEvent } from "../../utils/eventHelpers.js";

/* 38b: at 320px the signup button ("הצטרפו חינם", 117px) left the event name in
 * the breadcrumb 47px of its 125. Measured in Chromium after the change: 91px
 * at 320, 111 at 340, 87 at 360 (where the long label returns), no horizontal
 * scroll. jsdom has no layout, so this pins the mechanism: two labels, and the
 * stylesheet swaps them under 360px. */

vi.mock("../../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: null, loading: false }),
  AuthProvider: ({ children }) => children,
}));
Element.prototype.scrollBy ??= () => {};
const Shell = (await import("./Shell.jsx")).default;

describe("Shell signup button on a narrow phone (38b)", () => {
  it("carries a short label next to the long one", () => {
    const ev = normalizeEvent({ id: "e1", name: "החתונה של דנה ויוסי", type: "חתונה" });
    render(<MemoryRouter><Shell screen="guests" activeEvent={ev} go={vi.fn()} showToast={vi.fn()}><p /></Shell></MemoryRouter>);
    const link = screen.getAllByRole("link").find(a => a.getAttribute("href") === "/signup");
    const labels = [...link.querySelectorAll("span")].map(s => s.textContent);
    expect(labels).toEqual(["הצטרפו חינם", "הצטרפו"]);
  });

  it("and the stylesheet shows only the short one below 360px", () => {
    const css = readFileSync("src/components/layout/Shell.module.css", "utf8");
    expect(css).toMatch(/\.signupShort\s*\{\s*display:\s*none;?\s*\}/);
    const mq = css.match(/@media \(max-width: 359px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(mq).toMatch(/\.signupLong\s*\{\s*display:\s*none/);
    expect(mq).toMatch(/\.signupShort\s*\{\s*display:\s*inline/);
  });
});
