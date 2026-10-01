// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "../../test/dom.js";

/* WORKPLAN 112 (1.10). The users screen loads the newest 500 signups:
 * it called them "the first 500", a search that missed someone outside the
 * window said "no results" as if they did not exist, and a base of exactly
 * 500 was called truncated. */
let TOTAL = 0;
let EVENTS = { loaded: 0, count: 0 };
// C4: the per-user count comes from an `events(count)` embed. REFUSE_EMBED
// makes the API refuse it, which is the fallback path the WORKPLAN 113 tests
// below exercise; EMBED_COUNTS is what the embed answers per user index.
let REFUSE_EMBED = false;
let EMBED_COUNTS = [];
const calls = [];
const users = (n, withCounts) => Array.from({ length: n }, (_, i) => ({
  id: "u" + i, email: `user${i}@x.test`, full_name: "משתמש " + i, role: "user",
  created_at: new Date(Date.UTC(2026, 8, 1) - i * 60000).toISOString(), subscriptions: [],
  ...(withCounts ? { events: [{ count: EMBED_COUNTS[i] ?? 0 }] } : {}) }));
function builder(table) {
  const q = { head: false, lim: Infinity, cols: "" };
  const b = {
    select: (c, opts) => { q.cols = c || ""; if (opts?.head) q.head = true; calls.push({ table, cols: q.cols }); return b; },
    order: () => b, limit: (n) => { q.lim = n; return b; }, range: () => b,
    then: (res, rej) => {
      let out;
      const embed = q.cols.includes("events!");
      if (table === "profiles" && embed && REFUSE_EMBED) out = { data: null, error: { code: "PGRST200", message: "Could not find a relationship" } };
      else if (table === "profiles") out = q.head ? { data: null, count: TOTAL, error: null } : { data: users(Math.min(TOTAL, q.lim), embed), error: null };
      else out = { data: Array.from({ length: EVENTS.loaded }, () => ({ user_id: "u0" })), count: EVENTS.count, error: null };
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

beforeEach(() => {
  TOTAL = 0; EVENTS = { loaded: 0, count: 0 };
  REFUSE_EMBED = false; EMBED_COUNTS = []; calls.length = 0;
});

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

  // WORKPLAN 113: the per-user event count read a capped range and said nothing
  // past it. Since C4 that read is only the FALLBACK, when the embed is refused.
  it("says the event counts are partial when the events read was cut", async () => {
    REFUSE_EMBED = true;
    TOTAL = 3; EVENTS = { loaded: 5, count: 9 };
    open();
    expect(await screen.findByText(/ספירת האירועים חלקית/)).toBeTruthy();
  });
  it("no such note when every event was read", async () => {
    REFUSE_EMBED = true;
    TOTAL = 3; EVENTS = { loaded: 5, count: 5 };
    open();
    await screen.findByText("user2@x.test");
    expect(screen.queryByText(/ספירת האירועים חלקית/)).toBeNull();
  });
});

/* C4: the count is PostgreSQL's, per user, from an aggregate embed. The old
 * client-side count read events rows through `.range(0, 99999)`, which
 * PostgREST still caps at max-rows (1000) — so a host with 1,500 events read
 * as however many of theirs fell inside the first thousand. */
describe("admin users — event counts come from the database, not a capped read", () => {
  it("shows the embed's count, past any row cap", async () => {
    TOTAL = 3; EMBED_COUNTS = [1500, 0, 7];
    EVENTS = { loaded: 1000, count: 1507 };   // what a capped events read would see
    open();
    expect(await screen.findByText("1500")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.queryByText(/ספירת האירועים חלקית/)).toBeNull();
  });
  it("reads no event rows at all when the embed answers", async () => {
    TOTAL = 3; EMBED_COUNTS = [2, 0, 0];
    open();
    await screen.findByText("user2@x.test");
    expect(calls.some(c => c.table === "events")).toBe(false);
    const list = calls.find(c => c.table === "profiles" && c.cols.includes("email"));
    expect(list.cols).toMatch(/events!events_user_id_fkey\(count\)/);
  });
  it("still lists the users when the embed is refused", async () => {
    REFUSE_EMBED = true;
    TOTAL = 3; EVENTS = { loaded: 2, count: 2 };
    open();
    expect(await screen.findByText("user2@x.test")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();   // u0's two events, counted client-side
  });
});
