// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, act } from "../test/dom.js";
import { readFileSync } from "fs";
import { join } from "path";

/* The links in the auth emails (131, owner 3.10).
 *
 * The owner clicked a fresh reset link and got "הקישור אינו תקף". The old link
 * was Supabase's one-time /verify GET, which a mail scanner (Outlook checks
 * every link) or a second reset request spends before the person clicks. The
 * links now carry a token_hash to OUR page, and it is spent only on the
 * person's own action. These tests hold the line that matters: arriving spends
 * nothing; the click/submit does; and a spent link offers a new one right
 * there. */

const auth = {
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
};
vi.mock("../lib/supabase.js", () => ({ supabase: { auth }, isSupabaseConfigured: true }));

const { default: ResetPasswordScreen } = await import("./ResetPasswordScreen.jsx");
const { default: AuthCallbackScreen } = await import("./AuthCallbackScreen.jsx");

const at = (url, el) => {
  history.replaceState({}, "", url);
  return render(<MemoryRouter>{el}</MemoryRouter>);
};
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

beforeEach(() => {
  Object.values(auth).forEach(f => f.mockReset?.());
  auth.onAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe() {} } } }));
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.verifyOtp.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe("the reset link", () => {
  it("arriving spends nothing — a scanner that opens the page leaves the link alive", async () => {
    at("/reset-password?token_hash=abc123&type=recovery", <ResetPasswordScreen />);
    await flush();
    expect(auth.verifyOtp, "verified on page load: a mail scanner would spend it").not.toHaveBeenCalled();
    expect(screen.getByLabelText("סיסמה חדשה")).toBeInTheDocument();
  });

  it("submitting spends it, then sets the password — in that order", async () => {
    at("/reset-password?token_hash=abc123&type=recovery", <ResetPasswordScreen />);
    fireEvent.change(screen.getByLabelText("סיסמה חדשה"), { target: { value: "secret12" } });
    fireEvent.change(screen.getByLabelText("אימות סיסמה"), { target: { value: "secret12" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "עדכנו סיסמה" })); });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc123", type: "recovery" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "secret12" });
    expect(auth.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
    expect(screen.getByRole("status")).toHaveTextContent("הסיסמה עודכנה");
  });

  it("a password the server refuses does not burn the link — the retry does not verify again", async () => {
    auth.updateUser.mockResolvedValueOnce({ error: { code: "weak_password", message: "weak" } });
    at("/reset-password?token_hash=abc123&type=recovery", <ResetPasswordScreen />);
    fireEvent.change(screen.getByLabelText("סיסמה חדשה"), { target: { value: "secret12" } });
    fireEvent.change(screen.getByLabelText("אימות סיסמה"), { target: { value: "secret12" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "עדכנו סיסמה" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "עדכנו סיסמה" })); });
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledTimes(2);
  });

  it("a spent link says so and sends a new one from right here", async () => {
    auth.verifyOtp.mockResolvedValueOnce({ error: { code: "otp_expired", message: "expired" } });
    at("/reset-password?token_hash=old&type=recovery", <ResetPasswordScreen />);
    fireEvent.change(screen.getByLabelText("סיסמה חדשה"), { target: { value: "secret12" } });
    fireEvent.change(screen.getByLabelText("אימות סיסמה"), { target: { value: "secret12" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "עדכנו סיסמה" })); });
    expect(auth.updateUser, "never set a password on a refused link").not.toHaveBeenCalled();
    expect(screen.getByText(/הקישור הזה כבר לא פעיל/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("כתובת האימייל"), { target: { value: "a@b.co" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "שלחו לי קישור חדש" })); });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", { redirectTo: location.origin + "/reset-password" });
    expect(screen.getByRole("status")).toHaveTextContent("שלחנו קישור חדש");
  });

  it("Supabase's own failed link (#error_code=otp_expired) offers the same", async () => {
    at("/reset-password#error=access_denied&error_code=otp_expired", <ResetPasswordScreen />);
    await flush();
    expect(screen.getByRole("button", { name: "שלחו לי קישור חדש" })).toBeInTheDocument();
  });

  it("the old link still works: a recovery session from the fragment shows the form", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    at("/reset-password#access_token=x&type=recovery", <ResetPasswordScreen />);
    await flush();
    expect(screen.getByLabelText("סיסמה חדשה")).toBeInTheDocument();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("a signed-in browser with no link cannot change the password here (the old rule holds)", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    at("/reset-password", <ResetPasswordScreen />);
    await flush();
    expect(screen.queryByLabelText("סיסמה חדשה")).toBeNull();
  });
});

describe("the signup confirmation link", () => {
  it("arriving spends nothing; the button does", async () => {
    at("/auth/callback?token_hash=sig123&type=email", <AuthCallbackScreen />);
    await flush();
    expect(auth.verifyOtp, "confirmed on page load: a mail scanner would spend it").not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "אישור והמשך" })); });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "sig123", type: "email" });
    expect(screen.getByRole("status")).toHaveTextContent("האימייל אושר");
  });

  it("a spent link sends the person to sign in, not to a dead end", async () => {
    auth.verifyOtp.mockResolvedValueOnce({ error: { code: "otp_expired" } });
    at("/auth/callback?token_hash=old&type=email", <AuthCallbackScreen />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "אישור והמשך" })); });
    expect(screen.getByText(/הקישור הזה כבר לא פעיל/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "לכניסה לחשבון" })).toHaveAttribute("href", "/login");
  });

  it("an unknown type is not passed to Supabase", async () => {
    at("/auth/callback?token_hash=x&type=recovery", <AuthCallbackScreen />);
    await flush();
    expect(screen.queryByRole("button", { name: "אישור והמשך" })).toBeNull();
  });
});

describe("the email templates point at our pages, not at the one-time link", () => {
  // The pages above are only half of it: an email still carrying
  // {{ .ConfirmationURL }} goes on being spent by the scanner.
  // jsdom gives import.meta.url an http origin here, so the path is from the repo root.
  const read = (f) => readFileSync(join(process.cwd(), "supabase/email-templates", f), "utf8")
    .replace(/<!--[\s\S]*?-->/, "");   // the header comment explains the old variable
  it("reset: /reset-password with the token hash", () => {
    const t = read("reset-password.html");
    expect(t).toContain('href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&amp;type=recovery"');
    expect(t).not.toContain("{{ .ConfirmationURL }}");
  });
  it("confirm: /auth/callback with the token hash", () => {
    const t = read("confirm-signup.html");
    expect(t).toContain('href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&amp;type=email"');
    expect(t).not.toContain("{{ .ConfirmationURL }}");
  });
  it("no 'if the button does not work, copy the link' (owner 3.10: it has to just work)", () => {
    for (const f of ["reset-password.html", "confirm-signup.html"]) expect(read(f), f).not.toMatch(/העתיקו את הקישור/);
  });
});
