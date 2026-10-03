import { describe, it, expect } from "vitest";
import { authErrorMessage } from "./authErrors.js";

// The shapes supabase-js actually produces. AuthApiError carries `code` and
// `status`; AuthRetryableFetchError is what a dropped network becomes, and its
// message is the JSON of the failed fetch — the literal "{}" (37b).
const api = (code, status, message = "whatever GoTrue said") =>
  Object.assign(new Error(message), { name: "AuthApiError", code, status });
const offline = Object.assign(new Error("{}"), { name: "AuthRetryableFetchError", status: 0 });

const LATIN = /[A-Za-z{}]/;

describe("authErrorMessage (37b)", () => {
  it.each([
    ["invalid_credentials", 400, /שגויים/],
    ["email_not_confirmed", 400, /לאשר/],
    ["user_already_exists", 422, /כבר רשומה/],
    ["weak_password", 422, /חלשה/],
    ["over_email_send_rate_limit", 429, /יותר מדי הודעות/],
    ["over_request_rate_limit", 429, /יותר מדי ניסיונות/],
    ["same_password", 422, /זהה/],
  ])("code %s → a Hebrew sentence about it", (code, status, re) => {
    const msg = authErrorMessage(api(code, status), "signUp");
    expect(msg).toMatch(re);
    expect(msg).not.toMatch(LATIN);
  });

  it("a 429 with no code it knows is still the rate limit", () => {
    expect(authErrorMessage(api(undefined, 429, "Email rate limit exceeded"))).toMatch(/יותר מדי/);
  });

  it("a dropped network is a connection message, never the raw \"{}\"", () => {
    const msg = authErrorMessage(offline, "signIn");
    expect(msg).toMatch(/חיבור/);
    expect(msg).not.toMatch(LATIN);
  });

  it("a bare fetch rejection is a connection message too", () => {
    expect(authErrorMessage(new TypeError("Failed to fetch"))).toMatch(/חיבור/);
    expect(authErrorMessage(Object.assign(new Error("x"), { status: 503 }))).toMatch(/חיבור/);
  });

  it("old servers with no code: the English wording still maps", () => {
    expect(authErrorMessage(new Error("Invalid login credentials"))).toMatch(/שגויים/);
    expect(authErrorMessage(new Error("User already registered"), "signUp")).toMatch(/כבר רשומה/);
  });

  it("anything unknown falls back to Hebrew for that action — never the raw message", () => {
    const raw = "Database error saving new user";
    for (const action of ["signIn", "signUp", "updatePassword", "changePassword", "resetEmail", "resend", "nonsense"]) {
      const msg = authErrorMessage(new Error(raw), action);
      expect(msg).not.toContain(raw);
      expect(msg).not.toMatch(LATIN);
      expect(msg.length).toBeGreaterThan(5);
    }
    expect(authErrorMessage(new Error(raw), "signUp")).toMatch(/ההרשמה/);
  });

  it("survives things that are not errors at all", () => {
    for (const x of [undefined, null, "boom", 42, {}]) {
      expect(authErrorMessage(x)).not.toMatch(LATIN);
    }
  });
});
