// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "../../test/dom.js";
import { mergeQueue, loadQueue, unseenSummary, QUEUE_WINDOW } from "./workQueue.js";

// WORKPLAN 58. The errors and feedback screens loaded the newest 200 rows and
// counted unread inside them; after a burst, older unread rows were outside
// the window and the screen said "הכל נקרא".

/** A PostgREST-shaped fake over an in-memory table: eq / order desc / limit / head count. */
function fakeClient(table) {
  return {
    from: () => {
      const q = { filters: [], lim: Infinity, head: false };
      const b = {
        select: (_c, opts) => { if (opts?.head) q.head = true; return b; },
        eq: (k, v) => { q.filters.push(r => r[k] === v); return b; },
        order: () => b,
        limit: n => { q.lim = n; return b; },
        update: () => b,
        then: (res, rej) => {
          const hit = table.filter(r => q.filters.every(f => f(r)))
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return Promise.resolve(q.head ? { data: null, count: hit.length, error: null }
                                        : { data: hit.slice(0, q.lim), error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
}

const at = i => new Date(Date.UTC(2026, 8, 1) + i * 60000).toISOString();
// 50 old UNREAD rows, then 250 newer READ ones: the newest 200 are all read.
const BURST = [
  ...Array.from({ length: 50 },  (_, i) => ({ id: "u" + i, created_at: at(i),       seen: false, message: "ישן " + i, kind: "window" })),
  ...Array.from({ length: 250 }, (_, i) => ({ id: "s" + i, created_at: at(100 + i), seen: true,  message: "נקרא " + i, kind: "window" })),
];

describe("workQueue", () => {
  it("the premise: the old read (newest 200) holds none of the unread rows", async () => {
    const { data } = await fakeClient(BURST).from().select("*").order("created_at").limit(QUEUE_WINDOW);
    expect(data.filter(r => !r.seen)).toHaveLength(0);
  });

  it("loadQueue brings every unread row the window allows, and the table's count", async () => {
    const q = await loadQueue(fakeClient(BURST), "error_reports", "*");
    expect(q.rows.filter(r => !r.seen)).toHaveLength(50);
    expect(q.unseenTotal).toBe(50);
    // Newest first, no duplicates.
    expect(new Set(q.rows.map(r => r.id)).size).toBe(q.rows.length);
    expect(q.rows[0].created_at >= q.rows.at(-1).created_at).toBe(true);
  });

  it("mergeQueue unions by id, newest first", () => {
    const a = { id: "a", created_at: at(1) }, b = { id: "b", created_at: at(2) };
    expect(mergeQueue([a, b], [b]).map(r => r.id)).toEqual(["b", "a"]);
  });

  it("unseenSummary says when the table holds more unread than are shown", () => {
    const w = { one: "אחת", many: "שלא נקראו", none: "אין" };
    expect(unseenSummary(0, 0, w)).toBe("אין");
    expect(unseenSummary(1, 1, w)).toBe("אחת");
    expect(unseenSummary(3, null, w)).toBe("3 שלא נקראו");
    expect(unseenSummary(200, 340, w)).toMatch(/^340 שלא נקראו · מוצגות 200 האחרונות/);
  });
});

describe("AdminErrorsScreen after a burst", () => {
  it("shows the old unread errors and counts them — not 'הכל נקרא'", async () => {
    vi.resetModules();
    vi.doMock("../../lib/supabase.js", () => ({ supabase: fakeClient(BURST), isSupabaseConfigured: true }));
    const Screen = (await import("../screens/AdminErrorsScreen.jsx")).default;
    render(<MemoryRouter><Screen /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("50 שגיאות שלא נקראו")).toBeTruthy());
    expect(screen.queryByText("הכל נקרא")).toBeNull();
    expect(screen.getByText("ישן 0")).toBeTruthy();
    vi.doUnmock("../../lib/supabase.js");
  });

  it("the feedback screen, same queue, same guarantee", async () => {
    vi.resetModules();
    vi.doMock("../../lib/supabase.js", () => ({ supabase: fakeClient(BURST), isSupabaseConfigured: true }));
    const Screen = (await import("../screens/AdminFeedbackScreen.jsx")).default;
    render(<MemoryRouter><Screen /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("50 הודעות שלא נקראו")).toBeTruthy());
    expect(screen.queryByText("הכל נקרא")).toBeNull();
    vi.doUnmock("../../lib/supabase.js");
  });
});

describe("AdminSubscriptionsScreen — a window says it is one", () => {
  const SUBS = Array.from({ length: 620 }, (_, i) => ({
    id: "p" + i, plan: "pro", status: "active", created_at: at(i), profiles: { email: `h${i}@x.co` },
  }));
  const withAuth = c => ({ ...c, auth: { getUser: async () => ({ data: { user: { email: "admin@x.co" } } }) } });

  it("620 purchases: 500 shown, and the screen says 500 of 620", async () => {
    vi.resetModules();
    vi.doMock("../../lib/supabase.js", () => ({ supabase: withAuth(fakeClient(SUBS)), isSupabaseConfigured: true }));
    vi.doMock("../lib/useAdminLogout.js", () => ({ useAdminLogout: () => () => {} }));
    const Screen = (await import("../screens/AdminSubscriptionsScreen.jsx")).default;
    const { container } = render(<MemoryRouter><Screen /></MemoryRouter>);
    await waitFor(() => expect(container.textContent).toContain("500 רכישות"));
    expect(container.textContent).toContain("מוצגות 500 האחרונות מתוך 620");
    vi.doUnmock("../../lib/supabase.js");
    vi.doUnmock("../lib/useAdminLogout.js");
  });

  it("exactly 500 purchases is the whole table: no note", async () => {
    vi.resetModules();
    vi.doMock("../../lib/supabase.js", () => ({ supabase: withAuth(fakeClient(SUBS.slice(0, 500))), isSupabaseConfigured: true }));
    vi.doMock("../lib/useAdminLogout.js", () => ({ useAdminLogout: () => () => {} }));
    const Screen = (await import("../screens/AdminSubscriptionsScreen.jsx")).default;
    const { container } = render(<MemoryRouter><Screen /></MemoryRouter>);
    await waitFor(() => expect(container.textContent).toContain("500 רכישות"));
    expect(container.textContent).not.toContain("מוצגות");
    vi.doUnmock("../../lib/supabase.js");
    vi.doUnmock("../lib/useAdminLogout.js");
  });
});
