// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../../test/dom.js";
import Footer from "./Footer.jsx";
import { COMPANY, contactMailto } from "../../data/company.js";

/* Audit 3.10, C20: the footer's "צרו קשר" opened a mail to the SUPPORT box.
 * The owner set two mailboxes on 3.10 — plan@ is the main business address
 * and "צרו קשר", plansupport@ is for questions and problems (company.js). */
describe("footer contact link (C20)", () => {
  it("\"צרו קשר\" writes to the main address, not to support", () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    const href = screen.getByRole("link", { name: "צרו קשר" }).getAttribute("href");
    expect(href).toBe(contactMailto());
    expect(href).toContain(`${COMPANY.contactMailbox}@${COMPANY.domain}`);
    expect(href).not.toContain(COMPANY.supportMailbox);
  });
});
