// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";

/* A sign-out that failed looked exactly like one that worked (37a).
 *
 * supabase-js keeps the session when its logout call fails — offline at the
 * venue, or the auth server down — and the screen navigated home regardless.
 * The host walked away from a shared device believing they had left it, with
 * the session and every event of theirs still on it. */

const signOut = vi.fn();
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1", email: "host@example.com" }, loading: false, signOut }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../hooks/useSubscription.js", () => ({
  useSubscription: () => ({
    subscription: null, planKey: "free", statusKey: null,
    isPaymentFailed: false, isCancelling: false, refresh: () => {},
    refreshUntilPlanChanges: () => {},
  }),
}));

const AccountScreen = (await import("./AccountScreen.jsx")).default;

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={["/account"]}>
      <Routes>
        <Route path="/account" element={<AccountScreen eventCount={1} showToast={() => {}} />} />
        <Route path="/" element={<p>HOME</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => signOut.mockReset());

describe("AccountScreen — signing out (37a)", () => {
  it("stays on the screen and says so when the sign-out failed", async () => {
    signOut.mockRejectedValueOnce(Object.assign(new Error("Failed to fetch"), { status: 0 }));
    renderScreen();
    const btn = screen.getByRole("button", { name: "התנתקות" });
    btn.focus();
    fireEvent.click(btn);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/עדיין מחוברים/);
    expect(alert.textContent).not.toMatch(/[A-Za-z]/);
    expect(screen.queryByText("HOME")).toBeNull();
    // Usable again, and the keyboard focus was never dropped to <body>.
    expect(btn).not.toHaveAttribute("aria-disabled");
    expect(btn).toHaveAttribute("aria-describedby", alert.id);
    expect(document.activeElement).toBe(btn);
  });

  it("goes home once the sign-out went through", async () => {
    signOut.mockResolvedValueOnce(undefined);
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "התנתקות" }));
    await waitFor(() => expect(screen.getByText("HOME")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("AccountScreen — clearing the local copy names what would be lost (audit 3.10, L1)", () => {
  it("does not promise that a floor-plan sketch comes back from the cloud", async () => {
    const { userStorageKey, persist } = await import("../utils/storage.js");
    persist({ events: [
      { id: "a", name: "חתונה עם שרטוט", cloudId: "c1", version: 2, syncedVersion: 2,
        floorPlan: { image: "data:image/png;base64,QQ", tablePositions: {}, elements: [] } },
      { id: "b", name: "בר מצווה", cloudId: "c2", version: 1, syncedVersion: 1 },
    ] }, userStorageKey("u1"));
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "מחיקת נתונים מקומיים מהמכשיר" }));
    const text = (await screen.findByText(/למחוק את העותק המקומי/)).closest("[role]").textContent;
    expect(text).toMatch(/אירוע אחד כבר בענן/);              // only the plain one
    expect(text).toMatch(/שרטוט האולם שלו שמור רק על המכשיר הזה/);
    expect(text).toMatch(/חתונה עם שרטוט/);
    expect(text).not.toMatch(/שום דבר לא יאבד/);
    localStorage.clear();
  });
});
