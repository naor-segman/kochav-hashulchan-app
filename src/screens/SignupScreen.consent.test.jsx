// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";
import { LEGAL_DOCS } from "../data/company.js";

// Checklist 103 (1.10): signing up is agreeing to the terms, so it has to be an
// act — and the version agreed to travels with the account.
const signUp = vi.fn(async () => ({ needsConfirmation: true }));
vi.mock("../hooks/useAuth.js", () => ({ useAuth: () => ({ user: null, loading: false, signUp }) }));
vi.mock("../lib/supabase.js", () => ({ isSupabaseConfigured: true, supabase: {} }));
const { default: SignupScreen } = await import("./SignupScreen.jsx");

function fill() {
  render(<MemoryRouter><SignupScreen /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: "a@b.co" } });
  fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "secret1" } });
  fireEvent.change(screen.getByLabelText("אימות סיסמה"), { target: { value: "secret1" } });
}

describe("signup — consent to the terms", () => {
  beforeEach(() => signUp.mockClear());

  it("does not sign up without the box, and says why", () => {
    fill();
    fireEvent.click(screen.getByRole("button", { name: "הרשמה" }));
    expect(signUp).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/תנאי השימוש/);
  });

  it("links both documents from the box", () => {
    fill();
    const box = screen.getByRole("checkbox");
    const label = box.closest("label");
    const hrefs = [...label.querySelectorAll("a")].map(a => a.getAttribute("href"));
    expect(hrefs).toEqual(["/terms", "/privacy"]);
  });

  it("with the box, records the version agreed to", async () => {
    fill();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "הרשמה" }));
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    const [, , meta] = signUp.mock.calls[0];
    expect(meta.terms_version).toBe(LEGAL_DOCS.version);
    expect(Number.isNaN(Date.parse(meta.terms_accepted_at))).toBe(false);
  });
});
