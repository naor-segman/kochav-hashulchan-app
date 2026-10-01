// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../../test/dom.js";

/* AX9. Seven admin screens had no <h1> at all — the title was a styled span
 * in the top bar, so a screen-reader user jumping by heading landed on a
 * section h2 with nothing naming the page. The title IS the h1 now (its look
 * unchanged: measured identical font, size and box at 390 and 1280). */
function builder() {
  const b = {
    select: () => b, order: () => b, limit: () => b, range: () => b, in: () => b, eq: () => b,
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (res, rej) => Promise.resolve({ data: [], count: 0, error: null }).then(res, rej),
  };
  return b;
}
vi.mock("../../lib/supabase.js", () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => builder(), auth: { getUser: async () => ({ data: { user: { email: "admin@x.test" } } }), signOut: async () => ({}) } },
}));

const SCREENS = {
  Dashboard:     "לוח בקרה",
  Users:         "ניהול משתמשים",
  Events:        "כל האירועים",
  Templates:     "ניהול תבניות",
  Subscriptions: "רכישות ותשלומים",
  Activity:      "יומן פעילות",
  Settings:      "הגדרות מערכת",
};

describe("admin screens — each names itself with one h1", () => {
  for (const [name, title] of Object.entries(SCREENS)) {
    it(name, async () => {
      const { default: Screen } = await import(`./Admin${name}Screen.jsx`);
      render(<MemoryRouter><Screen /></MemoryRouter>);
      const h1s = await screen.findAllByRole("heading", { level: 1 });
      expect(h1s.map(h => h.textContent)).toEqual([title]);
    });
  }
});
