// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { render, screen, waitFor } from "../../test/dom.js";

/* RG10a. AdminGuard sends a session it could not verify here with
 * state: { error }. That state lives in the history entry, so it survived a
 * reload: the message came back on every refresh and the session redirect
 * stayed off for the life of the tab. It is read once and then cleared. */
const getSession = vi.fn(async () => ({ data: { session: { user: { id: "u1" } } } }));
vi.mock("../../lib/supabase.js", () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: (...a) => getSession(...a), signInWithPassword: async () => ({ error: null }) } },
}));
const { default: AdminLoginScreen } = await import("./AdminLoginScreen.jsx");

let seen = null;
function Probe() { seen = useLocation(); return null; }
const open = (entry) => render(
  <MemoryRouter initialEntries={[entry]}>
    <Probe />
    <Routes>
      <Route path="/admin/login" element={<AdminLoginScreen />} />
      <Route path="/admin/dashboard" element={<p>dashboard</p>} />
    </Routes>
  </MemoryRouter>);

beforeEach(() => { getSession.mockClear(); seen = null; });

describe("admin login — the guard's message is read once", () => {
  const MSG = "גישה נדחתה: לא ניתן לאמת הרשאות מנהל.";

  it("shows it, then clears it from the history entry", async () => {
    open({ pathname: "/admin/login", state: { error: MSG } });
    expect(screen.getByText(MSG)).toBeTruthy();
    await waitFor(() => expect(seen.state).toBeNull());
    expect(seen.pathname).toBe("/admin/login");
    // still on screen for this visit, and still no bounce back to the guard
    expect(screen.getByText(MSG)).toBeTruthy();
    await new Promise(r => setTimeout(r, 20));
    expect(getSession).not.toHaveBeenCalled();
    expect(screen.queryByText("dashboard")).toBeNull();
  });

  it("a visit without the message redirects a live session as before", async () => {
    open({ pathname: "/admin/login" });
    expect(await screen.findByText("dashboard")).toBeTruthy();
    expect(getSession).toHaveBeenCalledTimes(1);
  });
});
