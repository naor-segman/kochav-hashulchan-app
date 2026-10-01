// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "../../test/dom.js";

/* WORKPLAN 112 (1.10). The users screen loads the newest 500 signups:
 * it called them "the first 500", a search that missed someone outside the
 * window said "no results" as if they did not exist, and a base of exactly
 * 500 was called truncated. */
let TOTAL = 0;
const users = (n) => Array.from({ length: n }, (_, i) => ({
  id: "u" + i, email: `user${i}@x.test`, full_name: "משתמש " + i, role: "user",
  created_at: new Date(Date.UTC(2026, 8, 1) - i * 60000).toISOString(), subscriptions: [] }));
function builder(table) {
  const q = { head: false, lim: Infinity };
  const b = {
    select: (_c, opts) => { if (opts?.head) q.head = true; return b; },
    order: () => b, limit: (n) => { q.lim = n; return b; }, range: () => b,
    then: (res, rej) => {
      let out;
      if (table === "profiles") out = q.head ? { data: null, count: TOTAL, error: null } : { data: users(Math.min(TOTAL, q.lim)), error: null };
      else out = { data: [], count: 0, error: null };
      return Promise.resolve(out).then(res, rej);
    },
  };
  return b;
}
vi.mock("../../lib/supabase.js", () => ({
  isSupabaseConfigured: true,
  supabase: { from: (t) => builder(t), auth: { getUser: async () => ({ data: { user: { email: "admin@x.test" } } }), signOut: async () => ({}) } },
}));
const { default: AdminUsersScreen } = await import("./AdminUsersScreen.jsx");
const open = () => render(<MemoryRouter><AdminUsersScreen /></MemoryRouter>);

beforeEach(() => { TOTAL = 0; });

describe("admin users — a window is called a window", () => {
  it("names the window as the newest signups", async () => {
    TOTAL = 800;
    open();
    expect(await screen.findByText(/מוצגים 500 שנרשמו אחרונים/)).toBeTruthy();
    expect(screen.queryByText(/500 הראשונים/)).toBeNull();
  });
  it("a search that misses says it only looked at the newest 500", async () => {
    TOTAL = 800;
    open();
    await screen.findByText(/מוצגים 500/);
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "nobody-here" } });
    expect(await screen.findByText(/החיפוש רץ על 500 המשתמשים שנרשמו אחרונים, מתוך 800/)).toBeTruthy();
  });
  it("exactly 500 users is the whole base — no truncation note", async () => {
    TOTAL = 500;
    open();
    await screen.findByText("user499@x.test");
    expect(screen.queryByText(/מוצגים 500/)).toBeNull();
  });
});
