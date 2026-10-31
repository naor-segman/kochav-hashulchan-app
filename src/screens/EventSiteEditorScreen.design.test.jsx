// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, act } from "../test/dom.js";
import { normalizeEvent } from "../utils/eventHelpers.js";

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));

const EventSiteEditorScreen = (await import("./EventSiteEditorScreen.jsx")).default;

/* 136 stage D (31.10): the editor was eleven open cards, the "not published"
 * warning appeared twice, and upload problems were toasts. */
const ev = (site = {}) => normalizeEvent({ id: "e1", name: "x", type: "חתונה", date: "2026-12-01",
  tokens: { invite: "i" }, eventSite: { enabled: false, ...site } });
const show = (e = ev()) => {
  const showToast = vi.fn();
  render(<MemoryRouter><EventSiteEditorScreen activeEvent={e} patchEvent={vi.fn()} showToast={showToast} /></MemoryRouter>);
  return { showToast };
};

describe("EventSiteEditorScreen — the new design", () => {
  it("the sections' details are folded, closed, with what is inside counted", () => {
    show(ev({ faq: [{ id: "f1", q: "חניה?", a: "יש" }] }));
    const folds = [...document.querySelectorAll("details")];
    expect(folds.length).toBe(7);
    expect(folds.every(d => !d.open)).toBe(true);
    expect(folds.map(d => d.querySelector("summary").textContent)).toContain("השאלות (1)");
  });

  it("the section switches stay outside the folds, in view", () => {
    show();
    const sw = screen.getByRole("button", { name: "שאלות נפוצות" });
    expect(sw.closest("details")).toBeNull();
  });

  it("'not published' is said once, in the publish card", () => {
    show();
    expect(document.body.textContent.match(/עדיין לא מפורסם/g)).toHaveLength(1);
  });

  it("a file that is not an image: said under the cover button, not toasted", async () => {
    const { showToast } = show();
    const input = document.querySelector('input[type="file"]:not([multiple])');
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["x"], "a.txt", { type: "text/plain" })] } });
    });
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), "err");
    expect(screen.getByRole("alert").textContent).toBe("יש לבחור קובץ תמונה");
  });
});
