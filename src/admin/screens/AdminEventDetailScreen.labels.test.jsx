// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen } from "../../test/dom.js";

/* סב39. The event detail screen had "כלה" / "חתן" hard-coded for the guest
 * side column and the two name fields. Support reads this screen to answer
 * the host, so it must use the event's own words — getSideLabels(), the same
 * function the customer app uses. */
let EVENT = null;
function builder() {
  const b = { select: () => b, eq: () => b, single: () => Promise.resolve({ data: EVENT, error: null }) };
  return b;
}
vi.mock("../../lib/supabase.js", () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => builder(), auth: { getUser: async () => ({ data: { user: { email: "admin@x.test" } } }), signOut: async () => ({}) } },
}));
const { default: AdminEventDetailScreen } = await import("./AdminEventDetailScreen.jsx");
const open = () => render(
  <MemoryRouter initialEntries={["/admin/events/e1"]}>
    <Routes><Route path="/admin/events/:eventId" element={<AdminEventDetailScreen />} /></Routes>
  </MemoryRouter>);

const row = (type, payload) => ({
  id: "e1", name: "האירוע", type, date: "2027-06-01", venue: "אולם", version: 2,
  guest_count: 2, table_count: 0, seated_pct: 0, created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z", profiles: { email: "h@x.test" },
  payload: { tables: [], seating: {}, constraints: [],
    guests: [{ id: "g1", name: "טל", side: "bride", count: 1 }, { id: "g2", name: "רון", side: "groom", count: 1 }],
    ...payload },
});

describe("admin event detail — sides and names in the event's own words", () => {
  it("a bar mitzvah lists its guests by family, not as the bride's and the groom's", async () => {
    EVENT = row("בר מצווה", { parentsType: "mother-father" });
    open();
    expect(await screen.findByText("משפחת האם")).toBeTruthy();
    expect(screen.getByText("משפחת האב")).toBeTruthy();
    expect(screen.queryByText("כלה")).toBeNull();
    expect(screen.queryByText("חתן")).toBeNull();
  });

  it("two brides: the second name is not labelled 'חתן'", async () => {
    EVENT = row("חתונה", { coupleType: "bride-bride", brideName: "דנה", groomName: "מיה" });
    open();
    expect(await screen.findByText("שם הכלה השנייה")).toBeTruthy();
    expect(screen.queryByText("חתן")).toBeNull();
    // and the sides use the couple's names, as in the customer app
    expect(screen.getByText("צד דנה")).toBeTruthy();
    expect(screen.getByText("צד מיה")).toBeTruthy();
  });

  it("a host's own side labels win", async () => {
    EVENT = row("אירוע עסקי", { sideLabels: { bride: "מטה", groom: "סניפים" } });
    open();
    expect(await screen.findByText("מטה")).toBeTruthy();
    expect(screen.getByText("סניפים")).toBeTruthy();
  });
});
