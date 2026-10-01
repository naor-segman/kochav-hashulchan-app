// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, act } from "../test/dom.js";

/* What a host actually reads when signing in, signing up or resetting a
 * password fails (37b, AX6).
 *
 * The screens used to pass unknown errors through verbatim — English
 * ("Email rate limit exceeded") or, when the network dropped, supabase-js's
 * AuthRetryableFetchError whose message is literally "{}". */

const signIn = vi.fn();
const signUp = vi.fn();
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: null, loading: false, signIn, signUp, signOut: vi.fn() }),
  AuthProvider: ({ children }) => children,
}));

let authCb = null;
const updateUser = vi.fn();
const resetPasswordForEmail = vi.fn();
vi.mock("../lib/supabase.js", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      onAuthStateChange: (cb) => { authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: () => Promise.resolve({ data: { session: null } }),
      updateUser: (...a) => updateUser(...a),
      resetPasswordForEmail: (...a) => resetPasswordForEmail(...a),
      resend: vi.fn(async () => ({ error: null })),
    },
  },
}));
vi.mock("../lib/analytics.js", async (orig) => ({ ...(await orig()), track: () => {} }));

const LoginScreen = (await import("./LoginScreen.jsx")).default;
const SignupScreen = (await import("./SignupScreen.jsx")).default;
const ResetPasswordScreen = (await import("./ResetPasswordScreen.jsx")).default;

const inRouter = (el) => render(<MemoryRouter>{el}</MemoryRouter>);
const offline = () => Object.assign(new Error("{}"), { name: "AuthRetryableFetchError", status: 0 });
const apiErr = (code, status, message) => Object.assign(new Error(message), { name: "AuthApiError", code, status });

// The error paragraph — found by its text, so this holds before and after the
// role="alert" was added.
const errorText = () => document.querySelector("form p")?.textContent ?? "";

beforeEach(() => { signIn.mockReset(); signUp.mockReset(); updateUser.mockReset(); resetPasswordForEmail.mockReset(); });

describe("LoginScreen errors (37b)", () => {
  it("offline: a Hebrew connection message, not \"{}\"", async () => {
    signIn.mockRejectedValueOnce(offline());
    inRouter(<LoginScreen />);
    fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "secret1" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText("אימייל").closest("form")); });
    expect(errorText()).toMatch(/חיבור/);
    expect(document.body.textContent).not.toContain("{}");
  });

  it("forgot-password rate limit: Hebrew, not GoTrue's English", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: apiErr("over_email_send_rate_limit", 429, "email rate limit exceeded") });
    inRouter(<LoginScreen />);
    fireEvent.click(screen.getByRole("button", { name: "שכחתם סיסמה?" }));
    const forgotForm = screen.getByText("איפוס סיסמה").closest("form");
    fireEvent.change(forgotForm.querySelector("input"), { target: { value: "a@b.co" } });
    await act(async () => { fireEvent.submit(forgotForm); });
    expect(forgotForm.textContent).toMatch(/יותר מדי/);
    expect(document.body.textContent).not.toMatch(/rate limit/i);
  });
});

describe("SignupScreen errors (37b)", () => {
  it.each([
    [apiErr("over_email_send_rate_limit", 429, "Email rate limit exceeded"), /יותר מדי/],
    [apiErr("weak_password", 422, "Password should contain at least one character of each: abc"), /חלשה/],
    [apiErr(undefined, 500, "Database error saving new user"), /חיבור|ההרשמה/],
  ])("%s → Hebrew", async (err, re) => {
    signUp.mockRejectedValueOnce(err);
    inRouter(<SignupScreen />);
    fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "secret1" } });
    fireEvent.change(screen.getByLabelText("אימות סיסמה"), { target: { value: "secret1" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText("אימייל").closest("form")); });
    expect(errorText()).toMatch(re);
    expect(errorText()).not.toMatch(/[A-Za-z{}]/);
  });
});

describe("ResetPasswordScreen errors (37b)", () => {
  it("weak password from the server: Hebrew, not the raw English", async () => {
    updateUser.mockResolvedValueOnce({ error: apiErr("weak_password", 422, "Password is known to be weak") });
    inRouter(<ResetPasswordScreen />);
    await act(async () => { authCb("PASSWORD_RECOVERY"); });
    fireEvent.change(screen.getByLabelText("סיסמה חדשה"), { target: { value: "secret1" } });
    fireEvent.change(screen.getByLabelText("אימות סיסמה"), { target: { value: "secret1" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText("סיסמה חדשה").closest("form")); });
    expect(errorText()).toMatch(/חלשה/);
  });

  it("offline: a connection message", async () => {
    updateUser.mockRejectedValueOnce(offline());
    inRouter(<ResetPasswordScreen />);
    await act(async () => { authCb("PASSWORD_RECOVERY"); });
    fireEvent.change(screen.getByLabelText("סיסמה חדשה"), { target: { value: "secret1" } });
    fireEvent.change(screen.getByLabelText("אימות סיסמה"), { target: { value: "secret1" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText("סיסמה חדשה").closest("form")); });
    expect(errorText()).toMatch(/חיבור/);
  });
});
