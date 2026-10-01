// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../../test/dom.js";

/* WORKPLAN 122 (1.10): since 28.9 a purchase unlocks one event, and the
 * purchases screen could not say which. */
const ROWS = [
  { id: "s1", plan: "pro", status: "active", created_at: "2026-09-30T10:00:00Z", event_id: "e1", is_manually_managed: false,
    profiles: { email: "a@x.test" }, events: { name: "החתונה של דנה" } },
  { id: "s2", plan: "pro", status: "active", created_at: "2026-09-29T10:00:00Z", event_id: null, is_manually_managed: true,
    profiles: { email: "b@x.test" }, events: null },
  { id: "s3", plan: "pro", status: "active", created_at: "2026-09-28T10:00:00Z", event_id: null, is_manually_managed: false,
    profiles: { email: "c@x.test" }, events: null },
];
let REFUSE_EMBED = false;
function builder() {
  const q = { head: false, cols: "" };
  const b = {
    select: (c, opts) => { q.cols = c; if (opts?.head) q.head = true; return b; },
    order: () => b, limit: () => b, eq: () => b,
    then: (res, rej) => Promise.resolve(
      q.head ? { data: null, count: ROWS.length, error: null }
      : REFUSE_EMBED && q.cols.includes("events!") ? { data: null, error: { message: "Could not find a relationship" } }
      : { data: ROWS, error: null }).then(res, rej),
  };
  return b;
}
vi.mock("../../lib/supabase.js", () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => builder(), auth: { getUser: async () => ({ data: { user: { email: "admin@x.test" } } }), signOut: async () => ({}) } },
}));
const { default: AdminSubscriptionsScreen } = await import("./AdminSubscriptionsScreen.jsx");

describe("admin purchases — which event a purchase unlocks", () => {
  it("shows the event, an admin comp, or that it unlocks nothing", async () => {
    render(<MemoryRouter><AdminSubscriptionsScreen /></MemoryRouter>);
    expect(await screen.findByText("החתונה של דנה")).toBeTruthy();
    expect(screen.getByText("כל החשבון (ידני)")).toBeTruthy();
    expect(screen.getByText("— לא פותח אירוע")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "אירוע" })).toBeTruthy();
  });

  it("if the server refuses the event embed, the list still loads", async () => {
    REFUSE_EMBED = true;
    render(<MemoryRouter><AdminSubscriptionsScreen /></MemoryRouter>);
    expect(await screen.findByText("a@x.test")).toBeTruthy();
    REFUSE_EMBED = false;
  });
});
