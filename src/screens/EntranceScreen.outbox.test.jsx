// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, waitFor, cleanup } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";

/* Fifth review 30.9: an app update reloaded the greeter's tab (nothing had
 * been typed, so it counted as safe) and the queued retries were gone — the
 * "לא נשמר: …" message vanished and the check-in was never sent. */

const mark = vi.fn(async () => { throw new Error("offline"); });
vi.mock("../utils/publicTokens.js", () => ({
  fetchHostessData: vi.fn(async () => ({
    cloudId: "c1", name: "החתונה", writesOpen: true,
    guests: [{ id: "g1", name: "יעל כהן", count: 1 }], tables: [], seating: {},
  })),
  markArrivalByToken: (...a) => mark(...a),
}));
vi.mock("../utils/scanPayload.js", async (orig) => ({ ...(await orig()), isScanSupported: () => true }));
vi.mock("../components/ui/QrScanner.jsx", () => ({
  default: ({ onScan }) => <button onClick={() => onScan("g1")}>fake-scan</button>,
}));
const { default: EntranceScreen } = await import("./EntranceScreen.jsx");
const mount = () => render(
  <AuthProvider><MemoryRouter initialEntries={["/entrance/tok12345678"]}><Routes>
    <Route path="/entrance/:token" element={<EntranceScreen mode="token" />} />
  </Routes></MemoryRouter></AuthProvider>);

beforeEach(() => { sessionStorage.clear(); localStorage.setItem("kochav_tour_v1", JSON.stringify({ entrance: 1 })); });

describe("the greeter's retry queue survives a reload", () => {
  it("a failed check-in is still queued, and shown, after the tab reloads", async () => {
    mount();
    fireEvent.click(await screen.findByText(/סרקו קוד/));
    fireEvent.click(screen.getByText("fake-scan"));
    await waitFor(() => expect(mark).toHaveBeenCalled());
    await screen.findByText(/לא נשמר: יעל כהן/);
    cleanup();                                   // the reload
    mount();
    expect(await screen.findByText(/לא נשמר: יעל כהן/)).toBeTruthy();
  });
});
