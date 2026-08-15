// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "./../test/dom.js";

// useAuth is imported by eleven files and had no tests. Its pure core —
// isCloudBacked and pruneCloudBackedEvents — is covered in storage.test.js;
// what was not covered is the WIRING, and the wiring is where the damage is:
// which user's bucket gets pruned, and whether the app ever stops loading.

let sessionResult;          // what getSession() resolves (or rejects) with
let authCallback;           // the handler onAuthStateChange was given
const unsubscribe = vi.fn();
const pruneSpy    = vi.fn();

vi.mock("../lib/supabase.js", () => ({
  supabase: {
    auth: {
      getSession: () => (sessionResult instanceof Error
        ? Promise.reject(sessionResult)
        : Promise.resolve({ data: { session: sessionResult } })),
      onAuthStateChange: (cb) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe } } };
      },
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
  isSupabaseConfigured: true,
}));

vi.mock("../utils/storage.js", async (orig) => ({
  ...(await orig()),
  pruneCloudBackedEvents: (...a) => pruneSpy(...a),
  userStorageKey: (id) => "kochav_hashulchan_v1::u_" + id,
}));

const { AuthProvider, useAuth } = await import("./useAuth.js");

function Probe() {
  const { user, loading } = useAuth();
  return <div data-testid="probe">{loading ? "loading" : (user ? user.id : "anon")}</div>;
}
const show = () => render(<AuthProvider><Probe /></AuthProvider>);
const text = () => screen.getByTestId("probe").textContent;

beforeEach(() => {
  sessionResult = null; authCallback = null;
  unsubscribe.mockReset(); pruneSpy.mockReset();
});

describe("useAuth — restoring the session", () => {
  it("reports the signed-in user once the session resolves", async () => {
    sessionResult = { user: { id: "u1", email: "a@b.c" } };
    show();
    await waitFor(() => expect(text()).toBe("u1"));
  });

  // Without the catch, a session restore that fails on venue wifi leaves
  // loading true forever and the app renders a blank screen with no way out.
  it("stops loading even when the session restore fails outright", async () => {
    sessionResult = new Error("network down");
    show();
    await waitFor(() => expect(text()).toBe("anon"));
  });

  it("stops loading when there is simply no session", async () => {
    sessionResult = null;
    show();
    await waitFor(() => expect(text()).toBe("anon"));
  });
});

describe("useAuth — what signing out is allowed to delete", () => {
  // The bucket is keyed per user, and by the time SIGNED_OUT arrives the
  // session is already gone — so the id has to come from what was remembered
  // BEFORE. Pruning the wrong key either deletes nothing (leaving a stranger's
  // guest list on a venue tablet) or, on an account switch, the wrong person's.
  it("prunes the bucket of the user who was signed in, not the empty new one", async () => {
    sessionResult = { user: { id: "u1" } };
    show();
    await waitFor(() => expect(text()).toBe("u1"));
    await act(async () => { authCallback("SIGNED_OUT", null); });
    expect(pruneSpy).toHaveBeenCalledTimes(1);
    expect(pruneSpy.mock.calls[0][0]).toContain("u_u1");
  });

  it("prunes nothing when nobody was signed in to begin with", async () => {
    sessionResult = null;
    show();
    await waitFor(() => expect(text()).toBe("anon"));
    await act(async () => { authCallback("SIGNED_OUT", null); });
    expect(pruneSpy).not.toHaveBeenCalled();
  });

  it("does not prune on any other auth event", async () => {
    sessionResult = { user: { id: "u1" } };
    show();
    await waitFor(() => expect(text()).toBe("u1"));
    for (const e of ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "INITIAL_SESSION"]) {
      await act(async () => { authCallback(e, { user: { id: "u1" } }); });
    }
    expect(pruneSpy).not.toHaveBeenCalled();
  });

  // Storage can be blocked (private mode, a locked-down tablet). The session
  // still has to end — a sign-out that throws leaves the user signed in.
  it("still signs out when the prune throws", async () => {
    pruneSpy.mockImplementation(() => { throw new Error("storage blocked"); });
    sessionResult = { user: { id: "u1" } };
    show();
    await waitFor(() => expect(text()).toBe("u1"));
    await act(async () => { authCallback("SIGNED_OUT", null); });
    await waitFor(() => expect(text()).toBe("anon"));
  });

  // An account switch: the OLD user's bucket is the one to clear.
  it("follows the switch, so a later sign-out prunes the second account", async () => {
    sessionResult = { user: { id: "u1" } };
    show();
    await waitFor(() => expect(text()).toBe("u1"));
    await act(async () => { authCallback("SIGNED_IN", { user: { id: "u2" } }); });
    await waitFor(() => expect(text()).toBe("u2"));
    await act(async () => { authCallback("SIGNED_OUT", null); });
    expect(pruneSpy.mock.calls[0][0]).toContain("u_u2");
  });
});

describe("useAuth — teardown", () => {
  it("unsubscribes from auth events when it unmounts", async () => {
    sessionResult = { user: { id: "u1" } };
    const { unmount } = show();
    await waitFor(() => expect(text()).toBe("u1"));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
