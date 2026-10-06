// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, act } from "../../test/dom.js";
import { COMPANY } from "../../data/company.js";

/* 106 (28.9): Revaya's support line floated over every guest page, inviting a
 * wedding guest to message the software company instead of the couple. */

vi.stubEnv("VITE_SUPPORT_WHATSAPP", "972501234567");
const { default: SupportButton } = await import("./SupportButton.jsx");
const { default: SupportLine } = await import("./SupportLine.jsx");

const at = (path) => render(<MemoryRouter initialEntries={[path]}><SupportButton /></MemoryRouter>);

describe("support button", () => {
  it("is there for hosts", () => {
    at("/app");
    expect(screen.getByRole("link", { name: "תמיכה בוואטסאפ" })).toBeInTheDocument();
  });

  it("the pre-typed greeting is gender-neutral (audit 3.10, C17)", () => {
    at("/app");
    const href = screen.getByRole("link", { name: "תמיכה בוואטסאפ" }).getAttribute("href");
    const text = new URL(href).searchParams.get("text");
    expect(text).toBe(`היי, אשמח לעזרה עם ${COMPANY.name} 🙂`);
    expect(text).not.toMatch(/צריך|צריכה/);
  });

  it("is not on a guest page", () => {
    for (const p of ["/rsvp/tok12345", "/gift/tok12345", "/invite/tok12345", "/entrance/tok12345"]) {
      const { unmount } = at(p);
      expect(screen.queryByRole("link", { name: "תמיכה בוואטסאפ" }), p).toBeNull();
      unmount();
    }
  });

  it("is not at the host's door screen (6.10) — it covered the rows and the sheet's ביטול", () => {
    for (const p of ["/events/e1/entrance", "/events/e1/checkin", "/events/e1/entrance/"]) {
      const { unmount } = at(p);
      expect(screen.queryByRole("link", { name: "תמיכה בוואטסאפ" }), p).toBeNull();
      unmount();
    }
    at("/events/e1/seating");
    expect(screen.getByRole("link", { name: "תמיכה בוואטסאפ" })).toBeInTheDocument();
  });

  it("is not over a sign-in form (136 stage C) — the card carries the help instead", () => {
    for (const p of ["/login", "/signup", "/reset-password", "/auth/callback", "/login/"]) {
      const { unmount } = at(p);
      expect(screen.queryByRole("link", { name: "תמיכה בוואטסאפ" }), p).toBeNull();
      unmount();
    }
    // Everything else a host opens still has it.
    for (const p of ["/home", "/pricing", "/account", "/events/e1"]) {
      const { unmount } = at(p);
      expect(screen.getByRole("link", { name: "תמיכה בוואטסאפ" }), p).toBeInTheDocument();
      unmount();
    }
  });

  it("the line in the card opens the same chat as the button", () => {
    const { unmount } = at("/app");
    const button = screen.getByRole("link", { name: "תמיכה בוואטסאפ" }).getAttribute("href");
    unmount();
    render(<SupportLine />);
    expect(screen.getByRole("link", { name: "כתבו לנו בוואטסאפ" }).getAttribute("href")).toBe(button);
  });

  it("slides away while the page scrolls down, and comes back on scroll up (review 5.10)", () => {
    at("/terms");
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 5000, configurable: true });
    const link = () => screen.getByRole("link", { name: "תמיכה בוואטסאפ" });
    const scrollTo = (y) => act(() => { window.scrollY = y; window.dispatchEvent(new Event("scroll")); });
    const base = link().className;
    scrollTo(600);
    expect(link().className).not.toBe(base);        // away while reading down
    scrollTo(400);
    expect(link().className).toBe(base);            // back on the way up
  });
});

