// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";

/* Fifth review 30.9: a guest who had declined was scanned in with
 * "2 סומנו כהגיעו" and nothing told the greeter. */
vi.mock("../utils/publicTokens.js", () => ({
  fetchHostessData: vi.fn(async () => ({
    cloudId: "c1", name: "החתונה", writesOpen: true,
    guests: [{ id: "g1", name: "יעל כהן", count: 2, rsvp: "declined" }], tables: [], seating: {},
  })),
  markArrivalByToken: vi.fn(async () => {}),
}));
vi.mock("../utils/scanPayload.js", async (orig) => ({ ...(await orig()), isScanSupported: () => true }));
vi.mock("../components/ui/QrScanner.jsx", () => ({
  default: ({ onScan }) => <button onClick={() => onScan("g1")}>fake-scan</button>,
}));
const { default: EntranceScreen } = await import("./EntranceScreen.jsx");

describe("scanning a guest who declined", () => {
  it("warns the greeter", async () => {
    localStorage.setItem("kochav_tour_v1", JSON.stringify({ entrance: 1 }));
    render(<AuthProvider><MemoryRouter initialEntries={["/entrance/tok12345678"]}><Routes>
      <Route path="/entrance/:token" element={<EntranceScreen mode="token" />} />
    </Routes></MemoryRouter></AuthProvider>);
    fireEvent.click(await screen.findByText(/סרקו קוד/));
    fireEvent.click(screen.getByText("fake-scan"));
    expect(await screen.findByText(/סימנו שלא יגיעו/)).toBeTruthy();
  });
});
