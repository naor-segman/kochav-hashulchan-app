// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../../test/dom.js";
import { LEGAL } from "../../data/company.js";

/* 16 (owner, 4.10): the business phone IS the support line — "זה גם טלפון של
 * העסק וגם תמיכה". With no Netlify variable the button used to render nothing
 * at all; now it opens WhatsApp to the number on the legal pages. */

vi.stubEnv("VITE_SUPPORT_WHATSAPP", "");
const { default: SupportButton } = await import("./SupportButton.jsx");

describe("support button with no Netlify variable", () => {
  it("opens WhatsApp to the business phone shown on the legal pages", () => {
    render(<MemoryRouter initialEntries={["/app"]}><SupportButton /></MemoryRouter>);
    const href = screen.getByRole("link", { name: "תמיכה בוואטסאפ" }).getAttribute("href");
    const local = LEGAL.phone.replace(/\D/g, "");
    expect(local).toMatch(/^05\d{8}$/);
    expect(href).toMatch(new RegExp(`^https://wa\\.me/972${local.slice(1)}\\?text=`));
  });
});
