// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "../../test/dom.js";
import { normalizeEvent } from "../../utils/eventHelpers.js";
import { COMPANY } from "../../data/company.js";

/* AX9 — skip link, decorative ✦, reduced motion. */

vi.mock("../../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: null, loading: false }),
  AuthProvider: ({ children }) => children,
}));

const Shell = (await import("./Shell.jsx")).default;
const Footer = (await import("./Footer.jsx")).default;
const SiteHeader = (await import("./SiteHeader.jsx")).default;

// jsdom has no layout; the sub-nav scrolls its active item into view.
Element.prototype.scrollBy ??= () => {};

const ev = normalizeEvent({ id: "e1", name: "החתונה של דנה ויוסי", type: "חתונה" });

describe("Shell skip link (AX9)", () => {
  it("is the first focusable thing and moves the focus into <main>", () => {
    render(
      <MemoryRouter>
        <Shell screen="guests" activeEvent={ev} go={vi.fn()} showToast={vi.fn()}>
          <p>תוכן</p>
        </Shell>
      </MemoryRouter>,
    );
    const focusables = document.querySelectorAll("a[href], button");
    const skip = screen.getByRole("link", { name: "דלגו לתוכן" });
    expect(focusables[0]).toBe(skip);
    fireEvent.click(skip);
    const main = screen.getByRole("main");
    expect(document.activeElement).toBe(main);
    expect(main.id).toBe("main");
  });

  it("the logo button's name does not include the ✦", () => {
    render(
      <MemoryRouter>
        <Shell screen="dashboard" activeEvent={null} go={vi.fn()} showToast={vi.fn()}><p /></Shell>
      </MemoryRouter>,
    );
    const logo = screen.getAllByRole("button").find(b => b.textContent.includes("✦"));
    expect(logo).toBeTruthy();
    // jsdom's accessible-name computation honours aria-hidden.
    expect(screen.getByRole("button", { name: new RegExp("^" + COMPANY.name) })).toBe(logo);
    expect(screen.queryByRole("button", { name: /✦/ })).toBeNull();
  });
});

describe("decorative ✦ is hidden from assistive tech (AX9)", () => {
  it("in the marketing header and footer", () => {
    render(<MemoryRouter><SiteHeader /><Footer /></MemoryRouter>);
    const stars = [...document.querySelectorAll("*")].filter(el =>
      [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.includes("✦")));
    expect(stars.length).toBeGreaterThan(0);
    for (const s of stars) expect(s.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("in the auth and account screens' source", () => {
    for (const f of ["LoginScreen", "SignupScreen", "ResetPasswordScreen", "AuthCallbackScreen", "AccountScreen", "StartScreen"]) {
      const src = readFileSync(`src/screens/${f}.jsx`, "utf8");
      // every JSX element whose text holds the ✦ carries aria-hidden
      const bare = src.split("\n").filter(l => l.includes("✦") && !l.trim().startsWith("//") && !l.includes("aria-hidden"));
      expect(bare, f).toEqual([]);
    }
  });
});

describe("reduced motion also stops the smooth scroll (AX9)", () => {
  it("reset.css turns html scroll-behavior back to auto under prefers-reduced-motion", () => {
    const css = readFileSync("src/styles/reset.css", "utf8");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/html\s*\{\s*scroll-behavior:\s*auto;?\s*\}/);
  });
});
