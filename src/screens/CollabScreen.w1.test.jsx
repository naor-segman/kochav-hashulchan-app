// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, act } from "../test/dom.js";

/* The shared family table:
 *  - 71c: a delete that failed held the row as "being edited" for good, so the
 *    3-second poll could never again show what another relative changed in it;
 *  - 89 #8: a new row started on the bride's side, so the groom's family's rows
 *    were filed on the wrong side unless someone noticed the select;
 *  - 89: the Excel button failed silently when the spreadsheet chunk did not load. */
let serverName = "משפחת כהן";
const upsert = vi.fn(async () => {});
const del = vi.fn(async () => { throw new Error("offline"); });
const exportFn = vi.fn(async () => { throw new Error("Failed to fetch dynamically imported module"); });
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchCollabEvent: async () => ({ cloudId: "c1", name: "החתונה", type: "חתונה", brideName: "דנה", groomName: "יוסי" }),
  fetchCollabGuests: async () => [{ id: "r1", name: serverName, phone: "050", side: "bride", guest_group: "משפחה", guests_count: 1, companions: [] }],
  deleteCollabGuest: (...a) => del(...a),
  upsertCollabGuest: (...a) => upsert(...a),
}));
vi.mock("../utils/exportHelpers.js", async (orig) => ({ ...(await orig()), exportCollabTableToExcel: (...a) => exportFn(...a) }));
const { default: CollabScreen } = await import("./CollabScreen.jsx");
const open = () => render(<MemoryRouter initialEntries={["/collab/tok12345"]}><Routes>
  <Route path="/collab/:token" element={<CollabScreen />} />
</Routes></MemoryRouter>);

afterEach(() => vi.useRealTimers());

describe("shared table", () => {
  it("a row whose delete failed is not frozen: the poll still updates it (71c)", async () => {
    vi.useFakeTimers();
    open();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByLabelText("מחיקת שורה"));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(/המחיקה של משפחת כהן לא נשמרה/)).toBeTruthy();
    serverName = "משפחת כהן-לוי";                              // another relative renames it
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(screen.getByDisplayValue("משפחת כהן-לוי")).toBeTruthy();
  });

  it("typing not yet saved when the delete failed is still saved", async () => {
    vi.useFakeTimers();
    serverName = "משפחת כהן";
    open();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByDisplayValue("משפחת כהן"), { target: { value: "משפחת כהנא" } });
    fireEvent.click(screen.getByLabelText("מחיקת שורה"));        // before the 600ms save
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(upsert).toHaveBeenCalledWith("tok12345", expect.objectContaining({ id: "r1", name: "משפחת כהנא" }));
  });

  it("a new row has no side until one is chosen, and says it is missing (89 #8)", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /הוסיפו שורה/ }));
    const sideSelects = screen.getAllByLabelText("צד");
    expect(sideSelects[0].value).toBe("");
    expect(screen.getAllByText(/חסר:.*צד/).length).toBeGreaterThan(0);
  });

  it("an Excel download that fails says so (89)", async () => {
    open();
    await screen.findByDisplayValue(/משפחת כהן/);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /הורדת הטבלה לאקסל/ })); });
    expect(exportFn).toHaveBeenCalled();
    expect((await screen.findByRole("alert")).textContent).toMatch(/ההורדה לא הצליחה/);
  });
});
