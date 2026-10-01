// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";

/* ד2 — one code is one invitation, and an invitation for four is not four
 * people at the door. A scan of a family row marked every seat; it now opens
 * that family's panel so the greeter ticks who is here. A single seat is still
 * marked straight from the camera. */

const mark = vi.fn(async () => {});
let scanId = "fam";
vi.mock("../utils/publicTokens.js", () => ({
  fetchHostessData: vi.fn(async () => ({
    cloudId: "c1", name: "החתונה", writesOpen: true,
    guests: [
      { id: "fam", name: "משפחת לוי", count: 4, companions: ["רותי", "נועה", "איתי"] },
      { id: "solo", name: "יעל כהן", count: 1 },
    ],
    tables: [], seating: {},
  })),
  markArrivalByToken: (...a) => mark(...a),
}));
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: null, loading: false }),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../utils/scanPayload.js", async (orig) => ({ ...(await orig()), isScanSupported: () => true }));
vi.mock("../components/ui/QrScanner.jsx", () => ({
  default: ({ onScan }) => <button onClick={() => onScan(scanId)}>fake-scan</button>,
}));
const { default: EntranceScreen } = await import("./EntranceScreen.jsx");

const mount = () => render(<MemoryRouter initialEntries={["/entrance/tok12345678"]}><Routes>
  <Route path="/entrance/:token" element={<EntranceScreen mode="token" />} />
</Routes></MemoryRouter>);

beforeEach(() => { sessionStorage.clear(); localStorage.setItem("kochav_orientation_v1", "1"); mark.mockClear(); });

describe("scanning a family row", () => {
  it("opens the family's panel and marks nobody", async () => {
    scanId = "fam";
    mount();
    fireEvent.click(await screen.findByText(/סרקו קוד/));
    fireEvent.click(screen.getByText("fake-scan"));
    expect(await screen.findByText("משפחת לוי — 4 מקומות: סמנו מי מהם הגיע")).toBeInTheDocument();
    expect(screen.getByText("0 מתוך 4 הגיעו")).toBeInTheDocument();          // the panel is open
    expect(screen.queryByText("fake-scan")).toBeNull();                       // camera closed
    expect(mark).not.toHaveBeenCalled();
    // ticking one person sends exactly that seat
    fireEvent.click(screen.getByRole("button", { name: /רותי/ }));
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(1));
    expect(mark.mock.calls[0][2]).toEqual([1]);
  });

  it("a single seat is still marked straight from the camera", async () => {
    scanId = "solo";
    mount();
    fireEvent.click(await screen.findByText(/סרקו קוד/));
    fireEvent.click(screen.getByText("fake-scan"));
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(1));
    expect(mark.mock.calls[0][2]).toEqual([0]);
    expect(await screen.findByText("יעל כהן — ההגעה סומנה")).toBeInTheDocument();
  });
});
