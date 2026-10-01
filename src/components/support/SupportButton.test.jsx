// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../../test/dom.js";

/* 106 (28.9): Revaya's support line floated over every guest page, inviting a
 * wedding guest to message the software company instead of the couple. */

vi.stubEnv("VITE_SUPPORT_WHATSAPP", "972501234567");
const { default: SupportButton } = await import("./SupportButton.jsx");

const at = (path) => render(<MemoryRouter initialEntries={[path]}><SupportButton /></MemoryRouter>);

describe("support button", () => {
  it("is there for hosts", () => {
    at("/app");
    expect(screen.getByRole("link", { name: "תמיכה בוואטסאפ" })).toBeInTheDocument();
  });

  it("is not on a guest page", () => {
    for (const p of ["/rsvp/tok12345", "/gift/tok12345", "/invite/tok12345", "/entrance/tok12345"]) {
      const { unmount } = at(p);
      expect(screen.queryByRole("link", { name: "תמיכה בוואטסאפ" }), p).toBeNull();
      unmount();
    }
  });
});
