// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";

/* סב35e — at 800 guests one letter matched hundreds of rows and the door drew
 * every one, on a phone, on every keystroke; the by-table search re-ran the
 * guest search per table. The list now draws 50 and counts the rest. */

const N = 120;
const EV = {
  id: "e1", name: "החתונה", cloudId: null, tokens: { hostess: "h1234567" },
  tables: [...Array(12)].map((_, i) => ({ id: "t" + i, name: "שולחן " + (i + 1), capacity: 10, shape: "round" })),
  guests: [...Array(N)].map((_, i) => ({ id: "g" + i, name: "משפחת כהן " + i, count: 1, rsvp: "confirmed" })),
  seating: Object.fromEntries([...Array(N)].map((_, i) => ["g" + i, "t" + (i % 12)])),
};
const { default: EntranceScreen } = await import("./EntranceScreen.jsx");

const open = () => {
  localStorage.setItem("kochav_orientation_v1", "1");
  return render(<AuthProvider><MemoryRouter initialEntries={["/events/e1/entrance"]}><Routes>
    <Route path="/events/:eventId/entrance" element={
      <EntranceScreen mode="owner" events={[EV]} loading={false} patchEventById={vi.fn()} />} />
  </Routes></MemoryRouter></AuthProvider>);
};

describe("the door with a big list", () => {
  it("draws 50 matches and counts the rest", () => {
    const { container } = open();
    fireEvent.change(screen.getByLabelText("חיפוש אורח"), { target: { value: "כהן" } });
    const rows = container.querySelectorAll("[class*='rowName']");
    expect(rows.length).toBe(50);
    expect(screen.getByText(`ועוד ${N - 50} — הקלידו עוד אותיות כדי לצמצם`)).toBeInTheDocument();
  });

  it("one more letter narrows it, and the count goes away", () => {
    const { container } = open();
    fireEvent.change(screen.getByLabelText("חיפוש אורח"), { target: { value: "כהן 11" } });
    // "כהן 11", "כהן 110".."כהן 119"
    expect(container.querySelectorAll("[class*='rowName']").length).toBe(11);
    expect(screen.queryByText(/הקלידו עוד אותיות/)).toBeNull();
  });

  it("by table: a guest's name finds their table", () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: /לפי שולחן/ }));
    fireEvent.change(screen.getByLabelText("חיפוש שולחן"), { target: { value: "כהן 13" } });
    // g13 sits at t1 ("שולחן 2"); nothing else matches "כהן 13".
    const names = [...document.querySelectorAll("[class*='tableName']")].map(e => e.textContent);
    expect(names).toEqual(["שולחן 2"]);
  });
});
