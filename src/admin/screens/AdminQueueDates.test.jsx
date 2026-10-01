// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../../test/dom.js";
import { formatDateTime } from "../lib/adminFormat.js";

/* סב39. "DD.MM.YYYY, HH:MM" has no strong character, so in the RTL meta line
 * bidi rule N1 painted it "HH:MM ,DD.MM.YYYY" — measured with Range rects on
 * the live errors and feedback screens (painted 00:00,29.07.2026 for a DOM of
 * 29.07.2026,00:00). jsdom cannot paint; what it can check is the isolation
 * that fixed it, on the element that holds the date. */
const ROW = { id: "r1", created_at: "2026-07-29T11:32:00Z", message: "משהו נשבר", stack: "",
              route: "/events", user_agent: "Mozilla/5.0 Chrome/124.0", kind: "bug", contact: "", seen: false };
function builder() {
  const q = { head: false };
  const b = {
    select: (_c, opts) => { if (opts?.head) q.head = true; return b; },
    eq: () => b, order: () => b, limit: () => b,
    then: (res, rej) => Promise.resolve(q.head ? { data: null, count: 1, error: null } : { data: [ROW], error: null }).then(res, rej),
  };
  return b;
}
vi.mock("../../lib/supabase.js", () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => builder(), auth: { getUser: async () => ({ data: { user: { email: "admin@x.test" } } }), signOut: async () => ({}) } },
}));
const { default: AdminErrorsScreen } = await import("./AdminErrorsScreen.jsx");
const { default: AdminFeedbackScreen } = await import("./AdminFeedbackScreen.jsx");

describe("admin work queues — the date/time is an LTR run", () => {
  for (const [name, Screen] of [["errors", AdminErrorsScreen], ["feedback", AdminFeedbackScreen]]) {
    it(name, async () => {
      render(<MemoryRouter><Screen /></MemoryRouter>);
      const el = await screen.findByText(formatDateTime(ROW.created_at));
      expect(el.closest("[dir]")?.getAttribute("dir")).toBe("ltr");
    });
  }
});
